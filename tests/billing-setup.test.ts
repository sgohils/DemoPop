import test from "node:test";
import assert from "node:assert/strict";
import {
  setupTestBilling,
  STRIPE_WEBHOOK_EVENTS,
  validateCatalogPrice,
  type SetupEnvironment,
} from "../src/server/billing-setup";
import { STRIPE_API_VERSION, stripeRequest } from "../src/server/stripe";

const packagePrice = {
  id: "price_package",
  active: true,
  livemode: false,
  currency: "usd",
  unit_amount: 2900,
  type: "one_time",
  billing_scheme: "per_unit",
  transform_quantity: null,
  custom_unit_amount: null,
  recurring: null,
};
const studioPrice = {
  ...packagePrice,
  id: "price_studio",
  unit_amount: 7900,
  type: "recurring",
  recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
};
const portal = {
  id: "bpc_demopop",
  active: true,
  livemode: false,
  metadata: { app: "demopop" },
  features: {
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: "at_period_end" },
    subscription_update: { enabled: false },
  },
};
const endpoint = {
  id: "we_demopop",
  url: "https://demopop.example.com/api/billing/webhook",
  livemode: false,
  api_version: STRIPE_API_VERSION,
  status: "enabled",
  enabled_events: [...STRIPE_WEBHOOK_EVENTS],
};
const baseEnv: SetupEnvironment = {
  STRIPE_SECRET_KEY: "sk_test_mockedOnly",
  APP_ORIGIN: "http://localhost:3000",
};
const configured: SetupEnvironment = {
  ...baseEnv,
  STRIPE_PACKAGE_PRICE_ID: packagePrice.id,
  STRIPE_STUDIO_PRICE_ID: studioPrice.id,
  STRIPE_PORTAL_CONFIGURATION_ID: portal.id,
};
type Call = { path: string; fields?: URLSearchParams; key?: string };
function transport(
  handle: (call: Call) => unknown | Promise<unknown> = () => undefined,
) {
  const calls: Call[] = [];
  const request: typeof stripeRequest = async (path, fields, key) => {
    const call = { path, fields, key };
    calls.push(call);
    const response = await handle(call);
    if (response !== undefined) return response;
    if (path === "prices/price_package") return { ...packagePrice };
    if (path === "prices/price_studio") return { ...studioPrice };
    if (path === "billing_portal/configurations/bpc_demopop")
      return structuredClone(portal);
    throw new Error(`Unexpected mocked Stripe request: ${path}`);
  };
  return { calls, request };
}
const list = (data: unknown[], has_more = false) => ({ data, has_more });

test("test setup rejects live, publishable and missing keys before any request", async () => {
  for (const key of [
    undefined,
    "",
    "sk_live_privateValue",
    "rk_live_privateValue",
    "pk_test_publishableValue",
  ]) {
    const mock = transport();
    await assert.rejects(
      setupTestBilling({ ...baseEnv, STRIPE_SECRET_KEY: key }, mock.request),
      (error: Error) => {
        assert.match(error.message, /test-mode/);
        if (key) assert.equal(error.message.includes(key), false);
        return true;
      },
    );
    assert.equal(mock.calls.length, 0);
  }
});

