// Run with --conditions=react-server. Real billing functions talk only to these
// local HTTP fixtures; no Stripe account, credentials or money are involved.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  fulfillCheckout,
  handleStripeEvent,
  checkout,
  portal,
} from "../../src/server/billing";
const owner = randomUUID(),
  checkoutId = randomUUID();
const projectId = randomUUID(),
  otherProjectId = randomUUID(),
  foreignProjectId = randomUUID(),
  trashedProjectId = randomUUID();
const projects = [
  { id: projectId, owner_id: owner, deleted_at: null as string | null },
  { id: otherProjectId, owner_id: owner, deleted_at: null as string | null },
  { id: foreignProjectId, owner_id: randomUUID(), deleted_at: null },
  {
    id: trashedProjectId,
    owner_id: owner,
    deleted_at: new Date().toISOString(),
  },
];
let persistedProject: string | null = null;
const projectLookups: string[] = [];
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:1";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
process.env.STRIPE_SECRET_KEY = "sk_test_fixture";
process.env.STRIPE_PACKAGE_PRICE_ID = "price_package";
process.env.STRIPE_STUDIO_PRICE_ID = "price_studio";
let offer = "package";
let session = {
  id: "cs_test_package",
  customer: "cus_test",
  client_reference_id: owner,
  metadata: { checkoutId },
  mode: "payment",
  payment_status: "paid",
  status: "complete",
  payment_intent: "pi_test",
  currency: "usd",
  amount_total: 2900,
  subscription: null as string | null,
  line_items: { data: [{ price: { id: "price_package" }, quantity: 1 }] },
};
const period = { start: 1800000000, end: 1802592000 };
const sub = {
  id: "sub_test",
  customer: "cus_test",
  metadata: { checkoutId },
  status: "active",
  cancel_at_period_end: false,
  latest_invoice: "in_test",
  items: { data: [{ price: { id: "price_studio" } }] },
};
let invoice = {
  id: "in_test",
  customer: "cus_test",
  status: "paid",
  billing_reason: "subscription_cycle",
  currency: "usd",
  amount_paid: 7900,
  parent: { subscription_details: { subscription: "sub_test" } },
  lines: {
    data: [
      {
        period,
        pricing: { price_details: { price: "price_studio" } },
        parent: { subscription_item_details: { proration: false } },
      },
    ],
  },
  payments: { data: [{ payment: { payment_intent: "pi_cycle" } }] },
};
const applications: {
  p_event: string;
  p_owner: string;
  p_data: Record<string, unknown>;
}[] = [];
globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
  );
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  if (url.hostname === "api.stripe.com") {
    assert.equal(headers.get("Stripe-Version"), "2025-06-30.basil");
    assert.equal(headers.get("Authorization"), "Bearer sk_test_fixture");
    if (url.pathname.startsWith("/v1/checkout/sessions/"))
      return Response.json(session);
    if (url.pathname === "/v1/subscriptions/sub_test")
      return Response.json(sub);
    if (url.pathname === "/v1/invoices/in_test") return Response.json(invoice);
    throw new Error(`Unexpected payment request: ${url.pathname}`);
  }
  assert.equal(
    url.origin,
    "http://127.0.0.1:1",
    "tests cannot reach an external database",
  );
  if (url.pathname === "/rest/v1/billing_checkouts")
    return Response.json([
      {
        id: checkoutId,
        owner_id: owner,
        offer,
        session_id: session.id,
        return_project_id: persistedProject,
      },
    ]);
  if (url.pathname === "/rest/v1/projects") {
    projectLookups.push(url.searchParams.get("id") || "");
    return Response.json(
      projects
        .filter(
          (project) =>
            `eq.${project.id}` === url.searchParams.get("id") &&
            `eq.${project.owner_id}` === url.searchParams.get("owner_id") &&
            project.deleted_at === null,
        )
        .map(({ id }) => ({ id })),
    );
  }
  if (url.pathname === "/rest/v1/billing_accounts")
    return Response.json({ customer_id: "cus_test" });
  if (url.pathname === "/rest/v1/rpc/apply_billing_event") {
    applications.push(JSON.parse(init?.body as string));
    return Response.json(true);
  }
  throw new Error(`Unexpected database request: ${url.pathname}`);
};
assert.deepEqual(await fulfillCheckout(session.id, "evt_one", owner), {
  confirmed: true,
});
assert.equal(applications[0].p_owner, owner);
assert.equal(applications[0].p_data.source, "package:cs_test_package");
assert.equal(applications[0].p_data.paymentRef, "pi_test");
persistedProject = projectId;
assert.deepEqual(await fulfillCheckout(session.id, "confirm:project", owner), {
  confirmed: true,
  projectId,
});
assert.deepEqual(await fulfillCheckout(session.id, "evt:project"), {
  confirmed: true,
});
for (const missingProject of [
  foreignProjectId,
  trashedProjectId,
  randomUUID(),
]) {
  persistedProject = missingProject;
  assert.deepEqual(
    await fulfillCheckout(session.id, "confirm:removed-project", owner),
    { confirmed: true },
    "a paid purchase remains confirmed without exposing an unavailable project",
  );
}
persistedProject = null;
await assert.rejects(
  fulfillCheckout(session.id, "evt_foreign", randomUUID()),
  /not found/,
);
const before = applications.length;
session.payment_status = "unpaid";
assert.deepEqual(await fulfillCheckout(session.id, "evt_unpaid", owner), {
  confirmed: false,
});
assert.equal(applications.length, before);
session.payment_status = "paid";
session.line_items.data[0].price.id = "price_attacker";
await assert.rejects(
  fulfillCheckout(session.id, "evt_wrong_price", owner),
  /offer does not match/,
);
session.line_items.data[0].price.id = "price_package";
session.amount_total = 1;
await assert.rejects(
  fulfillCheckout(session.id, "evt_wrong_amount", owner),
  /amount does not match/,
);
offer = "studio";
session = {
  ...session,
  id: "cs_test_studio",
  amount_total: 7900,
  mode: "subscription",
  subscription: "sub_test",
  line_items: { data: [{ price: { id: "price_studio" }, quantity: 1 }] },
};
await handleStripeEvent({
  id: "evt_invoice_first",
  type: "invoice.paid",
  data: { object: { id: "in_test" } },
});
assert.equal(
  applications.at(-1)!.p_data.source,
  `studio:sub_test:${period.start}`,
);
assert.equal(applications.at(-1)!.p_data.paymentRef, "pi_cycle");
assert.equal(applications.at(-1)!.p_data.subscriptionId, "sub_test");
assert.equal(applications.at(-1)!.p_data.status, "active");
persistedProject = projectId;
assert.deepEqual(await fulfillCheckout(session.id, "confirm:studio", owner), {
  confirmed: true,
  projectId,
});
assert.equal(
  applications.at(-1)!.p_data.source,
  `studio:sub_test:${period.start}`,
);
assert.equal(
  applications.at(-1)!.p_data.expiresAt,
  new Date(period.end * 1000).toISOString(),
);
invoice = { ...invoice, status: "open" };
const grants = applications.filter((a) => a.p_data.source).length;
assert.deepEqual(
  await fulfillCheckout(session.id, "confirm:unpaid_cycle", owner),
  { confirmed: false },
);
assert.equal(applications.filter((a) => a.p_data.source).length, grants);
persistedProject = null;
console.log(
  "Canonical payment fixtures passed: ownership, unpaid checkout, price/amount validation, invoice-first renewal and browser confirmation.",
);

