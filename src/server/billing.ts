import "server-only";
import { z } from "zod";
import { adminClient, cloudConfigured } from "./supabase";
import {
  FREE_EXPORT_LIMIT,
  freeExportPeriod,
  OFFERS,
  PAYMENT_REQUIRED,
  type BillingSummary,
  type Offer,
} from "../shared/billing";
import {
  appOrigin,
  billingEnabled,
  BillingError,
  stripeConfigured,
  stripeId,
  stripeRequest,
  StripeRequestError,
} from "./stripe";

const checkoutAttemptSchema = z.object({
  id: z.uuid(),
  session_id: z.string().nullable(),
  created_at: z.string(),
  return_project_id: z.uuid().nullable(),
});

const reference = z
  .union([z.string(), z.object({ id: z.string() })])
  .nullable();
const sessionSchema = z.object({
  id: z.string(),
  customer: reference,
  subscription: reference.optional(),
  payment_intent: reference.optional(),
  client_reference_id: z.string().nullable(),
  metadata: z.object({ checkoutId: z.uuid().optional() }),
  mode: z.string(),
  payment_status: z.string(),
  status: z.string(),
  url: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
  amount_total: z.number().nullable().optional(),
  line_items: z
    .object({
      data: z.array(
        z.object({
          price: z.object({ id: z.string() }).nullable(),
          quantity: z.number().nullable(),
        }),
      ),
    })
    .optional(),
});
const subscriptionSchema = z.object({
  id: z.string(),
  customer: reference,
  status: z.string(),
  cancel_at_period_end: z.boolean(),
  metadata: z.object({ checkoutId: z.uuid().optional() }),
  latest_invoice: reference.optional(),
  items: z.object({
    data: z.array(z.object({ price: z.object({ id: z.string() }) })),
  }),
});
const invoiceSchema = z.object({
  id: z.string(),
  customer: reference,
  status: z.string().nullable(),
  billing_reason: z.string().nullable(),
  currency: z.string(),
  amount_paid: z.number(),
  paid_out_of_band: z.boolean().optional(),
  parent: z
    .object({
      subscription_details: z
        .object({ subscription: reference })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
  subscription: reference.optional(),
  lines: z.object({
    data: z.array(
      z.object({
        period: z.object({ start: z.number(), end: z.number() }),
        pricing: z
          .object({
            price_details: z
              .object({ price: z.string() })
              .nullable()
              .optional(),
          })
          .nullable()
          .optional(),
        price: z.object({ id: z.string() }).nullable().optional(),
        parent: z
          .object({
            subscription_item_details: z
              .object({ proration: z.boolean().optional() })
              .nullable()
              .optional(),
          })
          .nullable()
          .optional(),
      }),
    ),
  }),
  payments: z
    .object({
      data: z.array(
        z.object({
          payment: z
            .object({ payment_intent: reference.optional() })
            .optional(),
        }),
      ),
    })
    .optional(),
  payment_intent: reference.optional(),
});
function check(error: { message: string } | null) {
  if (error)
    throw new BillingError(
      503,
      "Your billing details could not be updated. Please retry shortly.",
    );
}
export function requireBilling() {
  if (!cloudConfigured() || !stripeConfigured())
    throw new BillingError(
      503,
      "Purchases are temporarily unavailable. You can still try the studio for free.",
    );
  appOrigin();
}
export async function recordFunnel(
  owner: string,
  event: string,
  project?: string,
) {
  // Analytics may never prevent a customer from completing paid work.
  try {
    await adminClient()
      .from("funnel_events")
      .insert({ owner_id: owner, event, project_id: project || null });
  } catch {
    /* best effort */
  }
}
export async function billingSummary(owner?: string): Promise<BillingSummary> {
  const period = freeExportPeriod();
  const base = {
    enabled: billingEnabled(),
    available: cloudConfigured() && stripeConfigured(),
    signedIn: Boolean(owner),
    remaining: 0,
    free: {
      limit: FREE_EXPORT_LIMIT,
      used: 0,
      remaining: FREE_EXPORT_LIMIT,
      resetsAt: period.resetsAt,
    },
    canManageBilling: false,
    subscription: null,
    projects: [],
  };
  if (!owner || !billingEnabled()) return base;
  const db = adminClient();
  const [account, grants, accesses, freeUsage] = await Promise.all([
    db
      .from("billing_accounts")
      .select("customer_id,subscription_status,cancel_at_period_end")
      .eq("owner_id", owner)
      .maybeSingle(),
    db
      .from("billing_grants")
      .select("allowance,used,starts_at,expires_at,revoked_at")
      .eq("owner_id", owner)
      .is("revoked_at", null),
    db
      .from("project_access")
      .select(
        "id,project_id,expires_at,projects!inner(name,deleted_at),billing_grants!inner(revoked_at),render_jobs(status)",
      )
      .eq("owner_id", owner)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
    db
      .from("free_export_usage")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", owner)
      .eq("failed", false)
      .gte("period_start", period.startsAt)
      .lt("period_start", period.resetsAt),
  ]);
  check(account.error);
  check(grants.error);
  check(accesses.error);
  check(freeUsage.error);
  const now = Date.now();
  return {
    ...base,
    free: {
      ...base.free,
      used: freeUsage.count || 0,
      remaining: Math.max(0, FREE_EXPORT_LIMIT - (freeUsage.count || 0)),
    },
    canManageBilling: Boolean(account.data?.customer_id),
    remaining: (grants.data || []).reduce(
      (n, g) =>
        n +
        (Date.parse(g.starts_at) <= now &&
        (!g.expires_at || Date.parse(g.expires_at) > now)
          ? g.allowance - g.used
          : 0),
      0,
    ),
    subscription: account.data?.subscription_status
      ? {
          status: account.data.subscription_status,
          cancelAtPeriodEnd: account.data.cancel_at_period_end,
        }
      : null,
    projects: (accesses.data || []).flatMap((a) => {
      const project = Array.isArray(a.projects) ? a.projects[0] : a.projects;
      const grant = Array.isArray(a.billing_grants)
        ? a.billing_grants[0]
        : a.billing_grants;
      return !project || project.deleted_at || grant?.revoked_at
        ? []
        : [
            {
              id: a.project_id,
              name: project.name as string,
              expiresAt: a.expires_at as string,
              exportsUsed: (a.render_jobs || []).filter(
                (j) => j.status !== "failed",
              ).length,
            },
          ];
    }),
  };
}
export async function checkout(
  owner: string,
  email: string | undefined,
  offer: Offer,
  projectId?: string,
) {
  requireBilling();
  const db = adminClient();
  // A return destination is only navigation context. Check it before creating
  // any payment attempt, account, provider customer or rate-limit receipt.
  if (projectId) {
    const project = await db
      .from("projects")
      .select("id")
      .eq("id", z.uuid().parse(projectId))
      .eq("owner_id", owner)
      .is("deleted_at", null)
      .maybeSingle();
    check(project.error);
    if (!project.data) throw new BillingError(404, "Project not found.");
  }
  const limited = await db.rpc("consume_request_limit", {
    p_owner: owner,
    p_key: "checkout",
    p_max: 15,
    p_seconds: 3600,
  });
  check(limited.error);
  if (!limited.data)
    throw new BillingError(429, "Please wait before opening another checkout.");
  const started = await db.rpc("begin_billing_checkout", {
    p_owner: owner,
    p_offer: offer,
    p_project: projectId ?? null,
  });
  if (started.error?.message.includes("Project not found"))
    throw new BillingError(404, "Project not found.");
  if (started.error?.message.includes("Subscription already"))
    throw new BillingError(
      409,
      "You already have a Studio subscription. Manage it from Billing.",
    );
  check(started.error);
  return checkoutAttempt(
    owner,
    email,
    offer,
    checkoutAttemptSchema.parse(started.data),
  );
}
async function checkoutAttempt(
  owner: string,
  email: string | undefined,
  offer: Offer,
  attempt: z.infer<typeof checkoutAttemptSchema>,
  canRestart = true,
): Promise<{ url: string }> {
  const db = adminClient();
  if (attempt.session_id) {
    const existing = sessionSchema.parse(
      await stripeRequest(
        `checkout/sessions/${encodeURIComponent(attempt.session_id)}`,
      ),
    );
    if (existing.status === "open" && existing.url)
      return { url: existing.url };
    throw new BillingError(
      409,
      "This checkout has finished. Refresh Billing to check your purchase, or try again in a few minutes.",
    );
  }
  const account = await db
    .from("billing_accounts")
    .select("customer_id")
    .eq("owner_id", owner)
    .single();
  check(account.error);
  let customer = account.data?.customer_id as string | null;
  if (!customer) {
    const created = z.object({ id: z.string() }).parse(
      await stripeRequest(
        "customers",
        new URLSearchParams({
          "metadata[ownerId]": owner,
          ...(email ? { email } : {}),
        }),
        `customer:${owner}`,
      ),
    );
    const saved = await db
      .from("billing_accounts")
      .update({ customer_id: created.id })
      .eq("owner_id", owner)
      .is("customer_id", null);
    check(saved.error);
    const reread = await db
      .from("billing_accounts")
      .select("customer_id")
      .eq("owner_id", owner)
      .single();
    check(reread.error);
    customer = reread.data?.customer_id;
  }
  if (!customer)
    throw new BillingError(
      503,
      "Your checkout could not be prepared. Please retry.",
    );
  const priceId =
    offer === "package"
      ? process.env.STRIPE_PACKAGE_PRICE_ID!
      : process.env.STRIPE_STUDIO_PRICE_ID!;
  const price = z
    .object({
      active: z.boolean(),
      currency: z.string(),
      unit_amount: z.number().nullable(),
      recurring: z
        .object({ interval: z.string(), interval_count: z.number() })
        .nullable(),
    })
    .parse(await stripeRequest(`prices/${encodeURIComponent(priceId)}`));
  if (
    !price.active ||
    price.currency !== "usd" ||
    price.unit_amount !== OFFERS[offer].dollars * 100 ||
    (offer === "studio"
      ? price.recurring?.interval !== "month" ||
        price.recurring.interval_count !== 1
      : price.recurring !== null)
  )
    throw new BillingError(
      503,
      "This offer is temporarily unavailable. Please try again later.",
    );
  const origin = appOrigin();
  // Reuse the destination captured with the attempt. Reconstructing it from a
  // later request would change Stripe's payload under the same idempotency key.
  const projectQuery = attempt.return_project_id
    ? `&project=${attempt.return_project_id}`
    : "";
  const fields = new URLSearchParams({
    mode: offer === "studio" ? "subscription" : "payment",
    customer,
    client_reference_id: owner,
    "metadata[checkoutId]": attempt.id,
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    success_url: `${origin}/billing?session_id={CHECKOUT_SESSION_ID}${projectQuery}`,
    cancel_url: `${origin}/pricing?canceled=1&plan=${offer}${projectQuery}`,
    expires_at: String(
      Math.floor(Date.parse(attempt.created_at) / 1000) + 3600,
    ),
  });
  if (offer === "studio")
    fields.set("subscription_data[metadata][checkoutId]", attempt.id);
  else fields.set("invoice_creation[enabled]", "true");
  let session: z.infer<typeof sessionSchema>;
  try {
    session = sessionSchema.parse(
      await stripeRequest(
        "checkout/sessions",
        fields,
        `checkout:${attempt.id}`,
      ),
    );
  } catch (error) {
    // An earlier request may have succeeded before its response was lost.
    // Always replay it unchanged first. Only Stripe's explicit expiry validation
    // rejection proves that this create attempt did not produce a session.
    if (
      canRestart &&
      error instanceof StripeRequestError &&
      error.stripeStatus === 400 &&
      error.stripeType === "invalid_request_error" &&
      error.stripeParam === "expires_at" &&
      Number(fields.get("expires_at")) - Math.floor(Date.now() / 1000) <= 1800
    ) {
      const restarted = await db.rpc("restart_billing_checkout", {
        p_owner: owner,
        p_checkout: attempt.id,
      });
      check(restarted.error);
      return checkoutAttempt(
        owner,
        email,
        offer,
        checkoutAttemptSchema.parse(restarted.data),
        false,
      );
    }
    throw error;
  }
  if (!session.url || !session.url.startsWith("https://checkout.stripe.com/"))
    throw new BillingError(503, "Checkout could not be opened. Please retry.");
  const saved = await db
    .from("billing_checkouts")
    .update({ session_id: session.id })
    .eq("id", attempt.id);
  check(saved.error);
  await recordFunnel(owner, "checkout_started");
  return { url: session.url };
}
async function attemptFor(
  checkoutId: string,
  customerId: string | null,
  offer?: Offer,
) {
  const db = adminClient();
  const attempt = await db
    .from("billing_checkouts")
    .select("id,owner_id,offer,session_id,return_project_id")
    .eq("id", checkoutId)
    .maybeSingle();
  check(attempt.error);
  if (!attempt.data || (offer && attempt.data.offer !== offer))
    throw new BillingError(400, "Unknown purchase.");
  const account = await db
    .from("billing_accounts")
    .select("customer_id")
    .eq("owner_id", attempt.data.owner_id)
    .single();
  check(account.error);
  if (!customerId || account.data?.customer_id !== customerId)
    throw new BillingError(400, "Purchase account does not match.");
  return attempt.data;
}
async function apply(
  event: string,
  owner: string,
  data: Record<string, unknown>,
) {
  const result = await adminClient().rpc("apply_billing_event", {
    p_event: event,
    p_owner: owner,
    p_data: data,
  });
  check(result.error);
}
async function fulfillInvoice(invoiceId: string, event: string) {
  const invoice = invoiceSchema.parse(
    await stripeRequest(
      `invoices/${encodeURIComponent(invoiceId)}?expand[]=payments.data.payment.payment_intent`,
    ),
  );
  const subId = stripeId(
    invoice.parent?.subscription_details?.subscription ?? invoice.subscription,
  );
  if (
    !subId ||
    invoice.status !== "paid" ||
    !["subscription_create", "subscription_cycle"].includes(
      invoice.billing_reason || "",
    )
  )
    return false;
  const sub = subscriptionSchema.parse(
    await stripeRequest(`subscriptions/${encodeURIComponent(subId)}`),
  );
  if (
    !sub.metadata.checkoutId ||
    !sub.items.data.some(
      (item) => item.price.id === process.env.STRIPE_STUDIO_PRICE_ID,
    )
  )
    return false;
  const attempt = await attemptFor(
    sub.metadata.checkoutId,
    stripeId(sub.customer),
    "studio",
  );
  if (
    stripeId(invoice.customer) !== stripeId(sub.customer) ||
    invoice.currency !== "usd" ||
    invoice.amount_paid < 7900 ||
    invoice.paid_out_of_band
  )
    return false;
  const line = invoice.lines.data.find(
    (l) =>
      (l.pricing?.price_details?.price ?? l.price?.id) ===
        process.env.STRIPE_STUDIO_PRICE_ID &&
      !l.parent?.subscription_item_details?.proration,
  );
  if (!line || line.period.end <= line.period.start)
    throw new BillingError(400, "Subscription period is unavailable.");
  const payment = stripeId(
    invoice.payments?.data[0]?.payment?.payment_intent ??
      invoice.payment_intent,
  );
  await apply(event, attempt.owner_id, {
    source: `studio:${sub.id}:${line.period.start}`,
    offer: "studio",
    startsAt: new Date(line.period.start * 1000).toISOString(),
    expiresAt: new Date(line.period.end * 1000).toISOString(),
    paymentRef: payment,
    checkoutId: attempt.id,
    subscriptionId: sub.id,
    status: sub.status,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    at: Math.floor(Date.now() / 1000),
  });
  return true;
}
export async function fulfillCheckout(
  sessionId: string,
  event: string,
  owner?: string,
) {
  const session = sessionSchema.parse(
    await stripeRequest(
      `checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=line_items`,
    ),
  );
  if (!session.metadata.checkoutId) {
    if (owner) throw new BillingError(404, "Purchase not found.");
    return { confirmed: false };
  }
  const attempt = await attemptFor(
    session.metadata.checkoutId,
    stripeId(session.customer),
  );
  if (
    (owner && owner !== attempt.owner_id) ||
    session.client_reference_id !== attempt.owner_id ||
    (attempt.session_id && attempt.session_id !== session.id)
  )
    throw new BillingError(404, "Purchase not found.");
  if (session.status !== "complete" || session.payment_status !== "paid")
    return { confirmed: false };
  const price =
    attempt.offer === "studio"
      ? process.env.STRIPE_STUDIO_PRICE_ID
      : process.env.STRIPE_PACKAGE_PRICE_ID;
  if (
    session.line_items?.data.length !== 1 ||
    session.line_items.data[0].price?.id !== price ||
    session.line_items.data[0].quantity !== 1
  )
    throw new BillingError(400, "Purchase offer does not match.");
  if (attempt.offer === "package") {
    if (
      session.mode !== "payment" ||
      session.currency !== "usd" ||
      session.amount_total !== 2900
    )
      throw new BillingError(400, "Purchase amount does not match.");
    await apply(event, attempt.owner_id, {
      source: `package:${session.id}`,
      offer: "package",
      paymentRef: stripeId(session.payment_intent),
      checkoutId: attempt.id,
    });
  } else {
    if (session.mode !== "subscription" || !stripeId(session.subscription))
      throw new BillingError(400, "Subscription unavailable.");
    const sub = subscriptionSchema.parse(
      await stripeRequest(
        `subscriptions/${encodeURIComponent(stripeId(session.subscription)!)}`,
      ),
    );
    await syncSubscription(sub.id, `${event}:subscription`);
    const invoice = stripeId(sub.latest_invoice);
    if (!invoice) return { confirmed: false };
    if (!(await fulfillInvoice(invoice, event))) return { confirmed: false };
  }
  if (owner && attempt.return_project_id) {
    const project = await adminClient()
      .from("projects")
      .select("id")
      .eq("id", attempt.return_project_id)
      .eq("owner_id", owner)
      .is("deleted_at", null)
      .maybeSingle();
    check(project.error);
    if (project.data)
      return { confirmed: true, projectId: project.data.id as string };
  }
  return { confirmed: true };
}
async function syncSubscription(id: string, event: string) {
  const sub = subscriptionSchema.parse(
    await stripeRequest(`subscriptions/${encodeURIComponent(id)}`),
  );
  if (
    !sub.metadata.checkoutId ||
    !sub.items.data.some(
      (item) => item.price.id === process.env.STRIPE_STUDIO_PRICE_ID,
    )
  )
    return;
  const attempt = await attemptFor(
    sub.metadata.checkoutId,
    stripeId(sub.customer),
    "studio",
  );
  await apply(event, attempt.owner_id, {
    subscriptionId: sub.id,
    status: sub.status,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    at: Math.floor(Date.now() / 1000),
  });
}
export async function handleStripeEvent(event: {
  id: string;
  type: string;
  data: { object: { id: string } };
}) {
  const id = event.data.object.id;
  if (
    [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
    ].includes(event.type)
  )
    await fulfillCheckout(id, event.id);
  else if (event.type === "invoice.paid") {
    // Invoice fulfillment derives the owner from our persisted checkout and the
    // canonical subscription; it is independent of webhook delivery order.
    await fulfillInvoice(id, event.id);
  } else if (
    [
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
    ].includes(event.type)
  ) {
    await syncSubscription(id, event.id);
  } else if (
    ["charge.refunded", "charge.dispute.created"].includes(event.type)
  ) {
    const chargeId =
      event.type === "charge.refunded"
        ? id
        : stripeId(
            (await stripeRequest(`disputes/${encodeURIComponent(id)}`)).charge,
          );
    if (!chargeId) return;
    const charge = z
      .object({
        customer: reference,
        payment_intent: reference,
        refunded: z.boolean(),
      })
      .parse(await stripeRequest(`charges/${encodeURIComponent(chargeId)}`));
    if (event.type === "charge.refunded" && !charge.refunded) return; // partial refunds keep access
    const account = await adminClient()
      .from("billing_accounts")
      .select("owner_id")
      .eq("customer_id", stripeId(charge.customer) || "")
      .maybeSingle();
    check(account.error);
    if (account.data && stripeId(charge.payment_intent))
      await apply(event.id, account.data.owner_id, {
        revoke: stripeId(charge.payment_intent),
      });
  }
}
export async function portal(owner: string) {
  requireBilling();
  const account = await adminClient()
    .from("billing_accounts")
    .select("customer_id")
    .eq("owner_id", owner)
    .maybeSingle();
  check(account.error);
  if (!account.data?.customer_id)
    throw new BillingError(409, "You do not have a billing account yet.");
  const session = z.object({ url: z.url() }).parse(
    await stripeRequest(
      "billing_portal/sessions",
      new URLSearchParams({
        customer: account.data.customer_id,
        return_url: `${appOrigin()}/billing`,
        ...(process.env.STRIPE_PORTAL_CONFIGURATION_ID
          ? { configuration: process.env.STRIPE_PORTAL_CONFIGURATION_ID }
          : {}),
      }),
    ),
  );
  if (!session.url.startsWith("https://billing.stripe.com/"))
    throw new BillingError(503, "Billing could not be opened. Please retry.");
  return session;
}
export function commercialQueue() {
  return billingEnabled()
    ? "enqueue_commercial_output"
    : "enqueue_output_with_result";
}
export function dailyRenderCap() {
  const cap = Number(
    billingEnabled()
      ? process.env.PAID_DAILY_EXPORT_CAP || 100
      : process.env.DAILY_EXPORT_CAP || 10,
  );
  return Number.isInteger(cap) && cap >= 1 && cap <= 1000 ? cap : 10;
}
export function exportBillingError(message: string) {
  if (message.includes("Free export allowance"))
    return new BillingError(
      402,
      "Your two free video exports for this month have been used. Upgrade for more exports, or wait until the next UTC calendar month. Your edits are saved.",
    );
  if (message.includes("Payment required"))
    return new BillingError(402, PAYMENT_REQUIRED);
  if (message.includes("Project export allowance"))
    return new BillingError(
      402,
      "This project's ten exports have been used. Start a new project with another package.",
    );
  return null;
}
