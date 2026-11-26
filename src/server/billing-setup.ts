import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";
import { OFFERS, type Offer } from "../shared/billing";
import { STRIPE_API_VERSION, stripeRequest } from "./stripe";

export type SetupEnvironment = Record<string, string | undefined>;
type Request = typeof stripeRequest;

export const STRIPE_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "invoice.paid",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "charge.refunded",
  "charge.dispute.created",
] as const;

const priceSchema = z.object({
  id: z.string().regex(/^price_[A-Za-z0-9_]+$/),
  active: z.boolean(),
  livemode: z.boolean(),
  currency: z.string(),
  unit_amount: z.number().nullable(),
  type: z.string(),
  billing_scheme: z.string(),
  transform_quantity: z.unknown().nullable(),
  custom_unit_amount: z.unknown().nullable(),
  recurring: z
    .object({
      interval: z.string(),
      interval_count: z.number(),
      usage_type: z.string(),
    })
    .nullable(),
});

/** Check the canonical Stripe object, never just an ID or a lookup key. */
export function validateCatalogPrice(
  value: unknown,
  offer: Offer,
  expectedLive?: boolean,
): void {
  const parsed = priceSchema.safeParse(value);
  if (!parsed.success)
    throw new Error(`The ${OFFERS[offer].name} Stripe price is invalid.`);
  const price = parsed.data;
  if (
    !price.active ||
    price.currency !== "usd" ||
    price.unit_amount !== OFFERS[offer].dollars * 100 ||
    price.billing_scheme !== "per_unit" ||
    price.transform_quantity != null ||
    price.custom_unit_amount != null ||
    (expectedLive !== undefined && price.livemode !== expectedLive) ||
    (offer === "studio"
      ? price.type !== "recurring" ||
        price.recurring?.interval !== "month" ||
        price.recurring.interval_count !== 1 ||
        price.recurring.usage_type !== "licensed"
      : price.type !== "one_time" || price.recurring !== null)
  )
    throw new Error(
      `The ${OFFERS[offer].name} Stripe price does not match the configured offer and mode. Existing prices were not changed.`,
    );
}

const objectSchema = z.object({ id: z.string() }).passthrough();
const listSchema = z.object({
  data: z.array(objectSchema),
  has_more: z.boolean(),
});
type StripeObject = z.infer<typeof objectSchema>;

// Complete the list before deciding an object is absent. Never create a
// duplicate because a matching object was on a later page or a response broke.
async function listAll(request: Request, path: string) {
  const results: StripeObject[] = [];
  let cursor = "";
  const seen = new Set<string>();
  for (let page = 0; page < 100; page++) {
    const separator = path.includes("?") ? "&" : "?";
    const parsed = listSchema.safeParse(
      await request(
        `${path}${separator}limit=100${cursor ? `&starting_after=${encodeURIComponent(cursor)}` : ""}`,
      ),
    );
    if (!parsed.success)
      throw new Error(
        "Stripe returned an incomplete setup listing. No duplicate was created.",
      );
    results.push(...parsed.data.data);
    if (!parsed.data.has_more) return results;
    const last = parsed.data.data.at(-1)?.id;
    if (!last || seen.has(last))
      throw new Error(
        "Stripe setup pagination could not be completed. No duplicate was created.",
      );
    seen.add(last);
    cursor = last;
  }
  throw new Error(
    "Stripe setup listing is too large to verify safely. Configure the existing IDs explicitly.",
  );
}

function setupOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      (url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
        ))
    )
      throw new Error();
    return url;
  } catch {
    throw new Error(
      "APP_ORIGIN must be a canonical HTTPS origin or a local HTTP origin, without a path or credentials.",
    );
  }
}