process.env.APP_ORIGIN = "https://demopop.example";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_fixture";
const fulfillmentFetch = globalThis.fetch;
let validPrice = true;
let creates = 0;
let attemptId = checkoutId;
let attemptCreated = new Date().toISOString();
let attemptProject: string | null = null;
let attemptExists = true;
let begins = 0;
let rateLimits = 0;
const createPayloads: string[] = [];
let restarts = 0;
let createFailure: { status: number; type: string; param: string } | null =
  null;
let rejectFresh = false;
let networkFailure = false;
let portalConfiguration: string | null = null;
globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
  );
  if (url.pathname === "/rest/v1/rpc/consume_request_limit") {
    rateLimits++;
    return Response.json(true);
  }
  if (url.pathname === "/rest/v1/rpc/begin_billing_checkout") {
    begins++;
    const body = JSON.parse(init?.body as string);
    assert.equal(body.p_owner, owner);
    assert.equal(body.p_offer, "package");
    if (!attemptExists) {
      attemptExists = true;
      attemptProject = body.p_project;
    }
    return Response.json({
      id: attemptId,
      session_id: null,
      created_at: attemptCreated,
      return_project_id: attemptProject,
    });
  }
  if (url.pathname === "/rest/v1/rpc/restart_billing_checkout") {
    assert.deepEqual(JSON.parse(init?.body as string), {
      p_owner: owner,
      p_checkout: attemptId,
    });
    restarts++;
    attemptId = randomUUID();
    attemptCreated = new Date().toISOString();
    return Response.json({
      id: attemptId,
      session_id: null,
      created_at: attemptCreated,
      return_project_id: attemptProject,
    });
  }
  if (url.pathname === "/v1/prices/price_package")
    return Response.json({
      active: true,
      currency: "usd",
      unit_amount: validPrice ? 2900 : 1,
      recurring: null,
    });
  if (url.pathname === "/v1/checkout/sessions") {
    const fields = new URLSearchParams(init?.body as URLSearchParams);
    assert.equal(fields.get("line_items[0][price]"), "price_package");
    assert.equal(fields.get("client_reference_id"), owner);
    assert.equal(fields.get("customer"), "cus_test");
    assert.equal(fields.get("invoice_creation[enabled]"), "true");
    assert.equal(
      fields.get("success_url"),
      `https://demopop.example/billing?session_id={CHECKOUT_SESSION_ID}${attemptProject ? `&project=${attemptProject}` : ""}`,
    );
    assert.equal(
      fields.get("cancel_url"),
      `https://demopop.example/pricing?canceled=1&plan=package${attemptProject ? `&project=${attemptProject}` : ""}`,
    );
    createPayloads.push(fields.toString());
    assert.equal(
      Number(fields.get("expires_at")) - Date.now() / 1000 > 1800,
      Date.parse(attemptCreated) > Date.now() - 1800000,
      "Replays preserve the exact original expiry, including stale attempts",
    );
    assert.equal(
      new Headers(init?.headers).get("Idempotency-Key"),
      `checkout:${attemptId}`,
    );
    assert.equal(
      fields.get("expires_at"),
      String(Math.floor(Date.parse(attemptCreated) / 1000) + 3600),
    );
    creates++;
    if (networkFailure) throw new TypeError("Fixture network interruption");
    if (createFailure) {
      const failure = createFailure;
      if (
        !rejectFresh &&
        failure.param === "expires_at" &&
        Date.parse(attemptCreated) > Date.now() - 1800000
      )
        createFailure = null;
      else
        return Response.json(
          { error: { ...failure, message: "Sensitive provider message" } },
          { status: failure.status },
        );
    }
    return Response.json({
      ...session,
      url: "https://checkout.stripe.com/c/pay/fixture",
    });
  }
  if (url.pathname === "/v1/billing_portal/sessions") {
    portalConfiguration = new URLSearchParams(
      init?.body as URLSearchParams,
    ).get("configuration");
    return Response.json({
      url: "https://billing.stripe.com/p/session/fixture",
    });
  }
  if (url.pathname === "/rest/v1/funnel_events") return Response.json(null);
  return fulfillmentFetch(input, init);
};
assert.deepEqual(await checkout(owner, "buyer@example.com", "package"), {
  url: "https://checkout.stripe.com/c/pay/fixture",
});
assert.equal(creates, 1);
validPrice = false;
await assert.rejects(
  checkout(owner, "buyer@example.com", "package"),
  /offer is temporarily unavailable/,
);
assert.equal(creates, 1, "a misconfigured price must never create Checkout");
validPrice = true;
attemptCreated = new Date(Date.now() - 40 * 60 * 1000).toISOString();
createFailure = {
  status: 400,
  type: "invalid_request_error",
  param: "expires_at",
};
await checkout(owner, "buyer@example.com", "package");
assert.equal(
  restarts,
  1,
  "explicit stale expiry rejection starts one new attempt",
);
assert.notEqual(attemptId, checkoutId);
assert.equal(
  creates,
  3,
  "recovery replays the old request before a new create",
);

