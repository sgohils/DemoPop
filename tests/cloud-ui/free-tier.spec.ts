import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import {
  sampleProject,
  sampleMedia,
  type ProjectInput,
} from "../../src/shared/project";
import { pricingPath } from "../../src/shared/billing-context";

const projectId = "33333333-3333-4333-8333-333333333333";
const jobId = "44444444-4444-4444-8444-444444444444";
const ownerId = "11111111-1111-4111-8111-111111111111";

async function editorFixture(page: Page, quotaReached = false) {
  const saves: ProjectInput[] = [];
  const exports: {
    projectId: string;
    project: ProjectInput;
    outputKind: string;
  }[] = [];
  const payments: string[] = [];
  const unexpected: string[] = [];
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.startsWith("/api/billing/")) {
      payments.push(path);
      return route.fulfill({
        status: 501,
        json: { error: "No payment request expected" },
      });
    }
    if (path === "/api/session")
      return route.fulfill({ json: { signedIn: true, userId: ownerId } });
    if (path === "/api/metrics") return route.fulfill({ status: 204 });
    if (path === "/api/brand-kits")
      return route.fulfill({ json: { kits: [] } });
    if (path === "/api/recipes")
      return route.fulfill({ json: { recipes: [] } });
    if (path === `/api/projects/${projectId}/exports`)
      return route.fulfill({ json: { jobs: [], hasMore: false } });
    if (path === `/api/projects/${projectId}`) {
      if (method === "PUT") {
        saves.push(route.request().postDataJSON());
        return route.fulfill({ json: { ok: true } });
      }
      return route.fulfill({
        json: { project: sampleProject, media: sampleMedia() },
      });
    }
    if (path === "/api/exports") {
      exports.push(route.request().postDataJSON());
      return route.fulfill(
        quotaReached
          ? {
              status: 402,
              json: {
                error:
                  "Your free monthly exports are used. They reset on the first of each month at 00:00 UTC. Choose a launch package to export sooner. Your edits are saved.",
              },
            }
          : {
              status: 202,
              json: { id: jobId, reused: false, outputKind: "video" },
            },
      );
    }
    if (path === `/api/jobs/${jobId}`)
      return route.fulfill({
        json: {
          job: {
            id: jobId,
            status: "completed",
            progress: 1,
            attempt_count: 1,
            error: null,
            output_kind: "video",
            format: sampleProject.format,
            duration: 15,
          },
        },
      });
    unexpected.push(`${method} ${path}`);
    return route.fulfill({
      status: 501,
      json: { error: "Unexpected fixture request" },
    });
  });
  return { saves, exports, payments, unexpected };
}

for (const savedProject of [false, true]) {
  test(`Free pricing opens ${savedProject ? "the saved project" : "creation"} without starting checkout`, async ({
    page,
  }) => {
    const api = await editorFixture(page);
    await page.goto(savedProject ? pricingPath({ projectId }) : "/pricing");
    const free = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: "Free", exact: true }),
    });
    await expect(free).toContainText(
      "2 single-video MP4 exports each calendar month",
    );
    await expect(free).toContainText("Full resolution, no watermark");
    if (!savedProject) {
      await mkdir("out/qa/free-tier", { recursive: true });
      await page.screenshot({
        path: "out/qa/free-tier/pricing-desktop.png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 320, height: 844 });
      await page.screenshot({
        path: "out/qa/free-tier/pricing-mobile.png",
        fullPage: true,
      });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(320);
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    await free.getByRole("link", { name: "Start free", exact: true }).click();
    await expect(page).toHaveURL(
      savedProject ? new RegExp(`/editor/${projectId}$`) : /\/create$/,
    );
    if (savedProject)
      await expect(page.getByLabel("Opening caption")).toBeVisible();
    expect(api.payments).toEqual([]);
    expect(api.exports).toEqual([]);
    expect(api.unexpected).toEqual([]);
  });
}

for (const remaining of [2, 0]) {
  test(`billing shows ${remaining} free exports and the UTC reset without a payment account`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    const unexpected: string[] = [];
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/billing/status")
        return route.fulfill({
          json: {
            enabled: true,
            available: false,
            signedIn: true,
            remaining: 0,
            subscription: null,
            projects: [],
            canManageBilling: false,
            free: {
              limit: 2,
              used: 2 - remaining,
              remaining,
              resetsAt: "2026-11-01T00:00:00.000Z",
            },
          },
        });
      unexpected.push(path);
      return route.fulfill({
        status: 501,
        json: { error: "Unexpected payment request" },
      });
    });
    await page.goto(`/billing?project=${projectId}`);
    const free = page.getByRole("region", { name: "Free plan", exact: true });
    await expect(free).toContainText(`${remaining} of 2`);
    await expect(free).toContainText("Nov 1, 2026 at 00:00 UTC");
    await expect(
      free.getByRole("link", {
        name: remaining
          ? "Create your free video"
          : "Keep editing your next video",
      }),
    ).toHaveAttribute("href", `/editor/${projectId}`);
    await expect(
      page.getByRole("button", { name: /Manage billing/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Upgrade for campaign packages" }),
    ).toHaveAttribute("href", pricingPath({ projectId }));
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(320);
    await mkdir("out/qa/free-tier", { recursive: true });
    await page.screenshot({
      path: `out/qa/free-tier/billing-${remaining}-remaining-mobile.png`,
      fullPage: true,
    });
    expect(unexpected).toEqual([]);
  });
}

test("an authenticated free account exports a saved MP4 without a payment request", async ({
  page,
}) => {
  const api = await editorFixture(page);
  await page.goto(`/editor/${projectId}`);
  await page.getByLabel("Opening caption").fill("My first free launch film.");
  await page.getByRole("button", { name: "Export video", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Ready for the spotlight.",
  );
  await expect(
    page.getByRole("button", { name: "Download MP4", exact: true }),
  ).toBeVisible();
  expect(api.saves).toMatchObject([{ opening: "My first free launch film." }]);
  expect(api.exports).toMatchObject([
    {
      projectId,
      project: { opening: "My first free launch film." },
      outputKind: "video",
    },
  ]);
  expect(api.payments).toEqual([]);
  expect(api.unexpected).toEqual([]);
});

test("a depleted free allowance preserves edits and offers an upgrade for the same project", async ({
  page,
}) => {
  const api = await editorFixture(page, true);
  await page.goto(`/editor/${projectId}`);
  await page
    .getByLabel("Opening caption")
    .fill("Keep my edit when free exports run out.");
  await page.getByRole("button", { name: "Export video", exact: true }).click();
  await expect(page.getByTestId("editor-error")).toContainText("00:00 UTC");
  await expect(
    page.getByRole("link", { name: /Choose your launch package/ }),
  ).toHaveAttribute("href", pricingPath({ projectId }));
  await expect(page.getByLabel("Opening caption")).toHaveValue(
    "Keep my edit when free exports run out.",
  );
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  expect(api.saves).toMatchObject([
    { opening: "Keep my edit when free exports run out." },
  ]);
  expect(api.payments).toEqual([]);
  expect(api.unexpected).toEqual([]);
});