function isPublicHttps(url: URL | null): boolean {
  if (!url || url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  // Stripe's endpoint must be reachable from its servers. A public DNS name is
  // required here; local/private addresses should use Stripe CLI forwarding.
  return (
    host.includes(".") &&
    !isIP(host.replace(/^\[|\]$/g, "")) &&
    ![
      "localhost",
      ".localhost",
      ".local",
      ".internal",
      ".test",
      ".invalid",
    ].some((suffix) => host === suffix || host.endsWith(suffix))
  );
}

const portalSchema = z.object({
  id: z.string().regex(/^bpc_[A-Za-z0-9_]+$/),
  active: z.literal(true),
  livemode: z.literal(false),
  metadata: z.object({ app: z.literal("demopop") }),
  features: z.object({
    invoice_history: z.object({ enabled: z.literal(true) }),
    payment_method_update: z.object({ enabled: z.literal(true) }),
    subscription_cancel: z.object({
      enabled: z.literal(true),
      mode: z.literal("at_period_end"),
    }),
    subscription_update: z.object({ enabled: z.literal(false) }),
  }),
});

/** Provision only app-specific test objects; never edit prices or account defaults. */
export async function setupTestBilling(
  env: SetupEnvironment,
  request: Request = stripeRequest,
): Promise<{ updates: Record<string, string>; notices: string[] }> {
  if (!/^(sk|rk)_test_[A-Za-z0-9_]+$/.test(env.STRIPE_SECRET_KEY || ""))
    throw new Error(
      "Stripe setup requires a test-mode secret or restricted key. Live-mode setup is refused.",
    );
  // stripeRequest authenticates from process.env. Do not let a caller validate a
  // test key while the default transport would authenticate with another key.
  if (
    request === stripeRequest &&
    env.STRIPE_SECRET_KEY !== process.env.STRIPE_SECRET_KEY
  )
    throw new Error(
      "Load the test-mode key into the process environment before running Stripe setup.",
    );
  const origin = setupOrigin(env.APP_ORIGIN);
  const updates: Record<string, string> = {};
  const notices: string[] = [];
  const safeRequest: Request = async (...args) => {
    try {
      return await request(...args);
    } catch {
      throw new Error(
        "Stripe setup request failed. Verify your test key and its permissions.",
      );
    }
  };
  for (const offer of ["package", "studio"] as const) {
    const variable =
      offer === "package"
        ? "STRIPE_PACKAGE_PRICE_ID"
        : "STRIPE_STUDIO_PRICE_ID";
    const configured = env[variable];
    if (configured) {
      if (!/^price_[A-Za-z0-9_]+$/.test(configured))
        throw new Error(`${variable} must contain a Stripe price ID.`);
      validateCatalogPrice(
        await safeRequest(`prices/${encodeURIComponent(configured)}`),
        offer,
        false,
      );
      continue;
    }
    const lookup =
      offer === "package"
        ? "demopop_launch_package_usd_v1"
        : "demopop_studio_usd_monthly_v1";
    const found = await listAll(safeRequest, `prices?lookup_keys[]=${lookup}`);
    if (found.length > 1)
      throw new Error(
        "Multiple Stripe prices matched the DemoPop lookup key. Configure a validated price ID explicitly.",
      );
    let price: unknown = found[0];
    if (!price) {
      const fields = new URLSearchParams({
        currency: "usd",
        unit_amount: String(OFFERS[offer].dollars * 100),
        "product_data[name]": `DemoPop ${OFFERS[offer].name}`,
        "product_data[metadata][app]": "demopop",
        "metadata[app]": "demopop",
        lookup_key: lookup,
      });
      if (OFFERS[offer].recurring) {
        fields.set("recurring[interval]", "month");
        fields.set("recurring[interval_count]", "1");
        fields.set("recurring[usage_type]", "licensed");
      }
      price = await safeRequest("prices", fields, `demopop:price:${lookup}`);
    }
    validateCatalogPrice(price, offer, false);
    updates[variable] = priceSchema.parse(price).id;
  }

  const portalId = env.STRIPE_PORTAL_CONFIGURATION_ID;
  if (portalId) {
    if (
      !/^bpc_[A-Za-z0-9_]+$/.test(portalId) ||
      !portalSchema.safeParse(
        await safeRequest(
          `billing_portal/configurations/${encodeURIComponent(portalId)}`,
        ),
      ).success
    )
      throw new Error(
        "STRIPE_PORTAL_CONFIGURATION_ID must reference an active DemoPop test configuration with the supported billing features. Existing configurations were not changed.",
      );
  } else {
    const candidates = await listAll(
      safeRequest,
      "billing_portal/configurations?active=true",
    );
    let portal = candidates.find(
      (candidate) => portalSchema.safeParse(candidate).success,
    );
    if (!portal) {
      const fields = new URLSearchParams({
        "metadata[app]": "demopop",
        "metadata[version]": "v1",
        "business_profile[headline]": "Manage your DemoPop billing",
        "features[invoice_history][enabled]": "true",
        "features[payment_method_update][enabled]": "true",
        "features[subscription_cancel][enabled]": "true",
        "features[subscription_cancel][mode]": "at_period_end",
        "features[subscription_cancel][proration_behavior]": "none",
        "features[subscription_update][enabled]": "false",
      });
      const created = portalSchema.safeParse(
        await safeRequest(
          "billing_portal/configurations",
          fields,
          "demopop:portal:test:v1",
        ),
      );
      if (!created.success)
        throw new Error(
          "Stripe did not return the expected DemoPop test portal configuration.",
        );
      portal = created.data;
    }
    updates.STRIPE_PORTAL_CONFIGURATION_ID = portal.id;
  }

  if (env.STRIPE_WEBHOOK_SECRET) {
    notices.push(
      "The configured webhook signing secret was preserved. Verify its endpoint and event selection with billing:check.",
    );
  } else if (!origin || !isPublicHttps(origin)) {
    notices.push(
      `For local testing, run Stripe CLI listen with --forward-to ${origin?.origin || "http://127.0.0.1:3001"}/api/billing/webhook and save its signing secret as STRIPE_WEBHOOK_SECRET. Adjust the port to match your app.`,
    );
  } else {
    const endpointUrl = `${origin.origin}/api/billing/webhook`;
    const endpoints = (await listAll(safeRequest, "webhook_endpoints")).filter(
      (endpoint) => endpoint.url === endpointUrl,
    );
    if (endpoints.length > 1)
      throw new Error(
        "Multiple webhook endpoints already target this app. Select one in Stripe and configure its signing secret; no endpoint was created.",
      );
    if (endpoints.length) {
      const endpoint = endpoints[0];
      if (
        !/^we_[A-Za-z0-9_]+$/.test(endpoint.id) ||
        endpoint.livemode !== false
      )
        throw new Error(
          "The existing webhook endpoint does not match test mode. No endpoint was created.",
        );
      updates.STRIPE_WEBHOOK_ENDPOINT_ID = endpoint.id;
      notices.push(
        "An existing webhook endpoint was reused. Stripe reveals its signing secret only at creation; copy the secret from Stripe Dashboard to STRIPE_WEBHOOK_SECRET. No duplicate was created.",
      );
      if (
        endpoint.status !== "enabled" ||
        endpoint.api_version !== STRIPE_API_VERSION ||
        !Array.isArray(endpoint.enabled_events) ||
        STRIPE_WEBHOOK_EVENTS.some(
          (event) => !(endpoint.enabled_events as unknown[]).includes(event),
        )
      )
        notices.push(
          "Update the existing webhook endpoint in Stripe Dashboard to enable the supported events and pinned API version before testing payments.",
        );
    } else {
      const fields = new URLSearchParams({
        url: endpointUrl,
        api_version: STRIPE_API_VERSION,
        description: "DemoPop test payments",
        "metadata[app]": "demopop",
      });
      for (const event of STRIPE_WEBHOOK_EVENTS)
        fields.append("enabled_events[]", event);
      const suffix = createHash("sha256")
        .update(endpointUrl)
        .digest("hex")
        .slice(0, 24);
      const endpoint = z
        .object({
          id: z.string().regex(/^we_[A-Za-z0-9_]+$/),
          livemode: z.literal(false),
          secret: z
            .string()
            .regex(/^whsec_[A-Za-z0-9_]+$/)
            .optional(),
        })
        .safeParse(
          await safeRequest(
            "webhook_endpoints",
            fields,
            `demopop:webhook:test:v1:${suffix}`,
          ),
        );
      if (!endpoint.success)
        throw new Error(
          "Stripe did not return the expected test webhook endpoint.",
        );
      updates.STRIPE_WEBHOOK_ENDPOINT_ID = endpoint.data.id;
      if (endpoint.data.secret)
        updates.STRIPE_WEBHOOK_SECRET = endpoint.data.secret;
      else
        notices.push(
          "The webhook endpoint was created without a recoverable signing secret. Copy its secret from Stripe Dashboard to STRIPE_WEBHOOK_SECRET before testing payments.",
        );
    }
  }
  return { updates, notices };
}