for (const failure of [
  { status: 503, type: "api_error", param: "expires_at" },
  { status: 400, type: "invalid_request_error", param: "customer" },
]) {
  attemptCreated = new Date(Date.now() - 40 * 60 * 1000).toISOString();
  createFailure = failure;
  const originalAttempt = attemptId;
  await assert.rejects(
    checkout(owner, "buyer@example.com", "package"),
    (error) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message.includes("Sensitive provider message"), false);
      return true;
    },
  );
  assert.equal(attemptId, originalAttempt);
  assert.equal(
    restarts,
    1,
    "ambiguous or unrelated failures never retire an attempt",
  );
}
createFailure = null;
await checkout(owner, "buyer@example.com", "package");
assert.equal(
  restarts,
  1,
  "a successful idempotent replay keeps the original attempt",
);
networkFailure = true;
await assert.rejects(checkout(owner, "buyer@example.com", "package"));
assert.equal(restarts, 1, "a network interruption never retires an attempt");
networkFailure = false;
createFailure = {
  status: 400,
  type: "invalid_request_error",
  param: "expires_at",
};
rejectFresh = true;
await assert.rejects(checkout(owner, "buyer@example.com", "package"));
assert.equal(restarts, 2, "an automatic restart is bounded to one new attempt");
await assert.rejects(checkout(owner, "buyer@example.com", "package"));
assert.equal(
  restarts,
  2,
  "a fresh attempt with a provider error is not retired",
);
createFailure = null;

