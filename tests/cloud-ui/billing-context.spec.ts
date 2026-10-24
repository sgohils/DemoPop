import { test, expect } from "@playwright/test";
import { sampleProject, sampleMedia } from "../../src/shared/project";
import { billingPath, pricingPath } from "../../src/shared/billing-context";

const projectId = "33333333-3333-4333-8333-333333333333";
const otherProject = "55555555-5555-4555-8555-555555555555";
const sessionId = "cs_test_return";
const summary = {
  enabled: true,
  available: true,
  signedIn: true,
  remaining: 0,
  subscription: null,
  projects: [],
};

test("the real auth endpoint rejects foreign, duplicate and unrecognized payment return targets", async ({
  request,
  baseURL,
}) => {
  for (const next of [
    "https://foreign.example",
    "/billing?session_id=cs_test_one&session_id=cs_test_two",
    "/pricing?plan=studio&next=/create",
  ]) {
    const response = await request.post("/api/auth/signup", {
      headers: { Origin: new URL(baseURL!).origin },
      data: { email: "buyer@example.com", password: "test-password", next },
    });
    expect(response.status()).toBe(400);
  }
});

test("a paid export journey preserves the saved project through plans, sign-in, checkout and explicit export", async ({
  page,
}) => {
  const origin = new URL(test.info().project.use.baseURL!).origin;
  const errors: string[] = [];
  const unexpected: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let signedIn = true,
    paid = false;
  let saved = structuredClone(sampleProject);
  const exports: unknown[] = [];
  const jobId = "44444444-4444-4444-8444-444444444444";
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    let json: unknown;
    if (path === "/api/session")
      json = { signedIn, userId: "11111111-1111-4111-8111-111111111111" };
    else if (path === "/api/metrics")
      return void (await route.fulfill({ status: 204 }));
    else if (path === "/api/brand-kits") json = { kits: [] };
    else if (path === "/api/recipes") json = { recipes: [] };
    else if (path === `/api/projects/${projectId}/exports`)
      json = { jobs: [], hasMore: false };
    else if (path === `/api/projects/${projectId}`) {
      if (method === "PUT") {
        saved = route.request().postDataJSON();
        json = { ok: true };
      } else json = { project: saved, media: sampleMedia() };
    } else if (path === "/api/exports") {
      exports.push(route.request().postDataJSON());
      if (!paid)
        return void (await route.fulfill({
          status: 402,
          json: { error: "Choose a package to export. Your edits are saved." },
        }));
      json = { id: jobId, reused: false };
    } else if (path === `/api/jobs/${jobId}`)
      json = {
        job: { id: jobId, status: "queued", progress: 0, attempt_count: 0 },
      };
    else if (path === "/api/billing/checkout") {
      expect(route.request().postDataJSON()).toEqual({
        offer: "studio",
        projectId,
      });
      if (!signedIn)
        return void (await route.fulfill({
          status: 401,
          json: { error: "Sign in to choose your plan." },
        }));
      json = { url: "https://checkout.stripe.com/c/pay/cs_test_return" };
    } else if (path === "/api/auth/login") {
      expect(route.request().postDataJSON().next).toBe(
        pricingPath({ plan: "studio", projectId }),
      );
      signedIn = true;
      json = { signedIn: true };
    } else if (path === "/api/billing/status")
      json = { ...summary, signedIn, remaining: paid ? 5 : 0 };
    else if (path === "/api/billing/confirm") {
      expect(route.request().postDataJSON()).toEqual({ sessionId });
      json = paid ? { confirmed: true, projectId } : { confirmed: false };
    } else {
      unexpected.push(`${method} ${path}`);
      return void (await route.fulfill({
        status: 501,
        json: { error: "Unexpected API" },
      }));
    }
    await route.fulfill({ json });
  });
  await page.route("https://checkout.stripe.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<a href="${origin}${billingPath({ sessionId, projectId })}">Return from checkout</a>`,
    }),
  );
  await page.goto(`/editor/${projectId}`);
  await page
    .getByLabel("Opening caption", { exact: true })
    .fill("Keep this exact client edit.");
  await page.getByRole("button", { name: "Export video", exact: true }).click();
  const plans = page.getByRole("link", {
    name: "Choose your launch package",
    exact: false,
  });
  await expect(plans).toHaveAttribute("href", pricingPath({ projectId }));
  expect(saved.opening).toBe("Keep this exact client edit.");
  await plans.click();
  signedIn = false;
  await page.getByRole("button", { name: "Start Studio", exact: true }).click();
  await expect(page).toHaveURL(
    `/auth?next=${encodeURIComponent(pricingPath({ plan: "studio", projectId }))}`,
  );
  await page
    .getByLabel("Email address", { exact: true })
    .fill("buyer@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(pricingPath({ plan: "studio", projectId }));
  await page.getByRole("button", { name: "Start Studio", exact: true }).click();
  await page
    .getByRole("link", { name: "Return from checkout", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "still being confirmed" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Return to saved project", exact: true }),
  ).toHaveAttribute("href", `/editor/${projectId}`);
  await expect(
    page.getByRole("link", { name: "Continue to export", exact: true }),
  ).toHaveCount(0);
  paid = true;
  await page
    .getByRole("button", { name: "Refresh billing", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Continue to export", exact: true }),
  ).toHaveAttribute("href", `/editor/${projectId}`);
  expect(exports).toHaveLength(1);
  await page.screenshot({
    path: "out/qa/payments/return-to-project-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Continue to export", exact: true })
    .click();
  await expect(page.getByLabel("Opening caption", { exact: true })).toHaveValue(
    "Keep this exact client edit.",
  );
  await page.getByRole("button", { name: "Export video", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(exports).toHaveLength(2);
  expect(exports[1]).toMatchObject({
    projectId,
    project: { opening: saved.opening },
  });
  expect(unexpected).toEqual([]);
  expect(errors).toEqual([]);
});

test("expired billing sign-in keeps the session and server-confirmed context overrides a changed URL", async ({
  page,
}) => {
  let signedIn = true,
    expiredOnce = false;
  const original = billingPath({ sessionId, projectId: otherProject });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/billing/status")
      return route.fulfill({
        json: {
          ...summary,
          signedIn,
          remaining: signedIn && expiredOnce ? 1 : 0,
        },
      });
    if (path === "/api/billing/confirm") {
      expect(route.request().postDataJSON()).toEqual({ sessionId });
      if (!expiredOnce) {
        expiredOnce = true;
        signedIn = false;
        return route.fulfill({
          status: 401,
          json: { error: "Sign in again to confirm payment." },
        });
      }
      return route.fulfill({ json: { confirmed: true, projectId } });
    }
    if (path === "/api/auth/login") {
      expect(route.request().postDataJSON().next).toBe(original);
      signedIn = true;
      return route.fulfill({ json: { signedIn: true } });
    }
    return route.fulfill({ status: 501, json: { error: "Unexpected API" } });
  });
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto(original);
  const signIn = page.getByRole("link", { name: "Sign in", exact: true });
  await expect(signIn).toHaveAttribute(
    "href",
    `/auth?next=${encodeURIComponent(original)}`,
  );
  await signIn.click();
  await page
    .getByLabel("Email address", { exact: true })
    .fill("buyer@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Continue to export", exact: true }),
  ).toHaveAttribute("href", `/editor/${projectId}`);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "out/qa/payments/return-to-project-mobile.png",
    fullPage: true,
  });
});

test("canceled checkout retains the plan and saved project without claiming payment", async ({
  page,
}) => {
  await page.goto(pricingPath({ plan: "package", projectId, canceled: true }));
  await expect(page.getByRole("status")).toContainText("Checkout was canceled");
  await expect(page.locator('[data-selected="true"]')).toContainText(
    "Launch package",
  );
  await expect(
    page.getByRole("link", { name: "Back to your project", exact: true }),
  ).toHaveCount(2);
  for (const link of await page
    .getByRole("link", { name: "Back to your project", exact: true })
    .all())
    await expect(link).toHaveAttribute("href", `/editor/${projectId}`);
  await expect(
    page.getByText("Payment confirmed", { exact: false }),
  ).toHaveCount(0);
});
