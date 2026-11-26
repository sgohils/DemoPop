import { test, expect } from "@playwright/test";
import {
  launchProject,
  launchMedia,
  type ProjectInput,
} from "../../src/shared/project";
import { starterStory } from "../../src/shared/launch-kit";

for (const outputKind of ["video", "launch-pack"] as const) {
  test(`previewing another version preserves the main film and exact crops in ${outputKind} export`, async ({
    page,
  }) => {
    const owner = "11111111-1111-4111-8111-111111111111";
    const projectId = "33333333-3333-4333-8333-333333333333";
    const jobId = "44444444-4444-4444-8444-444444444444";
    const story = starterStory(launchProject, [
      "66666666-6666-4666-8666-666666666666",
      "77777777-7777-4777-8777-777777777777",
      "88888888-8888-4888-8888-888888888888",
    ]);
    story.scenes[0].formatCrops = {
      vertical: { x: 0.1, y: 0.2, zoom: 1.6 },
      square: { x: 0.8, y: 0.5, zoom: 1.2 },
    };
    const project: ProjectInput = {
      ...launchProject,
      story,
      hooks: [
        "A launch worth sharing.",
        "Meet your next big idea.",
        "Move from draft to launch.",
      ],
    };
    const mutations: { path: string; body: unknown }[] = [];
    const unexpected: string[] = [];
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();
      let json: unknown;
      if (path === "/api/metrics")
        return void (await route.fulfill({ status: 204 }));
      if (path === "/api/session") json = { signedIn: true, userId: owner };
      else if (path === "/api/brand-kits") json = { kits: [] };
      else if (path === "/api/recipes") json = { recipes: [] };
      else if (path === `/api/projects/${projectId}` && method === "GET")
        json = { project, media: { ...launchMedia(), sceneMedia: {} } };
      else if (path === `/api/projects/${projectId}/exports`)
        json = { jobs: [], hasMore: false };
      else if (path === `/api/projects/${projectId}` && method === "PUT") {
        mutations.push({ path, body: route.request().postDataJSON() });
        json = { ok: true };
      } else if (path === "/api/exports" && method === "POST") {
        mutations.push({ path, body: route.request().postDataJSON() });
        json = { id: jobId, reused: false, outputKind };
      } else if (path === `/api/jobs/${jobId}`)
        json = {
          job: { id: jobId, status: "queued", progress: 0, attempt_count: 0 },
        };
      else {
        unexpected.push(`${method} ${path}`);
        return void (await route.fulfill({
          status: 501,
          json: { error: "Unexpected API" },
        }));
      }
      await route.fulfill({ json });
    });
    await page.goto(`/editor/${projectId}`);
    await expect(
      page.getByRole("button", { name: "Save", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Preview 9 versions", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Preview square package", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Preview package hook 2", exact: true })
      .click();
    await expect(page.locator(".editor-stage .video-shell")).toContainText(
      project.hooks![1],
    );
    await expect(
      page.getByRole("button", { name: "Save", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Undo", exact: true }),
    ).toBeDisabled();
    expect(mutations).toEqual([]);
    await page.screenshot({
      path: `out/qa/package-preview/desktop-square-hook-${outputKind}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", {
        name:
          outputKind === "video" ? "Export main film" : "Export launch package",
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(mutations).toEqual([
      { path: `/api/projects/${projectId}`, body: project },
      {
        path: "/api/exports",
        body: { projectId, project, outputKind },
      },
    ]);
    expect(unexpected).toEqual([]);
  });
}
