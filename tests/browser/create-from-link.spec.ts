import { test, expect } from "@playwright/test";

test("automatic creation and the traditional studio are both directly accessible", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Try the studio", exact: true }),
  ).toHaveAttribute("href", "/editor/new");
  await expect(
    page
      .locator("[data-hero-intro]")
      .getByRole("link", { name: "Create a video", exact: true }),
  ).toHaveAttribute("href", "/create");
  await page
    .locator("#product")
    .getByRole("link", { name: "Create from link", exact: true })
    .click();
  await expect(page).toHaveURL(/\/create$/);
  await page
    .getByRole("navigation", { name: "Creation navigation" })
    .getByRole("link", { name: "Try the studio", exact: true })
    .click();
  await expect(page).toHaveURL(/\/editor\/new$/);
  await expect(
    page.getByRole("heading", { name: "The details", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Project name", { exact: true })).toBeVisible();
});

const id = "c".repeat(64);
const endpoint = `/api/create-from-link/${id}`;
const completed = {
  id,
  mode: "local",
  status: "completed",
  progress: 1,
  videoUrl: "/films/demopop-launch.mp4",
  downloadUrl: `${endpoint}/download`,
};

test("one website link automatically creates a finished video with progress and an MP4 download", async ({
  page,
}) => {
  const errors: string[] = [];
  const submissions: unknown[] = [];
  let releaseCapture!: () => void;
  const capturing = new Promise<void>((resolve) => {
    releaseCapture = resolve;
  });
  let polls = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/create-from-link", async (route) => {
    submissions.push(route.request().postDataJSON());
    await capturing;
    await route.fulfill({
      status: 202,
      json: { id, mode: "local", status: "capturing" },
    });
  });
  await page.route(`**${endpoint}`, async (route) => {
    polls++;
    await route.fulfill({
      json:
        polls === 1 ? { id, status: "rendering", progress: 0.4 } : completed,
    });
  });
  await page.goto("/create");
  await page
    .getByLabel("Your website link", { exact: true })
    .fill("example.com");
  await page
    .getByRole("button", { name: "Generate video", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Getting to know your website." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Creating your video…" }),
  ).toBeDisabled();
  await expect(
    page.getByLabel("Your website link", { exact: true }),
  ).toBeDisabled();
  releaseCapture();
  await expect(
    page.getByRole("progressbar", { name: "Video creation progress" }),
  ).toHaveAttribute("value", "0.4");
  await expect(page.getByText("40% complete", { exact: true })).toBeVisible();
  await expect(
    page.getByText("YOUR VIDEO IS READY", { exact: true }),
  ).toBeVisible();
  const video = page.getByLabel("Your generated launch video", { exact: true });
  await expect(video).toHaveAttribute("controls", "");
  await expect(video).not.toHaveAttribute("autoplay", "");
  await expect(
    page.getByRole("link", { name: "Download MP4" }),
  ).toHaveAttribute("href", new RegExp(`${endpoint}/download$`));
  await expect(page.getByRole("link", { name: "Edit your video" })).toHaveCount(
    0,
  );
  expect(submissions).toEqual([
    { url: "example.com", format: "landscape", duration: 30 },
  ]);
  expect(errors).toEqual([]);
});