test("default transport cannot validate a test env key while authenticating with a different process key", async () => {
  const previous = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_live_doNotUse";
  try {
    await assert.rejects(setupTestBilling(baseEnv), /process environment/);
  } finally {
    if (previous === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previous;
  }
});

test("canonical price validation refuses wrong money, modes, recurrence and variable quantity", () => {
  validateCatalogPrice(packagePrice, "package", false);
  validateCatalogPrice(studioPrice, "studio", false);
  validateCatalogPrice({ ...studioPrice, livemode: true }, "studio", true);
  for (const invalid of [
    { active: false },
    { currency: "eur" },
    { unit_amount: 2800 },
    { livemode: true },
    { type: "recurring" },
    { billing_scheme: "tiered" },
    { transform_quantity: { divide_by: 10, round: "up" } },
    { custom_unit_amount: { enabled: true } },
    { recurring: studioPrice.recurring },
  ])
    assert.throws(
      () =>
        validateCatalogPrice({ ...packagePrice, ...invalid }, "package", false),
      /does not match/,
    );
  for (const recurring of [
    null,
    { ...studioPrice.recurring, interval: "year" },
    { ...studioPrice.recurring, interval_count: 2 },
    { ...studioPrice.recurring, usage_type: "metered" },
  ])
    assert.throws(
      () =>
        validateCatalogPrice({ ...studioPrice, recurring }, "studio", false),
      /does not match/,
    );
  assert.throws(
    () => validateCatalogPrice({ id: "price_incomplete" }, "package", false),
    /invalid/,
  );
});

test("configured correct prices, app portal and webhook secret are preserved without writes", async () => {
  const mock = transport();
  const result = await setupTestBilling(
    {
      ...configured,
      STRIPE_SECRET_KEY: "rk_test_mockedOnly",
      STRIPE_WEBHOOK_SECRET: "whsec_existingPrivate",
    },
    mock.request,
  );
  assert.deepEqual(result.updates, {});
  assert.equal(mock.calls.length, 3);
  assert.equal(
    mock.calls.every((call) => !call.fields),
    true,
  );
  assert.equal(
    JSON.stringify(result.notices).includes("whsec_existingPrivate"),
    false,
  );
});

test("a configured mismatched price is refused without silently replacing it", async () => {
  const mock = transport(({ path }) =>
    path === "prices/price_package"
      ? { ...packagePrice, unit_amount: 100 }
      : undefined,
  );
  await assert.rejects(
    setupTestBilling(configured, mock.request),
    /does not match/,
  );
  assert.equal(mock.calls.length, 1);
  assert.equal(
    mock.calls.every((call) => !call.fields),
    true,
  );
});

test("lookup-key prices and a later-page app portal are reused without changing account defaults", async () => {
  const mock = transport(({ path }) => {
    if (path.startsWith("prices?"))
      return list([
        path.includes("launch_package") ? packagePrice : studioPrice,
      ]);
    if (path === "billing_portal/configurations?active=true&limit=100")
      return list(
        [
          {
            ...portal,
            id: "bpc_other",
            metadata: { app: "other" },
            is_default: true,
          },
        ],
        true,
      );
    if (path.includes("starting_after=bpc_other")) return list([portal]);
  });
  const result = await setupTestBilling(baseEnv, mock.request);
  assert.deepEqual(result.updates, {
    STRIPE_PACKAGE_PRICE_ID: "price_package",
    STRIPE_STUDIO_PRICE_ID: "price_studio",
    STRIPE_PORTAL_CONFIGURATION_ID: "bpc_demopop",
  });
  assert.equal(
    mock.calls.every((call) => !call.fields),
    true,
  );
  assert.match(result.notices.join(" "), /Stripe CLI listen/);
});

test("fresh test catalog and portal creation sends exact amounts, features and stable idempotency keys", async () => {
  const mock = transport(({ path, fields }) => {
    if (!fields) return list([]);
    if (path === "prices")
      return fields.has("recurring[interval]") ? studioPrice : packagePrice;
    if (path === "billing_portal/configurations") return portal;
  });
  await setupTestBilling(baseEnv, mock.request);
  await setupTestBilling(baseEnv, mock.request);
  const writes = mock.calls.filter((call) => call.fields);
  assert.equal(writes.length, 6);
  assert.deepEqual(
    writes.slice(0, 3).map((call) => call.key),
    writes.slice(3).map((call) => call.key),
  );
  const [packageCall, studioCall, portalCall] = writes;
  assert.equal(packageCall.fields!.get("unit_amount"), "2900");
  assert.equal(packageCall.fields!.get("currency"), "usd");
  assert.equal(
    packageCall.fields!.get("product_data[name]"),
    "DemoPop Launch package",
  );
  assert.equal(packageCall.fields!.has("recurring[interval]"), false);
  assert.equal(packageCall.fields!.has("transfer_lookup_key"), false);
  assert.equal(studioCall.fields!.get("unit_amount"), "7900");
  assert.equal(studioCall.fields!.get("recurring[interval]"), "month");
  assert.equal(studioCall.fields!.get("recurring[usage_type]"), "licensed");
  assert.equal(portalCall.fields!.get("metadata[app]"), "demopop");
  assert.equal(
    portalCall.fields!.get("features[invoice_history][enabled]"),
    "true",
  );
  assert.equal(
    portalCall.fields!.get("features[payment_method_update][enabled]"),
    "true",
  );
  assert.equal(
    portalCall.fields!.get("features[subscription_cancel][mode]"),
    "at_period_end",
  );
  assert.equal(
    portalCall.fields!.get("features[subscription_update][enabled]"),
    "false",
  );
  assert.equal(portalCall.fields!.has("is_default"), false);
  assert.equal(
    writes.every((call) =>
      ["prices", "billing_portal/configurations"].includes(call.path),
    ),
    true,
    "only new catalog/portal objects are created",
  );
});

test("configured unsafe portal settings are refused without modifying any configuration", async () => {
  const mock = transport(({ path }) =>
    path.startsWith("billing_portal/configurations/")
      ? {
          ...portal,
          features: {
            ...portal.features,
            subscription_cancel: { enabled: true, mode: "immediately" },
          },
        }
      : undefined,
  );
  await assert.rejects(
    setupTestBilling(configured, mock.request),
    /supported billing features/,
  );
  assert.equal(
    mock.calls.some((call) => call.fields),
    false,
  );
});

test("public test webhook creation uses the canonical origin, pinned version and exact supported events", async () => {
  const mock = transport(({ path, fields }) => {
    if (path === "webhook_endpoints?limit=100") return list([]);
    if (path === "webhook_endpoints" && fields)
      return { ...endpoint, secret: "whsec_returnPrivately" };
  });
  const result = await setupTestBilling(
    { ...configured, APP_ORIGIN: "https://demopop.example.com/" },
    mock.request,
  );
  const call = mock.calls.at(-1)!;
  assert.equal(call.fields!.get("url"), endpoint.url);
  assert.equal(call.fields!.get("api_version"), STRIPE_API_VERSION);
  assert.deepEqual(call.fields!.getAll("enabled_events[]"), [
    ...STRIPE_WEBHOOK_EVENTS,
  ]);
  assert.match(call.key!, /^demopop:webhook:test:v1:[a-f0-9]{24}$/);
  assert.equal(result.updates.STRIPE_WEBHOOK_SECRET, "whsec_returnPrivately");
  assert.equal(result.updates.STRIPE_WEBHOOK_ENDPOINT_ID, endpoint.id);
  assert.equal(
    JSON.stringify(result.notices).includes("whsec_returnPrivately"),
    false,
  );
});

test("an existing webhook found on a later page is reused without duplicating or trying to rotate its secret", async () => {
  const mock = transport(({ path }) => {
    if (path === "webhook_endpoints?limit=100")
      return list(
        [
          {
            ...endpoint,
            id: "we_other",
            url: "https://other.example.com/webhook",
          },
        ],
        true,
      );
    if (path === "webhook_endpoints?limit=100&starting_after=we_other")
      return list([endpoint]);
  });
  const result = await setupTestBilling(
    { ...configured, APP_ORIGIN: "https://demopop.example.com" },
    mock.request,
  );
  assert.deepEqual(result.updates, { STRIPE_WEBHOOK_ENDPOINT_ID: endpoint.id });
  assert.match(result.notices.join(" "), /only at creation/);
  assert.equal(
    mock.calls.some((call) => call.fields),
    false,
  );
});

test("ambiguous or incomplete webhook listings never trigger endpoint creation", async () => {
  for (const response of [
    list([endpoint, { ...endpoint, id: "we_duplicate" }]),
    list([], true),
    { data: [] },
  ]) {
    const mock = transport(({ path }) =>
      path.startsWith("webhook_endpoints") ? response : undefined,
    );
    await assert.rejects(
      setupTestBilling(
        { ...configured, APP_ORIGIN: "https://demopop.example.com" },
        mock.request,
      ),
      /Multiple webhook|incomplete|pagination/,
    );
    assert.equal(
      mock.calls.some((call) => call.fields),
      false,
    );
  }
});

test("invalid origins and local HTTPS origins never provision a remote webhook", async () => {
  for (const origin of [
    "https://user:privatePassword@demopop.example.com",
    "https://demopop.example.com/path",
    "http://public.example.com",
  ]) {
    const mock = transport();
    await assert.rejects(
      setupTestBilling({ ...configured, APP_ORIGIN: origin }, mock.request),
      (error: Error) => {
        assert.match(error.message, /APP_ORIGIN/);
        assert.equal(error.message.includes("privatePassword"), false);
        return true;
      },
    );
    assert.equal(mock.calls.length, 0);
  }
  for (const origin of [
    "https://localhost",
    "https://127.0.0.1",
    "https://10.0.0.1",
    "https://dev.internal",
  ]) {
    const mock = transport();
    const result = await setupTestBilling(
      { ...configured, APP_ORIGIN: origin },
      mock.request,
    );
    assert.match(result.notices.join(" "), /Stripe CLI listen/);
    assert.equal(
      mock.calls.some((call) => call.path.startsWith("webhook_endpoints")),
      false,
    );
  }
});

test("transport errors never echo the supplied Stripe secret", async () => {
  const mock = transport(() => {
    throw new Error(`Request sk_test_mockedOnly whsec_private failed`);
  });
  await assert.rejects(
    setupTestBilling(configured, mock.request),
    (error: Error) => {
      assert.equal(error.message.includes("sk_test_mockedOnly"), false);
      assert.equal(error.message.includes("whsec_private"), false);
      assert.match(error.message, /permissions/);
      return true;
    },
  );
});

test("the default HTTP transport authenticates test requests and submits URL-encoded setup forms", async (t) => {
  const previous = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = baseEnv.STRIPE_SECRET_KEY;
  const httpCalls: { path: string; options: RequestInit }[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL | Request, options: RequestInit) => {
      const path = String(url).replace("https://api.stripe.com/v1/", "");
      httpCalls.push({ path, options });
      const fields =
        options.body instanceof URLSearchParams ? options.body : undefined;
      const body = fields
        ? path === "prices"
          ? fields.has("recurring[interval]")
            ? studioPrice
            : packagePrice
          : portal
        : list([]);
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  );
  try {
    const result = await setupTestBilling(baseEnv);
    assert.equal(result.updates.STRIPE_PACKAGE_PRICE_ID, packagePrice.id);
    assert.equal(
      httpCalls.filter((call) => call.options.method === "POST").length,
      3,
    );
    for (const call of httpCalls) {
      const headers = new Headers(call.options.headers);
      assert.equal(headers.get("Authorization"), "Bearer sk_test_mockedOnly");
      assert.equal(headers.get("Stripe-Version"), STRIPE_API_VERSION);
      if (call.options.method === "POST") {
        assert.equal(
          headers.get("Content-Type"),
          "application/x-www-form-urlencoded",
        );
        assert.match(headers.get("Idempotency-Key")!, /^demopop:/);
      }
    }
  } finally {
    if (previous === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previous;
    t.mock.restoreAll();
  }
});
