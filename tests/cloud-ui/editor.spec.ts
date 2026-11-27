import { test, expect, type Page, type Route } from "@playwright/test";
import { sampleMedia, sampleProject } from "../../src/shared/project";

const projectId = "d7622b0a-c3b9-4b17-b935-9b22a339d03c";
const originalAsset = "c291346b-78f5-469a-b2c1-ed16510e9f03";
const replacementAsset = "f849a5ab-46e8-4111-b0bd-c5aec04c7e3f";
const savedProject = {
  ...sampleProject,
  name: "Saved cloud project",
  before: originalAsset,
};
const initialMedia = {
  ...sampleMedia(),
  before: { ...sampleMedia().before, src: "/sample/before.png?initial" },
};

async function json(route: Route, value: unknown, status = 200) {
  await route.fulfill({ status, json: value });
  return true;
}

// All API requests are intercepted, including unexpected ones. Never fall
// through to the configured server or infer live integration success here.
async function mockApi(
  page: Page,
  handler: (route: Route, path: string, method: string) => Promise<boolean>,
) {
  const unexpected: string[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/metrics")
      return void (await route.fulfill({ status: 204 }));
    const method = route.request().method();
    if (await handler(route, path, method)) return;
    if (path === "/api/brand-kits" && method === "GET") {
      await json(route, { kits: [] });
      return;
    }
    if (path === "/api/recipes" && method === "GET")
      return void (await json(route, { recipes: [] }));
    if (/^\/api\/projects\/[^/]+\/exports$/.test(path) && method === "GET") {
      await json(route, { jobs: [], hasMore: false });
      return;
    }
    unexpected.push(`${method} ${path}`);
    await json(route, { error: "Unexpected request in mocked UI test." }, 501);
  });
  return unexpected;
}

async function signIn(page: Page) {
  const panel = page.getByRole("region", {
    name: "Sign in to save and export",
  });
  await expect(panel).toBeVisible();
  await panel.getByLabel("Email address").fill("ui-test@example.test");
  await panel.getByLabel("Password", { exact: true }).fill("mock-password-123");
  await panel.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(panel).toBeHidden();
}

