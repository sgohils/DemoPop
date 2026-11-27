// React-server fixture: exercise the real Supabase HTTP client and billing
// summary code without a database, Stripe connection or provider credentials.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { billingSummary, exportBillingError } from "../../src/server/billing";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:1";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "fixture";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture";
process.env.DEMOPOP_BILLING_ENABLED = "1";
for (const key of [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PACKAGE_PRICE_ID",
  "STRIPE_STUDIO_PRICE_ID",
  "APP_ORIGIN",
])
  delete process.env[key];

const owner = randomUUID();
const today = new Date();
const startsAt = new Date(
  Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
).toISOString();
const resetsAt = new Date(
  Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1),
).toISOString();
type Grant = {
  allowance: number;
  used: number;
  starts_at: string;
  expires_at: string | null;
  revoked_at: null;
};
let usage = 2;
let grants: Grant[] = [];
let customer: string | null = null;
let databaseFailure = false;
const requests: string[] = [];
globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
  );
  assert.equal(
    url.origin,
    "http://127.0.0.1:1",
    "free usage must never call Stripe or another external service",
  );
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  assert.equal(headers.get("Authorization"), "Bearer fixture");
  assert.equal(url.searchParams.get("owner_id"), `eq.${owner}`);
  requests.push(url.pathname);
  if (url.pathname === "/rest/v1/billing_accounts") {
    assert.ok(url.searchParams.get("select")?.includes("customer_id"));
    return Response.json(
      customer
        ? [
            {
              customer_id: customer,
              subscription_status: null,
              cancel_at_period_end: false,
            },
          ]
        : [],
    );
  }
  if (url.pathname === "/rest/v1/billing_grants") {
    assert.equal(url.searchParams.get("revoked_at"), "is.null");
    return Response.json(grants);
  }
  if (url.pathname === "/rest/v1/project_access") return Response.json([]);
  if (url.pathname === "/rest/v1/free_export_usage") {
    assert.equal(init?.method, "HEAD");
    assert.equal(url.searchParams.get("select"), "id");
    assert.match(headers.get("Prefer") || "", /count=exact/);
    assert.equal(url.searchParams.get("failed"), "eq.false");
    assert.deepEqual(url.searchParams.getAll("period_start"), [
      `gte.${startsAt}`,
      `lt.${resetsAt}`,
    ]);
    if (databaseFailure) return new Response(null, { status: 503 });
    return new Response(null, {
      status: 200,
      headers: { "Content-Range": `*/${usage}` },
    });
  }
  throw new Error(`Unexpected service request: ${url.pathname}`);
};

const anonymous = await billingSummary();
assert.equal(anonymous.signedIn, false);
assert.equal(anonymous.canManageBilling, false);
assert.equal(anonymous.free.remaining, 2);
assert.equal(requests.length, 0, "anonymous summaries make no service calls");

const exhausted = await billingSummary(owner);
assert.equal(
  exhausted.available,
  false,
  "Stripe setup is optional for free exports",
);
assert.equal(exhausted.enabled, true);
assert.equal(exhausted.signedIn, true);
assert.equal(exhausted.remaining, 0);
assert.deepEqual(exhausted.free, { limit: 2, used: 2, remaining: 0, resetsAt });
assert.equal(exhausted.canManageBilling, false);
assert.equal(requests.length, 4);

usage = 1;
const partiallyUsed = await billingSummary(owner);
assert.deepEqual(partiallyUsed.free, {
  limit: 2,
  used: 1,
  remaining: 1,
  resetsAt,
});
assert.equal(partiallyUsed.remaining, 0);
assert.equal(partiallyUsed.canManageBilling, false);

const past = new Date(Date.now() - 86400000).toISOString();
const future = new Date(Date.now() + 86400000).toISOString();
grants = [
  {
    allowance: 5,
    used: 2,
    starts_at: past,
    expires_at: future,
    revoked_at: null,
  },
  {
    allowance: 1,
    used: 0,
    starts_at: past,
    expires_at: null,
    revoked_at: null,
  },
  {
    allowance: 5,
    used: 0,
    starts_at: past,
    expires_at: past,
    revoked_at: null,
  },
  {
    allowance: 5,
    used: 0,
    starts_at: future,
    expires_at: null,
    revoked_at: null,
  },
];
const paid = await billingSummary(owner);
assert.equal(
  paid.remaining,
  4,
  "paid grants exclude expired and future allowances",
);
assert.deepEqual(
  paid.free,
  partiallyUsed.free,
  "purchased balances do not consume free credits",
);

customer = "cus_previous_customer";
grants = [];
const previousCustomer = await billingSummary(owner);
assert.equal(previousCustomer.remaining, 0);
assert.equal(previousCustomer.subscription, null);
assert.equal(
  previousCustomer.canManageBilling,
  true,
  "previous customers retain receipt and portal access with no paid credits",
);
assert.deepEqual(previousCustomer.free, partiallyUsed.free);

usage = 3;
assert.equal(
  (await billingSummary(owner)).free.remaining,
  0,
  "remaining allowance never becomes negative",
);
databaseFailure = true;
await assert.rejects(
  billingSummary(owner),
  /billing details could not be updated/,
);

const quota = exportBillingError("Free export allowance reached");
assert.equal(quota?.status, 402);
assert.match(quota?.message || "", /Upgrade/);
assert.match(quota?.message || "", /next UTC calendar month/);
assert.equal(exportBillingError("Unexpected database failure"), null);
console.log(
  "Free summary fixtures passed: exact HEAD counts, owner/month/failed filters, no Stripe requirement, separate paid balances, safe portal eligibility and actionable quota errors.",
);
