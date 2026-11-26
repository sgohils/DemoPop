import { OFFERS } from "../shared/billing";
import { stripeRequest } from "./stripe";
import { STRIPE_WEBHOOK_EVENTS, validateCatalogPrice } from "./billing-setup";

type Environment = Record<string, string | undefined>;
type Check = { name: string; ok: boolean; detail: string };
const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "APP_ORIGIN",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PACKAGE_PRICE_ID",
  "STRIPE_STUDIO_PRICE_ID",
] as const;

// Operator-only diagnostics. Returned text deliberately contains no credentials,
// Stripe responses, customer records, database rows, or payment information.
export async function billingReadiness(
  env: Environment,
  request = stripeRequest,
  fetcher = fetch,
) {
  const checks: Check[] = required.map((name) => ({
    name,
    ok: Boolean(env[name]),
    detail: env[name] ? "Configured" : "Missing",
  }));
  checks.push({
    name: "Paid export enforcement",
    ok: env.DEMOPOP_BILLING_ENABLED !== "0",
    detail:
      env.DEMOPOP_BILLING_ENABLED === "0"
        ? "Disabled by DEMOPOP_BILLING_ENABLED=0"
        : "Enabled",
  });
  let origin: URL | undefined;
  try {
    origin = new URL(env.APP_ORIGIN || "");
    if (
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash ||
      !(
        origin.protocol === "https:" ||
        (origin.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(origin.hostname))
      )
    )
      throw new Error();
    checks.push({
      name: "Application origin",
      ok: true,
      detail:
        origin.protocol === "https:"
          ? "Canonical HTTPS origin"
          : "Local development origin",
    });
  } catch {
    origin = undefined;
    checks.push({
      name: "Application origin",
      ok: false,
      detail:
        "Set APP_ORIGIN to an HTTPS origin or local development origin, without a path",
    });
  }
  const mode = /^(?:sk|rk)_test_/.test(env.STRIPE_SECRET_KEY || "")
    ? "test"
    : /^(?:sk|rk)_live_/.test(env.STRIPE_SECRET_KEY || "")
      ? "live"
      : null;
  if (env.STRIPE_SECRET_KEY)
    checks.push({
      name: "Stripe key mode",
      ok: !!mode,
      detail: mode
        ? `${mode} mode`
        : "Use a Stripe server secret or restricted key",
    });
  if (mode && origin) {
    for (const offer of Object.keys(OFFERS) as (keyof typeof OFFERS)[]) {
      const id =
        env[
          offer === "package"
            ? "STRIPE_PACKAGE_PRICE_ID"
            : "STRIPE_STUDIO_PRICE_ID"
        ];
      if (!id) continue;
      try {
        const price = await request(`prices/${encodeURIComponent(id)}`);
        validateCatalogPrice(price, offer, mode === "live");
        checks.push({
          name: `${OFFERS[offer].name} price`,
          ok: true,
          detail: `Verified $${OFFERS[offer].dollars} USD${OFFERS[offer].recurring ? " monthly" : " once"} in ${mode} mode`,
        });
      } catch {
        checks.push({
          name: `${OFFERS[offer].name} price`,
          ok: false,
          detail:
            "Could not verify the configured price, amount, recurrence and key mode",
        });
      }
    }
    try {
      const configured = env.STRIPE_PORTAL_CONFIGURATION_ID;
      const portal = configured
        ? await request(
            `billing_portal/configurations/${encodeURIComponent(configured)}`,
          )
        : (
            await request(
              "billing_portal/configurations?is_default=true&active=true&limit=1",
            )
          ).data?.[0];
      const features = portal?.features;
      const valid =
        portal?.active === true &&
        portal.livemode === (mode === "live") &&
        features?.invoice_history?.enabled === true &&
        features?.payment_method_update?.enabled === true &&
        features?.subscription_cancel?.enabled === true &&
        features.subscription_cancel.mode === "at_period_end" &&
        features?.subscription_update?.enabled === false;
      checks.push({
        name: "Customer portal",
        ok: valid,
        detail: valid
          ? "Receipts, payment methods and end-of-period cancellation enabled"
          : "Configure invoice history, payment methods and cancellation; disable product/quantity switching",
      });
    } catch {
      checks.push({
        name: "Customer portal",
        ok: false,
        detail: "Could not verify the portal configuration",
      });
    }
    if (env.STRIPE_WEBHOOK_ENDPOINT_ID && origin.protocol === "https:") {
      try {
        const endpoint = await request(
          `webhook_endpoints/${encodeURIComponent(env.STRIPE_WEBHOOK_ENDPOINT_ID)}`,
        );
        const events = new Set(endpoint.enabled_events);
        const valid =
          endpoint.status === "enabled" &&
          endpoint.url === `${origin.origin}/api/billing/webhook` &&
          endpoint.livemode === (mode === "live") &&
          STRIPE_WEBHOOK_EVENTS.every(
            (event) => events.has(event) || events.has("*"),
          );
        checks.push({
          name: "Webhook endpoint",
          ok: valid,
          detail: valid
            ? "Canonical URL, mode and required events verified"
            : "Webhook URL, mode, enabled state or events do not match",
        });
      } catch {
        checks.push({
          name: "Webhook endpoint",
          ok: false,
          detail: "Could not verify the configured webhook endpoint",
        });
      }
    } else {
      checks.push({
        name: "Webhook delivery",
        ok: Boolean(env.STRIPE_WEBHOOK_SECRET),
        detail:
          origin.protocol === "http:"
            ? "Run the Stripe CLI listener locally; signing-secret presence alone does not verify delivery"
            : "Set STRIPE_WEBHOOK_ENDPOINT_ID to verify registration; signing-secret presence alone does not verify delivery",
      });
    }
  }
  if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const base = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
      if (
        base.username ||
        base.password ||
        base.pathname !== "/" ||
        base.search ||
        base.hash ||
        !(
          base.protocol === "https:" ||
          (base.protocol === "http:" &&
            ["localhost", "127.0.0.1"].includes(base.hostname))
        )
      )
        throw new Error();
      const tables = [
        "billing_accounts?select=owner_id&limit=0",
        "billing_checkouts?select=id,retired_at,return_project_id&limit=0",
        "billing_grants?select=id&limit=0",
        "project_access?select=id&limit=0",
      ];
      const responses = await Promise.all(
        tables.map((table) =>
          fetcher(`${base.origin}/rest/v1/${table}`, {
            headers: {
              apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
              Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            },
            cache: "no-store",
            redirect: "error",
            signal: AbortSignal.timeout(15000),
          }),
        ),
      );
      const valid = responses.every((response) => response.ok);
      await Promise.all(responses.map((response) => response.body?.cancel()));
      checks.push({
        name: "Billing database schema",
        ok: valid,
        detail: valid
          ? "Billing tables and migration 010 columns reachable with the service role"
          : "Apply Supabase migrations through 010 and verify service-role access",
      });
    } catch {
      checks.push({
        name: "Billing database schema",
        ok: false,
        detail:
          "Could not verify Supabase; check the URL, service-role key and migrations through 010",
      });
    }
  }
  return { ready: checks.every((check) => check.ok), mode, checks };
}
