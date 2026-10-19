import { test, expect } from "@playwright/test";
import {
  launchProject,
  launchMedia,
  type ProjectInput,
} from "../../src/shared/project";
import { starterStory } from "../../src/shared/launch-kit";
const owner = "11111111-1111-4111-8111-111111111111",
  projectId = "33333333-3333-4333-8333-333333333333",
  jobId = "44444444-4444-4444-8444-444444444444",
  reviewId = "55555555-5555-4555-8555-555555555555";
const scenes = starterStory(launchProject, [
  "66666666-6666-4666-8666-666666666666",
  "77777777-7777-4777-8777-777777777777",
  "88888888-8888-4888-8888-888888888888",
]);

test("agency delivery captures package hooks, creates and revokes version review links", async ({
  page,
}) => {
  const project = { ...launchProject, client: "Acme", story: scenes };
  const packages: unknown[] = [],
    created: unknown[] = [];
  let revoked = false,
    reviewCreated = false;
  const job = {
    id: jobId,
    status: "completed",
    progress: 1,
    attempt_count: 1,
    error: null,
    created_at: "2026-10-18T15:00:00Z",
    format: "landscape",
    template: "launch",
    output_kind: "launch-pack",
    duration: 30,
  };
  const unexpected: string[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname,
      method = route.request().method();
    let json: unknown;
    if (path === "/api/session") json = { signedIn: true, userId: owner };
    else if (path === "/api/brand-kits") json = { kits: [] };
    else if (path === "/api/recipes") json = { recipes: [] };
    else if (path === `/api/projects/${projectId}`)
      json = { project, media: { ...launchMedia(), sceneMedia: {} }, job };
    else if (path === `/api/projects/${projectId}/exports`)
      json = { jobs: [job], hasMore: false };
    else if (path === `/api/projects/${projectId}/reviews` && method === "GET")
      json = {
        reviews: reviewCreated
          ? [
              {
                id: reviewId,
                url: `http://127.0.0.1:3108/review/${"a".repeat(64)}`,
                agency_name: "North Studio",
                status: "pending",
                approved_by: null,
                expires_at: "2026-11-01T15:00:00Z",
                revoked_at: revoked ? "2026-10-18T16:00:00Z" : null,
                review_comments: [],
              },
            ]
          : [],
      };
    else if (
      path === `/api/projects/${projectId}/reviews` &&
      method === "POST"
    ) {
      created.push(route.request().postDataJSON());
      reviewCreated = true;
      json = {
        id: reviewId,
        url: `http://127.0.0.1:3108/review/${"a".repeat(64)}`,
      };
    } else if (path === `/api/reviews/${reviewId}` && method === "DELETE") {
      revoked = true;
      json = { ok: true };
    } else if (path === "/api/exports" && method === "POST") {
      packages.push(route.request().postDataJSON());
      json = {
        id: "99999999-9999-4999-8999-999999999999",
        reused: false,
        outputKind: "launch-pack",
      };
    } else if (path === "/api/jobs/99999999-9999-4999-8999-999999999999")
      json = {
        job: {
          ...job,
          id: "99999999-9999-4999-8999-999999999999",
          status: "queued",
          progress: 0,
        },
      };
    else {
      unexpected.push(`${method} ${path}`);
      await route.fulfill({
        status: 501,
        json: { error: "Unexpected API request" },
      });
      return;
    }
    await route.fulfill({ json });
  });
  await page.goto(`/editor/${projectId}`);
  await page.getByText("Client review & approval", { exact: true }).click();
  await page
    .getByLabel("Review brand name", { exact: true })
    .fill("North Studio");
  await page
    .getByRole("button", { name: "Create review link", exact: true })
    .click();
  await expect(
    page.getByLabel("Review link for North Studio", { exact: true }),
  ).toBeVisible();
  expect(created).toEqual([
    { jobId, agencyName: "North Studio", allowDownload: true },
  ]);
  await page.getByRole("button", { name: "Revoke", exact: true }).click();
  await expect(
    page.getByLabel("Review link for North Studio", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Package hook 2", { exact: false })
    .fill("Meet the next Acme.");
  await page
    .getByRole("button", { name: "Export launch package", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(packages).toMatchObject([
    {
      projectId,
      outputKind: "launch-pack",
      project: {
        client: "Acme",
        story: { duration: 30 },
        hooks: [project.opening, "Meet the next Acme.", project.highlight1],
      },
    },
  ]);
  expect(unexpected).toEqual([]);
});

test("client folders organize saved projects and account recipes reapply captured stories", async ({
  page,
}) => {
  let saved: ProjectInput = { ...launchProject, client: "Acme", story: scenes };
  const recipes: {
    id: string;
    name: string;
    settings: ProjectInput;
    updated_at: string;
  }[] = [];
  const unexpected: string[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname,
      method = route.request().method();
    let json: unknown;
    if (path === "/api/session") json = { signedIn: true, userId: owner };
    else if (path === "/api/brand-kits") json = { kits: [] };
    else if (path === "/api/projects")
      json = {
        projects: [
          {
            id: projectId,
            name: "Acme launch",
            client: "Acme",
            duration: 30,
            format: "landscape",
            template: "launch",
            updated_at: "2026-10-18T15:00:00Z",
          },
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            name: "Beta launch",
            client: "Beta",
            duration: 15,
            format: "square",
            template: "launch",
            updated_at: "2026-10-18T15:00:00Z",
          },
        ],
      };
    else if (path === `/api/projects/${projectId}`)
      json = { project: saved, media: { ...launchMedia(), sceneMedia: {} } };
    else if (path === `/api/projects/${projectId}/exports`)
      json = { jobs: [], hasMore: false };
    else if (path === "/api/recipes" && method === "GET") json = { recipes };
    else if (path === "/api/recipes" && method === "POST") {
      const body = route.request().postDataJSON();
      saved = body.project;
      recipes.push({
        id: reviewId,
        name: body.name,
        settings: structuredClone(body.project),
        updated_at: "2026-10-18T15:00:00Z",
      });
      json = { id: reviewId };
    } else {
      unexpected.push(`${method} ${path}`);
      await route.fulfill({ status: 501, json: { error: "Unexpected API" } });
      return;
    }
    await route.fulfill({ json });
  });
  await page.goto("/projects");
  await page
    .getByRole("navigation", { name: "Client folders", exact: true })
    .getByRole("button", { name: /^Acme/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Acme launch", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Beta launch", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Acme launch", exact: true }).click();
  await page.getByLabel("Recipe name", { exact: true }).fill("Acme campaign");
  await page
    .getByRole("button", { name: "Save launch recipe", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Apply recipe Acme campaign",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("Scene 1 caption", { exact: true }).fill("Later edit");
  await page
    .getByRole("button", { name: "Apply recipe Acme campaign", exact: true })
    .click();
  await expect(page.getByLabel("Scene 1 caption", { exact: true })).toHaveValue(
    launchProject.highlight1,
  );
  expect(unexpected).toEqual([]);
});
