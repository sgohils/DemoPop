import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import {
  launchProject,
  launchMedia,
  type ProjectInput,
} from "../../src/shared/project";
import { starterStory } from "../../src/shared/launch-kit";

const projectId = "33333333-3333-4333-8333-333333333333";
const jobId = "44444444-4444-4444-8444-444444444444";
function initialProject(): ProjectInput {
  return {
    ...launchProject,
    format: "landscape",
    story: starterStory(launchProject, [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "55555555-5555-4555-8555-555555555555",
    ]),
  };
}
async function fixture(
  page: Page,
  options: { failRead?: boolean; failSave?: boolean } = {},
) {
  let project = initialProject();
  let paid = false,
    reads = 0;
  const captures: unknown[] = [],
    exports: { projectId: string; project: ProjectInput }[] = [],
    saves: ProjectInput[] = [],
    unexpected: string[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === "/api/metrics") return route.fulfill({ status: 204 });
    if (path === "/api/create-from-link") {
      captures.push(route.request().postDataJSON());
      return route.fulfill({
        status: 202,
        json: { status: "draft", mode: "cloud", projectId },
      });
    }
    if (path === `/api/projects/${projectId}`) {
      if (method === "GET") {
        reads++;
        if (options.failRead && reads === 1)
          return route.fulfill({
            status: 503,
            json: { error: "Preview is temporarily unavailable." },
          });
        return route.fulfill({ json: { project, media: launchMedia() } });
      }
      if (method === "PUT") {
        if (options.failSave)
          return route.fulfill({
            status: 503,
            json: { error: "Your draft could not be saved. Please retry." },
          });
        project = route.request().postDataJSON();
        saves.push(project);
        return route.fulfill({ json: { saved: true } });
      }
    }
    if (path === "/api/exports") {
      exports.push(route.request().postDataJSON());
      expect(saves.length).toBeGreaterThan(0);
      return route.fulfill(
        paid
          ? { status: 202, json: { id: jobId } }
          : {
              status: 402,
              json: {
                error:
                  "Choose a launch package or Studio plan to export this project.",
              },
            },
      );
    }
    if (path === `/api/create-from-link/${jobId}`)
      return route.fulfill({
        json: {
          id: jobId,
          projectId,
          mode: "cloud",
          status: "completed",
          progress: 1,
          outputFormat: project.format,
          outputDuration: project.story?.duration,
          videoUrl: "/films/campaign/landscape-original.mp4",
          downloadUrl: `/api/exports/${jobId}/download`,
        },
      });
    unexpected.push(`${method} ${path}`);
    return route.fulfill({
      status: 501,
      json: { error: "Unexpected mocked API request" },
    });
  });
  return {
    captures,
    exports,
    saves,
    unexpected,
    pay: () => {
      paid = true;
    },
    revise: (edits: Partial<ProjectInput>) => {
      project = { ...project, ...edits };
    },
  };
}
async function capture(page: Page) {
  await page.goto("/create");
  await page
    .getByLabel("Your website link", { exact: true })
    .fill("example.com/features");
  await page.getByRole("button", { name: "Feature spotlight" }).click();
  await page
    .getByRole("button", { name: "Preview your video", exact: true })
    .click();
}
async function screenshot(page: Page, name: string) {
  await mkdir("out/qa/competitive", { recursive: true });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        window.scrollTo({ top: 0, behavior: "instant" });
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await page.screenshot({
    path: `out/qa/competitive/${name}.png`,
    fullPage: true,
  });
}

