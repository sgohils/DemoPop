import { test, expect } from "@playwright/test";
test("pricing explains project access and keeps a usable free preview when purchases are unavailable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Turn client websites/ }),
  ).toBeVisible();
  await page.screenshot({ path: "out/qa/commercial/home-desktop.png" });
  await page.goto("/pricing");
  await expect(
    page.getByRole("heading", { name: /A whole launch/ }),
  ).toBeVisible();
  await expect(page.getByText("$29", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("$79", { exact: false }).first()).toBeVisible();
  await expect(
    page.getByText(/Paid exports are not available yet/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Start Studio|Get a launch package/ }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "Try the free preview" })
    .first()
    .click();
  await expect(page).toHaveURL(/\/editor\/new/);
  await page.goto("/billing");
  await expect(
    page.getByRole("heading", { name: /Your packages, in one place/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toHaveAttribute("href", /next=%2Fbilling/);
});
test("commercial pages fit small screens and cross-origin billing writes are rejected", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  for (const path of ["/pricing", "/billing"]) {
    await page.goto(path);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(320);
  }
  const denied = await request.post("/api/billing/checkout", {
    headers: { Origin: "https://unrelated.example" },
    data: { offer: "studio" },
  });
  expect(denied.status()).toBe(403);
  const status = await request.get("/api/billing/status");
  expect(status.headers()["cache-control"]).toBe("private, no-store");
  expect((await status.json()).remaining).toBe(0);
  await page.goto("/pricing");
  await page.screenshot({
    path: "out/qa/commercial/pricing-mobile.png",
    fullPage: true,
  });
});