test("inline sign-in and expired save preserve unsaved captions, crop and image", async ({
  page,
}) => {
  let authenticated = false;
  let expireSave = true;
  const unexpected = await mockApi(page, async (route, path, method) => {
    if (path === "/api/session")
      return json(
        route,
        authenticated ? { signedIn: true } : { error: "Sign in required." },
        authenticated ? 200 : 401,
      );
    if (path === "/api/auth/login") {
      authenticated = true;
      return json(route, { signedIn: true });
    }
    if (path === "/api/projects" && method === "POST") {
      if (expireSave) {
        expireSave = false;
        authenticated = false;
        return json(
          route,
          { error: "Your session expired. Sign in again." },
          401,
        );
      }
      return json(route, { id: projectId });
    }
    return false;
  });
  await page.goto("/editor/new");
  await expect(
    page.getByRole("heading", { name: "Sign in to save and export" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Project name").fill("Keep my unsaved cloud edits");
  await page
    .getByLabel("Opening caption")
    .fill("A caption that survives sign-in.");
  await page.getByRole("button", { name: "Position & zoom" }).first().click();
  await page.getByLabel("Zoom").first().fill("1.37");
  const image = page.getByRole("img", {
    name: "before website screenshot",
    exact: true,
  });
  const source = await image.getAttribute("src");

  for (let attempt = 0; attempt < 2; attempt++) {
    await signIn(page);
    await expect(page).toHaveURL(/\/editor\/new$/);
    await expect(page.getByLabel("Project name")).toHaveValue(
      "Keep my unsaved cloud edits",
    );
    await expect(page.getByLabel("Opening caption")).toHaveValue(
      "A caption that survives sign-in.",
    );
    await expect(page.getByLabel("Zoom").first()).toHaveValue("1.37");
    await expect(image).toHaveAttribute("src", source!);
    await expect(
      page.getByRole("button", { name: "Save", exact: true }),
    ).toBeEnabled();
    if (attempt === 0)
      await page.screenshot({
        path: "out/qa/editor-cloud-signedin.png",
        fullPage: true,
      });
    await page.getByRole("button", { name: "Save", exact: true }).click();
    if (attempt === 0)
      await expect(page.getByTestId("editor-error")).toContainText(
        "session expired",
      );
  }
  await expect(page).toHaveURL(new RegExp(`/editor/${projectId}$`));
  await expect(page.getByText("Project saved.", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  expect(unexpected).toEqual([]);
});

test("an expired saved-project load reopens in place after inline sign-in", async ({
  page,
}) => {
  let authenticated = false;
  const unexpected = await mockApi(page, async (route, path) => {
    if (path === "/api/session")
      return json(
        route,
        authenticated ? { signedIn: true } : { error: "Sign in required." },
        authenticated ? 200 : 401,
      );
    if (path === "/api/auth/login") {
      authenticated = true;
      return json(route, { signedIn: true });
    }
    if (path === `/api/projects/${projectId}`)
      return json(
        route,
        authenticated
          ? { project: savedProject, media: initialMedia }
          : { error: "Sign in to reopen this project." },
        authenticated ? 200 : 401,
      );
    if (path === `/api/assets/${originalAsset}`)
      return json(route, initialMedia.before);
    return false;
  });
  await page.goto(`/editor/${projectId}`);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Sign in to reopen",
  );
  await signIn(page);
  await expect(page).toHaveURL(new RegExp(`/editor/${projectId}$`));
  await expect(page.getByLabel("Project name")).toHaveValue(
    "Saved cloud project",
  );
  await expect(
    page.getByRole("img", { name: "before website screenshot", exact: true }),
  ).toHaveAttribute("src", initialMedia.before.src);
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  expect(unexpected).toEqual([]);
});

test("expired image access recovers after sign-in and ignores an older save 401", async ({
  page,
}) => {
  let authenticated = true;
  let expiredMedia = false;
  let releaseSave!: () => Promise<boolean>;
  let saveWaiting!: () => void;
  const saveStarted = new Promise<void>((resolve) => {
    saveWaiting = resolve;
  });
  const unexpected = await mockApi(page, async (route, path, method) => {
    if (path === "/api/session")
      return json(
        route,
        authenticated ? { signedIn: true } : { error: "Session expired." },
        authenticated ? 200 : 401,
      );
    if (path === "/api/auth/login") {
      authenticated = true;
      expiredMedia = false;
      return json(route, { signedIn: true });
    }
    if (path === `/api/projects/${projectId}`) {
      if (method === "GET")
        return json(route, { project: savedProject, media: initialMedia });
      releaseSave = () =>
        json(route, { error: "Older request used an expired session." }, 401);
      saveWaiting();
      return true;
    }
    if (path === `/api/assets/${originalAsset}`)
      return json(
        route,
        expiredMedia
          ? { error: "Image link session expired." }
          : { ...initialMedia.before, src: "/sample/before.png?refreshed" },
        expiredMedia ? 401 : 200,
      );
    return false;
  });
  await page.goto(`/editor/${projectId}`);
  await expect(
    page.getByRole("button", { name: "Export video", exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel("Opening caption")
    .fill("Preserve this caption through expiry.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await saveStarted;
  authenticated = false;
  expiredMedia = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("button", { name: "Retry image access" }),
  ).toBeVisible();
  await page.screenshot({
    path: "out/qa/editor-cloud-expired.png",
    fullPage: true,
  });
  await signIn(page);
  await expect(
    page.getByRole("img", { name: "before website screenshot", exact: true }),
  ).toHaveAttribute("src", "/sample/before.png?refreshed");
  await releaseSave();
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("heading", { name: "Sign in to save and export" }),
  ).toBeHidden();
  await expect(page.getByTestId("editor-error")).toHaveCount(0);
  await expect(page.getByLabel("Opening caption")).toHaveValue(
    "Preserve this caption through expiry.",
  );
  expect(unexpected).toEqual([]);
});

test("a delayed old image refresh cannot replace a newly uploaded screenshot", async ({
  page,
}) => {
  let holdRefresh = false;
  let heldRoute: Route | undefined;
  let refreshWaiting!: () => void;
  const refreshStarted = new Promise<void>((resolve) => {
    refreshWaiting = resolve;
  });
  const newMedia = {
    ...initialMedia.before,
    src: "/sample/after.png?replacement",
  };
  const unexpected = await mockApi(page, async (route, path, method) => {
    if (path === "/api/session") return json(route, { signedIn: true });
    if (path === `/api/projects/${projectId}`)
      return json(route, { project: savedProject, media: initialMedia });
    if (path === "/api/assets" && method === "POST")
      return json(route, { id: replacementAsset, media: newMedia });
    if (path === `/api/assets/${originalAsset}`) {
      if (holdRefresh) {
        heldRoute = route;
        refreshWaiting();
        return true;
      }
      return json(route, initialMedia.before);
    }
    if (path === `/api/assets/${replacementAsset}`)
      return json(route, newMedia);
    return false;
  });
  await page.goto(`/editor/${projectId}`);
  await expect(
    page.getByRole("button", { name: "Export video", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("Project name")).toHaveValue(
    "Saved cloud project",
  );
  holdRefresh = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await refreshStarted;
  await page
    .getByLabel("Upload before screenshot")
    .setInputFiles("public/sample/after.png");
  const image = page.getByRole("img", {
    name: "before website screenshot",
    exact: true,
  });
  await expect(image).toHaveAttribute("src", newMedia.src);
  await heldRoute!
    .fulfill({
      json: { ...initialMedia.before, src: "/sample/before.png?late-old" },
    })
    .catch(() => {});
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeEnabled();
  await expect(image).toHaveAttribute("src", newMedia.src);
  expect(unexpected).toEqual([]);
});

test("a broken private image shows a safe retry and recovers without losing edits", async ({
  page,
}) => {
  const token = "mock-private-token";
  const pageErrors: string[] = [];
  const consoleText: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => consoleText.push(message.text()));
  let repaired = false;
  const broken = {
    ...sampleMedia().after,
    src: `/sample/broken.png?token=${token}`,
  };
  const recovered = {
    ...sampleMedia().after,
    src: "/sample/after.png?recovered",
  };
  const project = { ...sampleProject, after: originalAsset };
  const unexpected = await mockApi(page, async (route, path) => {
    if (path === "/api/session") return json(route, { signedIn: true });
    if (path === `/api/projects/${projectId}`)
      return json(route, {
        project,
        media: { ...sampleMedia(), after: broken },
      });
    if (path === `/api/assets/${originalAsset}`)
      return json(route, repaired ? recovered : broken);
    return false;
  });
  await page.route("**/sample/broken.png?**", (route) =>
    route.fulfill({ status: 404, body: "Image unavailable" }),
  );
  await page.goto(`/editor/${projectId}`);
  await page
    .getByLabel("Opening caption")
    .fill("Keep this caption while the image recovers.");
  await expect(page.locator(".preview-loading[role='alert']")).toContainText(
    "A preview image could not be loaded",
  );
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeDisabled();
  repaired = true;
  await page
    .getByRole("button", { name: "Retry preview", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".preview-loading[role='alert']")).toHaveCount(0);
  await expect(page.getByLabel("Opening caption")).toHaveValue(
    "Keep this caption while the image recovers.",
  );
  await expect(
    page.getByRole("img", { name: "after website screenshot", exact: true }),
  ).toHaveAttribute("src", recovered.src);
  expect(pageErrors).toEqual([]);
  // Browser network diagnostics can carry a URL in location metadata. The
  // application's explicit console text and error messages must stay sanitized.
  expect(consoleText.join("\n")).not.toContain(token);
  expect(unexpected).toEqual([]);
});

test("reusing an export describes its earlier snapshot and keeps later edits unsaved", async ({
  page,
}) => {
  const jobId = "f2c0501e-d27f-4c44-891f-58db94897e09";
  let releaseExport!: () => Promise<boolean>;
  let exportWaiting!: () => void;
  const exportStarted = new Promise<void>((resolve) => {
    exportWaiting = resolve;
  });
  const submitted: unknown[] = [];
  const unexpected = await mockApi(page, async (route, path, method) => {
    if (path === "/api/session") return json(route, { signedIn: true });
    if (path === `/api/projects/${projectId}` && method === "GET")
      return json(route, { project: sampleProject, media: sampleMedia() });
    if (path === `/api/projects/${projectId}` && method === "PUT")
      return json(route, { ok: true });
    if (path === "/api/exports" && method === "POST") {
      submitted.push(route.request().postDataJSON());
      releaseExport = () => json(route, { id: jobId, reused: true });
      exportWaiting();
      return true;
    }
    if (path === `/api/jobs/${jobId}`)
      return json(route, {
        job: {
          id: jobId,
          status: "queued",
          progress: 0,
          attempt_count: 1,
          error: null,
        },
      });
    return false;
  });
  await page.goto(`/editor/${projectId}`);
  await expect(
    page.getByRole("button", { name: "Export video", exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel("Opening caption")
    .fill("The settings submitted for export.");
  await page.getByRole("button", { name: "Export video", exact: true }).click();
  await exportStarted;
  await page.getByLabel("Opening caption").fill("A later edit stays unsaved.");
  await releaseExport();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByText(
      "Showing the existing export with its earlier captured settings. Your submitted settings are saved for your next export.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close export status" }).click();
  await expect(page.getByLabel("Opening caption")).toHaveValue(
    "A later edit stays unsaved.",
  );
  await expect(
    page.getByRole("status").filter({ hasText: "Unsaved changes" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeEnabled();
  expect(submitted).toMatchObject([
    { projectId, project: { opening: "The settings submitted for export." } },
  ]);
  expect(unexpected).toEqual([]);
});
