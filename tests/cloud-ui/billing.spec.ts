import { test, expect } from "@playwright/test";
import { sampleProject, sampleMedia } from "../../src/shared/project";
const summary = {
  enabled: true,
  available: true,
  signedIn: true,
  remaining: 0,
  subscription: null,
  projects: [],
};
test("choosing Studio preserves the selected plan through sign in and opens the provider checkout", async ({
  page,
}) => {
  let signedIn = false;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/billing/checkout") {
      expect(route.request().postDataJSON()).toEqual({ offer: "studio" });
      return route.fulfill(
        signedIn
          ? {
              json: {
                url: "https://checkout.stripe.com/c/pay/cs_test_fixture",
              },
            }
          : { status: 401, json: { error: "Sign in" } },
      );
    }
    if (path === "/api/auth/login") {
      signedIn = true;
      return route.fulfill({ json: { signedIn: true } });
    }
    return route.fulfill({
      status: 404,
      json: { error: "Unexpected fixture route" },
    });
  });
  await page.route("https://checkout.stripe.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Secure checkout fixture</h1>",
    }),
  );
  await page.goto("/pricing");
  await page.getByRole("button", { name: "Start Studio" }).click();
  await expect(page).toHaveURL(/\/auth\?next=%2Fpricing%3Fplan%3Dstudio/);
  await page
    .getByLabel("Email address", { exact: true })
    .fill("buyer@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/pricing\?plan=studio/);
  await page.getByRole("button", { name: "Start Studio" }).click();
  await expect(
    page.getByRole("heading", { name: "Secure checkout fixture" }),
  ).toBeVisible();
});
test("billing never trusts a success URL and can confirm a delayed payment without purchasing again", async ({
  page,
}) => {
  let paid = false,
    confirm = false;
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/billing/status")
      return route.fulfill({ json: { ...summary, remaining: paid ? 1 : 0 } });
    if (path === "/api/billing/confirm") {
      paid = confirm;
      return route.fulfill({ json: { confirmed: confirm } });
    }
    if (path === "/api/billing/portal")
      return route.fulfill({
        json: { url: "https://billing.stripe.com/p/session/test_fixture" },
      });
    return route.fulfill({
      status: 404,
      json: { error: "Unexpected fixture route" },
    });
  });
  await page.route("https://billing.stripe.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Billing portal fixture</h1>",
    }),
  );
  await page.goto("/billing?session_id=cs_test_pending");
  await expect(
    page.getByRole("status").filter({ hasText: "still being confirmed" }),
  ).toBeVisible();
  await expect(
    page.getByText("Payment confirmed.", { exact: false }),
  ).toHaveCount(0);
  confirm = true;
  await page.getByRole("button", { name: "Refresh billing" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Payment confirmed" }),
  ).toBeVisible();
  await expect(page.getByText("1", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "out/qa/commercial/billing-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /Manage billing & receipts/ }).click();
  await expect(
    page.getByRole("heading", { name: "Billing portal fixture" }),
  ).toBeVisible();
});
test("checkout failures stay actionable and keep the offer on screen", async ({
  page,
}) => {
  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: "The payment service is temporarily unavailable. Please retry.",
      },
    }),
  );
  await page.goto("/pricing");
  await page.getByRole("button", { name: "Get a launch package" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "temporarily unavailable" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Get a launch package" }),
  ).toBeEnabled();
  await page.screenshot({
    path: "out/qa/commercial/pricing-desktop.png",
    fullPage: true,
  });
});

test("an export payment prompt saves the current edit and points back to real plans", async ({
  page,
}) => {
  const projectId = "33333333-3333-4333-8333-333333333333";
  const saved: unknown[] = [];
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/session")
      return route.fulfill({
        json: {
          signedIn: true,
          userId: "11111111-1111-4111-8111-111111111111",
        },
      });
    if (path === "/api/metrics") return route.fulfill({ status: 204 });
    if (path === "/api/brand-kits")
      return route.fulfill({ json: { kits: [] } });
    if (path === "/api/recipes")
      return route.fulfill({ json: { recipes: [] } });
    if (path === `/api/projects/${projectId}/exports`)
      return route.fulfill({ json: { jobs: [], hasMore: false } });
    if (path === `/api/projects/${projectId}`) {
      if (route.request().method() === "PUT") {
        saved.push(route.request().postDataJSON());
        return route.fulfill({ json: { ok: true } });
      }
      return route.fulfill({
        json: { project: sampleProject, media: sampleMedia() },
      });
    }
    if (path === "/api/exports")
      return route.fulfill({
        status: 402,
        json: {
          error:
            "Choose a launch package or Studio plan to export this project. Your edits are saved.",
        },
      });
    return route.fulfill({
      status: 404,
      json: { error: "Unexpected fixture route" },
    });
  });
  await page.goto(`/editor/${projectId}`);
  await page
    .getByLabel("Opening caption")
    .fill("A launch worth showing to the client.");
  await page.getByRole("button", { name: "Export video", exact: true }).click();
  await expect(
    page.getByRole("link", { name: /Choose your launch package/ }),
  ).toBeVisible();
  await expect(page.getByLabel("Opening caption")).toHaveValue(
    "A launch worth showing to the client.",
  );
  expect(saved).toMatchObject([
    { opening: "A launch worth showing to the client." },
  ]);
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
});