test("capture errors retain the source and chosen options so the user can retry", async ({
  page,
}) => {
  const submissions: unknown[] = [];
  await page.route("**/api/create-from-link", async (route) => {
    submissions.push(route.request().postDataJSON());
    await route.fulfill(
      submissions.length === 1
        ? {
            status: 422,
            json: {
              error:
                "This website could not be captured. Check the link and try again.",
            },
          }
        : { status: 202, json: { id, mode: "local", status: "queued" } },
    );
  });
  await page.route(`**${endpoint}`, (route) =>
    route.fulfill({ json: completed }),
  );
  await page.goto("/create");
  await page
    .getByLabel("Your website link", { exact: true })
    .fill("https://example.com/product");
  await page.getByText("Video options", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Video format", exact: true })
    .selectOption("vertical");
  await page
    .getByRole("combobox", { name: "Video length", exact: true })
    .selectOption("15");
  await page
    .getByRole("button", { name: "Generate video", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "This website could not be captured",
  );
  await expect(
    page.getByLabel("Your website link", { exact: true }),
  ).toHaveValue("https://example.com/product");
  await page
    .getByRole("button", { name: "Generate video", exact: true })
    .click();
  await expect(
    page.getByText("YOUR VIDEO IS READY", { exact: true }),
  ).toBeVisible();
  expect(submissions).toEqual(
    Array(2).fill({
      url: "https://example.com/product",
      format: "vertical",
      duration: 15,
    }),
  );
  await expect(
    page.getByLabel("Your generated launch video").locator(".."),
  ).toHaveAttribute("data-format", "vertical");
});

test("a lost status connection resumes the existing job without generating another video", async ({
  page,
}) => {
  let submissions = 0,
    polls = 0;
  await page.route("**/api/create-from-link", (route) => {
    submissions++;
    return route.fulfill({
      status: 202,
      json: { id, mode: "local", status: "queued" },
    });
  });
  await page.route(`**${endpoint}`, (route) => {
    polls++;
    return route.fulfill(
      polls === 1
        ? {
            status: 503,
            json: { error: "Temporarily unable to check your video." },
          }
        : { json: completed },
    );
  });
  await page.goto("/create");
  await page
    .getByLabel("Your website link", { exact: true })
    .fill("example.com");
  await page
    .getByRole("button", { name: "Generate video", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Temporarily unable",
  );
  await page.getByRole("button", { name: "Check video status" }).click();
  await expect(
    page.getByText("YOUR VIDEO IS READY", { exact: true }),
  ).toBeVisible();
  expect(submissions).toBe(1);
  expect(polls).toBe(2);
});

test("refreshing the page recovers the existing video job and its source", async ({
  page,
}) => {
  let submissions = 0;
  await page.route("**/api/create-from-link", (route) => {
    submissions++;
    return route.fulfill({
      status: 202,
      json: { id, mode: "local", status: "queued" },
    });
  });
  await page.route(`**${endpoint}`, (route) =>
    route.fulfill({ json: completed }),
  );
  await page.goto("/create");
  await page
    .getByLabel("Your website link", { exact: true })
    .fill("example.com");
  await page
    .getByRole("button", { name: "Generate video", exact: true })
    .click();
  await expect(
    page.getByText("YOUR VIDEO IS READY", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("YOUR VIDEO IS READY", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Your website link", { exact: true }),
  ).toHaveValue("example.com");
  expect(submissions).toBe(1);
});

test("an expired result offers a new generation and preserves the website", async ({
  page,
}) => {
  await page.route("**/api/create-from-link", (route) =>
    route.fulfill({
      status: 202,
      json: { id, mode: "local", status: "queued" },
    }),
  );
  await page.route(`**${endpoint}`, (route) =>
    route.fulfill({
      status: 410,
      json: { error: "This local video has expired. Generate it again." },
    }),
  );
  await page.goto("/create");
  await page
    .getByLabel("Your website link", { exact: true })
    .fill("example.com");
  await page
    .getByRole("button", { name: "Generate video", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "has expired",
  );
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByLabel("Your website link", { exact: true }),
  ).toHaveValue("example.com");
});

test("create from link remains usable on a narrow phone", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/create");
  await page
    .getByLabel("Your website link", { exact: true })
    .fill("my-next-launch.example");
  await page.getByText("Video options", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Video format", exact: true })
    .selectOption("square");
  await expect(
    page.getByRole("button", { name: "Generate video", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("create-from-link-mobile.png"),
    fullPage: true,
  });
});

test("refresh video retries the media request even when its stable URL is unchanged", async ({
  page,
}) => {
  let mediaRequests = 0;
  await page.route("**/api/create-from-link", (route) =>
    route.fulfill({
      status: 202,
      json: { id, mode: "local", status: "queued" },
    }),
  );
  await page.route(`**${endpoint}`, (route) =>
    route.fulfill({ json: completed }),
  );
  await page.route("**/films/demopop-launch.mp4", (route) => {
    mediaRequests++;
    return mediaRequests === 1
      ? route.fulfill({ contentType: "video/mp4", body: "Invalid video" })
      : route.fulfill({
          contentType: "video/mp4",
          path: "public/films/demopop-launch.mp4",
        });
  });
  await page.goto("/create");
  await page
    .getByLabel("Your website link", { exact: true })
    .fill("example.com");
  await page
    .getByRole("button", { name: "Generate video", exact: true })
    .click();
  const video = page.getByLabel("Your generated launch video", { exact: true });
  await expect(
    page.getByRole("button", { name: "Refresh video", exact: true }),
  ).toBeVisible();
  const original = await video.elementHandle();
  await page
    .getByRole("button", { name: "Refresh video", exact: true })
    .click();
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) => element.readyState),
    )
    .toBeGreaterThanOrEqual(1);
  expect(await original!.evaluate((element) => element.isConnected)).toBe(
    false,
  );
  expect(mediaRequests).toBeGreaterThanOrEqual(2);
  await expect(video).toHaveAttribute("src", /\/films\/demopop-launch\.mp4$/);
  await expect(
    page.getByRole("button", { name: "Refresh video", exact: true }),
  ).toHaveCount(0);
});

test("refreshing an expired video removes stale playback and download while preserving the saved project", async ({
  page,
}) => {
  const projectId = "33333333-3333-4333-8333-333333333333";
  let statusRequests = 0;
  await page.route("**/api/create-from-link", (route) =>
    route.fulfill({
      status: 202,
      json: { id, projectId, mode: "cloud", status: "queued" },
    }),
  );
  await page.route(`**${endpoint}`, (route) => {
    statusRequests++;
    return route.fulfill(
      statusRequests === 1
        ? { json: { ...completed, mode: "cloud", projectId } }
        : {
            status: 410,
            json: {
              error:
                "This video has expired. Open its saved project to export again.",
              projectId,
            },
          },
    );
  });
  await page.route("**/films/demopop-launch.mp4", (route) =>
    route.fulfill({ contentType: "video/mp4", body: "Expired video" }),
  );
  await page.goto("/create");
  await page
    .getByLabel("Your website link", { exact: true })
    .fill("example.com");
  await page
    .getByRole("button", { name: "Generate video", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Download MP4", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Refresh video", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "This video has expired",
  );
  await expect(
    page.getByLabel("Your generated launch video", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Download MP4", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("YOUR VIDEO IS READY", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("link", { name: "Open saved project" }),
  ).toHaveAttribute("href", `/editor/${projectId}`);
});

test("an authentication handoff restores the source in a new tab without sharing job tokens", async ({
  page,
}) => {
  const pendingKey = "demopop:create-from-link:pending:v1";
  await page.route("**/api/create-from-link", (route) =>
    route.fulfill({
      status: 401,
      json: { error: "Sign in to generate your video." },
    }),
  );
  await page.goto("/create");
  await page
    .getByLabel("Your website link", { exact: true })
    .fill("https://example.com/new-product");
  await page.getByText("Video options", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Video format", exact: true })
    .selectOption("vertical");
  await page
    .getByRole("combobox", { name: "Video length", exact: true })
    .selectOption("60");
  await page
    .getByRole("button", { name: "Generate video", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Sign in to generate", exact: true }),
  ).toBeVisible();
  const pending = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    pendingKey,
  );
  expect(Object.keys(pending).sort()).toEqual([
    "duration",
    "format",
    "savedAt",
    "url",
  ]);
  const confirmationTab = await page.context().newPage();
  await confirmationTab.route("**/api/create-from-link", (route) =>
    route.fulfill({
      status: 202,
      json: { id, mode: "local", status: "queued" },
    }),
  );
  await confirmationTab.route(`**${endpoint}`, (route) =>
    route.fulfill({ json: completed }),
  );
  await confirmationTab.goto("/create");
  await expect(
    confirmationTab.getByLabel("Your website link", { exact: true }),
  ).toHaveValue("https://example.com/new-product");
  await confirmationTab.getByText("Video options", { exact: true }).click();
  await expect(
    confirmationTab.getByRole("combobox", {
      name: "Video format",
      exact: true,
    }),
  ).toHaveValue("vertical");
  await expect(
    confirmationTab.getByRole("combobox", {
      name: "Video length",
      exact: true,
    }),
  ).toHaveValue("60");
  await confirmationTab
    .getByRole("button", { name: "Generate video", exact: true })
    .click();
  await expect(
    confirmationTab.getByText("YOUR VIDEO IS READY", { exact: true }),
  ).toBeVisible();
  expect(
    await confirmationTab.evaluate(
      (key) => localStorage.getItem(key),
      pendingKey,
    ),
  ).toBeNull();
});
