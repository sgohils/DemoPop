import test from "node:test";
import assert from "node:assert/strict";
import dotenv from "dotenv";
import { mergeBillingEnvironment } from "../scripts/billing-env";
import { billingReadiness } from "../src/server/billing-readiness";
import { STRIPE_WEBHOOK_EVENTS } from "../src/server/billing-setup";

test("billing env setup preserves unrelated values and updates duplicate definitions without leaking secrets", () => {
  const source =
    '# Keep this comment\r\nAPP_ORIGIN="https://app.example"\r\nOTHER_SECRET=keep_me\r\nSTRIPE_PACKAGE_PRICE_ID=old\r\nexport STRIPE_PACKAGE_PRICE_ID=older\r\n';
  const updates = {
    STRIPE_PACKAGE_PRICE_ID: "price_new",
    STRIPE_WEBHOOK_SECRET: "whsec_private",
  };
  const result = mergeBillingEnvironment(source, updates);
  assert.match(result, /^# Keep this comment\r\n/);
  assert.equal(dotenv.parse(result).OTHER_SECRET, "keep_me");
  assert.equal(dotenv.parse(result).APP_ORIGIN, "https://app.example");
  assert.equal(dotenv.parse(result).STRIPE_PACKAGE_PRICE_ID, "price_new");
  assert.equal(dotenv.parse(result).STRIPE_WEBHOOK_SECRET, "whsec_private");
  assert.equal(
    (result.match(/STRIPE_PACKAGE_PRICE_ID=price_new/g) || []).length,
    2,
  );
  assert.throws(() => mergeBillingEnvironment(source, { PATH: "bad" }));
  assert.throws(() =>
    mergeBillingEnvironment(source, {
      STRIPE_WEBHOOK_SECRET: "whsec_good\nAPP_ORIGIN=bad",
    }),
  );
});

const env = {
  NEXT_PUBLIC_SUPABASE_URL: "https://db.example",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
  SUPABASE_SERVICE_ROLE_KEY: "private_database_key",
  APP_ORIGIN: "https://app.example",
  STRIPE_SECRET_KEY: "sk_test_private",
  STRIPE_WEBHOOK_SECRET: "whsec_private",
  STRIPE_PACKAGE_PRICE_ID: "price_package",
  STRIPE_STUDIO_PRICE_ID: "price_studio",
  STRIPE_PORTAL_CONFIGURATION_ID: "bpc_fixture",
  STRIPE_WEBHOOK_ENDPOINT_ID: "we_fixture",
};
function price(studio = false) {
  return {
    id: studio ? "price_studio" : "price_package",
    active: true,
    livemode: false,
    currency: "usd",
    unit_amount: studio ? 7900 : 2900,
    billing_scheme: "per_unit",
    type: studio ? "recurring" : "one_time",
    custom_unit_amount: null,
    transform_quantity: null,
    recurring: studio
      ? {
          interval: "month",
          interval_count: 1,
          usage_type: "licensed",
          trial_period_days: null,
        }
      : null,
  };
}
const request = async (path: string) => {
  if (path === "prices/price_package") return price();
  if (path === "prices/price_studio") return price(true);
  if (path === "billing_portal/configurations/bpc_fixture")
    return {
      active: true,
      livemode: false,
      features: {
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        subscription_cancel: { enabled: true, mode: "at_period_end" },
        subscription_update: { enabled: false },
      },
    };
  if (path === "webhook_endpoints/we_fixture")
    return {
      status: "enabled",
      url: "https://app.example/api/billing/webhook",
      livemode: false,
      enabled_events: [...STRIPE_WEBHOOK_EVENTS],
    };
  throw new Error("Unexpected Stripe request");
};

test("billing doctor makes no service calls when configuration is missing", async () => {
  const forbidden = async () => {
    throw new Error("Should not call an external service");
  };
  const result = await billingReadiness({}, forbidden, forbidden);
  assert.equal(result.ready, false);
  assert.equal(result.mode, null);
  assert.ok(
    result.checks.some(
      (check) => check.name === "STRIPE_SECRET_KEY" && !check.ok,
    ),
  );
});

test("billing doctor checks real catalog shapes, portal restrictions, webhook mode and migration columns without returning credentials", async () => {
  const queries: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://db.example");
    assert.equal(
      new Headers(init?.headers).get("apikey"),
      env.SUPABASE_SERVICE_ROLE_KEY,
    );
    assert.equal(init?.redirect, "error");
    assert.equal(url.searchParams.get("limit"), "0");
    queries.push(url.href);
    return Response.json([]);
  };
  const result = await billingReadiness(env, request, fetcher);
  assert.equal(result.ready, true, JSON.stringify(result.checks));
  assert.equal(queries.length, 4);
  assert.ok(queries.some((query) => query.includes("retired_at")));
  assert.ok(queries.some((query) => query.includes("return_project_id")));
  const serialized = JSON.stringify(result);
  for (const value of [
    env.STRIPE_SECRET_KEY,
    env.STRIPE_WEBHOOK_SECRET,
    env.SUPABASE_SERVICE_ROLE_KEY,
  ])
    assert.ok(!serialized.includes(value));
});

test("billing doctor fails closed on wrong prices, unsafe portal settings, missing events and database errors", async () => {
  const failures = await billingReadiness(
    env,
    async (path) => {
      if (path === "prices/price_package")
        return { ...price(), unit_amount: 1 };
      if (path === "billing_portal/configurations/bpc_fixture")
        return {
          active: true,
          livemode: false,
          features: { subscription_update: { enabled: true } },
        };
      if (path === "webhook_endpoints/we_fixture")
        return {
          status: "enabled",
          url: "https://foreign.example/api/billing/webhook",
          livemode: true,
          enabled_events: [],
        };
      return request(path);
    },
    async () =>
      Response.json({ error: "private internal error" }, { status: 403 }),
  );
  assert.equal(failures.ready, false);
  for (const name of [
    "Launch package price",
    "Customer portal",
    "Webhook endpoint",
    "Billing database schema",
  ])
    assert.equal(
      failures.checks.find((check) => check.name === name)?.ok,
      false,
    );
  assert.ok(!JSON.stringify(failures).includes("private internal error"));
});