const beforeInvalidProject = { creates, begins, rateLimits, restarts };
for (const unavailableProject of [
  foreignProjectId,
  trashedProjectId,
  randomUUID(),
])
  await assert.rejects(
    checkout(owner, "buyer@example.com", "package", unavailableProject),
    /Project not found/,
  );
assert.deepEqual(
  { creates, begins, rateLimits, restarts },
  beforeInvalidProject,
  "invalid return projects fail before payment or database mutations",
);
attemptId = randomUUID();
attemptCreated = new Date().toISOString();
attemptExists = false;
await checkout(owner, "buyer@example.com", "package", projectId);
assert.equal(attemptProject, projectId);
const originalPayload = createPayloads.at(-1);
await checkout(owner, "buyer@example.com", "package", otherProjectId);
assert.equal(createPayloads.at(-1), originalPayload);
assert.equal(attemptProject, projectId);
projects[0].deleted_at = new Date().toISOString();
attemptCreated = new Date(Date.now() - 40 * 60 * 1000).toISOString();
createFailure = {
  status: 400,
  type: "invalid_request_error",
  param: "expires_at",
};
rejectFresh = false;
const lookupsBeforeRecovery = projectLookups.length;
await checkout(owner, "buyer@example.com", "package", otherProjectId);
assert.deepEqual(projectLookups.slice(lookupsBeforeRecovery), [
  `eq.${otherProjectId}`,
]);
assert.equal(
  attemptProject,
  projectId,
  "expiry recovery keeps the first destination even after it is trashed",
);
assert.ok(createPayloads.at(-1)!.includes(projectId));
assert.equal(createPayloads.at(-1)!.includes(otherProjectId), false);
persistedProject = projectId;
invoice = { ...invoice, status: "paid" };
assert.deepEqual(
  await fulfillCheckout(session.id, "confirm:trashed-recovered-project", owner),
  { confirmed: true },
  "recovered purchase confirms without exposing the removed destination",
);

delete process.env.STRIPE_PORTAL_CONFIGURATION_ID;
await portal(owner);
assert.equal(portalConfiguration, null);
process.env.STRIPE_PORTAL_CONFIGURATION_ID = "bpc_demopop_test";
await portal(owner);
assert.equal(portalConfiguration, "bpc_demopop_test");
console.log(
  "Checkout fixtures passed: configured prices, canonical URLs, immutable owned project context, receipt invoice, bounded stale-attempt recovery, idempotency and dedicated portal configuration.",
);