test("personalized preview is free; reviewed edits survive payment and export the same project", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const api = await fixture(page);
  await capture(page);
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  expect(api.exports).toHaveLength(0);
  expect(api.captures).toEqual([
    {
      url: "example.com/features",
      format: "landscape",
      duration: 30,
      goal: "feature",
      previewOnly: true,
    },
  ]);
  await expect(
    page.getByLabel("Your website link", { exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Opening headline").fill("A launch worth sharing.");
  await page
    .getByRole("textbox", { name: "Scene 1", exact: true })
    .fill("The detail your clients will remember.");
  await page.getByLabel("Call to action").fill("Explore the launch");
  await page.getByLabel("Client folder").fill("North Studio");
  await page.getByText("Video options", { exact: true }).click();
  await page.getByLabel("Video format").selectOption("square");
  await page.getByLabel("Video length").selectOption("15");
  const shell = page.locator(".preview-unit .video-shell");
  const square = await shell.boundingBox();
  expect(square).not.toBeNull();
  expect(Math.abs(square!.width - square!.height)).toBeLessThan(2);
  expect(
    await page
      .locator(".preview-unit .transport")
      .evaluate((element) => getComputedStyle(element).color),
  ).toBe("rgb(39, 49, 31)");
  await screenshot(page, "draft-desktop");
  await page
    .getByRole("button", { name: "Export MP4", exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Your edits are saved",
  );
  await expect(
    page.getByRole("link", { name: "Choose a package to export" }),
  ).toHaveAttribute("href", `/pricing?project=${projectId}`);
  expect(api.saves[0]).toMatchObject({
    opening: "A launch worth sharing.",
    cta: "Explore the launch",
    client: "North Studio",
    format: "square",
    story: { duration: 15 },
  });
  await page.reload();
  await expect(page.getByLabel("Opening headline")).toHaveValue(
    "A launch worth sharing.",
  );
  expect(api.captures).toHaveLength(1);
  api.pay();
  await page
    .getByRole("button", { name: "Export MP4", exact: true })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByText("YOUR VIDEO IS READY", { exact: true }),
  ).toBeVisible();
  expect(api.exports).toHaveLength(2);
  expect(api.exports[1].projectId).toBe(projectId);
  expect(api.exports[1].project.before).toBe(initialProject().before);
  expect(api.exports[1].project.story?.scenes[0].caption).toBe(
    "The detail your clients will remember.",
  );
  await expect(page.getByRole("link", { name: "Download MP4" })).toBeVisible();
  await page.getByText("Video options", { exact: true }).click();
  await page.getByLabel("Video format").selectOption("vertical");
  await page.getByLabel("Video length").selectOption("60");
  await expect(page.getByText("15 SEC / 1:1", { exact: true })).toBeVisible();
  expect(api.unexpected).toEqual([]);
  expect(errors).toEqual([]);
});

test("a failed draft read can retry and reload without capturing the website again", async ({
  page,
}) => {
  const api = await fixture(page, { failRead: true });
  await capture(page);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Preview is temporarily unavailable",
  );
  await expect(
    page.getByRole("button", { name: "Preview your video", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Retry opening preview", exact: true })
    .click();
  await expect(page.getByLabel("Opening headline")).toHaveValue(
    launchProject.opening,
  );
  await page.reload();
  await expect(page.getByLabel("Opening headline")).toHaveValue(
    launchProject.opening,
  );
  expect(api.captures).toHaveLength(1);
  expect(api.exports).toHaveLength(0);
  expect(api.unexpected).toEqual([]);
});

test("opening the full studio saves inline edits before navigating", async ({
  page,
}) => {
  const api = await fixture(page);
  await capture(page);
  await page
    .getByLabel("Opening headline")
    .fill("Keep this reviewed headline.");
  await page.getByRole("button", { name: "Open the full studio" }).click();
  await expect(page).toHaveURL(new RegExp(`/editor/${projectId}$`));
  expect(api.saves[0].opening).toBe("Keep this reviewed headline.");
  expect(api.exports).toHaveLength(0);
  api.revise({
    opening: "An edit made in the full studio.",
    format: "vertical",
  });
  await page.goto("/create");
  await expect(page.getByLabel("Opening headline")).toHaveValue(
    "An edit made in the full studio.",
  );
  await page.getByText("Video options", { exact: true }).click();
  await expect(page.getByLabel("Video format")).toHaveValue("vertical");
});

test("a failed save keeps the editable draft and never starts an export", async ({
  page,
}) => {
  const api = await fixture(page, { failSave: true });
  await capture(page);
  await page.getByLabel("Opening headline").fill("Keep this on a failed save.");
  await page
    .getByRole("button", { name: "Export MP4", exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "could not be saved",
  );
  await expect(page.getByLabel("Opening headline")).toHaveValue(
    "Keep this on a failed save.",
  );
  expect(api.exports).toHaveLength(0);
});

for (const width of [390, 320])
  test(`mobile draft at ${width}px offers motion and story without horizontal overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const api = await fixture(page);
    await capture(page);
    await expect(
      page.getByRole("button", { name: "Play", exact: true }),
    ).toBeEnabled();
    await expect(page.getByLabel("Opening headline")).toBeHidden();
    await screenshot(page, `draft-mobile-${width}`);
    await page.getByRole("button", { name: "Edit story", exact: true }).click();
    await page.getByLabel("Opening headline").fill("");
    await page
      .getByRole("button", { name: "Motion preview", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Play", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Export MP4", exact: true })
      .filter({ visible: true })
      .click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "Add an opening headline",
    );
    await expect(page.getByLabel("Opening headline")).toBeVisible();
    await page.getByLabel("Opening headline").fill("Ready for the reveal.");
    await screenshot(page, `story-mobile-${width}`);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(api.exports).toHaveLength(0);
    expect(errors).toEqual([]);
  });
