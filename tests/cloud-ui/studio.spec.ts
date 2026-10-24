import { test, expect, type Page, type Route } from "@playwright/test";
import { sampleProject, sampleMedia } from "../../src/shared/project";
const owner = "11111111-1111-4111-8111-111111111111";
const projectId = "33333333-3333-4333-8333-333333333333";
const kitId = "44444444-4444-4444-8444-444444444444";
async function respond(route: Route, value: unknown, status = 200) {
  await route.fulfill({ status, json: value });
  return true;
}
async function setup(
  page: Page,
  handler: (route: Route, path: string, method: string) => Promise<boolean>,
) {
  const unexpected: string[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname,
      method = route.request().method();
    if (await handler(route, path, method)) return;
    if (path === "/api/metrics")
      return void (await route.fulfill({ status: 204 }));
    if (path === "/api/session")
      return void (await respond(route, { signedIn: true, userId: owner }));
    if (path === "/api/brand-kits" && method === "GET")
      return void (await respond(route, { kits: [] }));
    if (path === "/api/recipes" && method === "GET")
      return void (await respond(route, { recipes: [] }));
    if (path === `/api/projects/${projectId}` && method === "GET")
      return void (await respond(route, {
        project: sampleProject,
        media: sampleMedia(),
      }));
    if (path === `/api/projects/${projectId}/exports`)
      return void (await respond(route, { jobs: [], hasMore: false }));
    unexpected.push(`${method} ${path}`);
    await respond(route, { error: "Unexpected mocked API call" }, 501);
  });
  return unexpected;
}

test("launch export captures the chosen soundtrack and CTA in its snapshot", async ({
  page,
}) => {
  const jobId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const captured: unknown[] = [];
  const unexpected = await setup(page, async (route, path, method) => {
    if (path === "/api/projects" && method === "POST")
      return respond(route, { id: projectId });
    if (path === "/api/exports" && method === "POST") {
      captured.push(route.request().postDataJSON());
      return respond(route, { id: jobId, reused: false });
    }
    if (path === `/api/jobs/${jobId}`)
      return respond(route, {
        job: {
          id: jobId,
          status: "queued",
          progress: 0,
          attempt_count: 1,
          error: null,
          template: "launch",
          format: "vertical",
        },
      });
    return false;
  });
  await page.goto("/editor/new");
  await expect(
    page.getByRole("button", { name: "Export video", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Closing call to action").fill("Join the launch.");
  await page.getByRole("button", { name: "Export video", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(captured).toMatchObject([
    {
      projectId,
      project: {
        template: "launch",
        sound: "pulse",
        cta: "Join the launch.",
        before: "sample-launch-before",
        after: "sample-launch-after",
      },
    },
  ]);
  expect(unexpected).toEqual([]);
});

test("brand kits save, apply, update and delete without changing the story", async ({
  page,
}) => {
  const kits = [
    {
      id: kitId,
      name: "Studio North",
      color: "#004466",
      font: "dm-sans",
      logo: null,
      url: "north.example",
    },
  ];
  const unexpected = await setup(page, async (route, path, method) => {
    if (path === "/api/brand-kits" && method === "GET")
      return respond(route, { kits });
    if (path === "/api/brand-kits" && method === "POST") {
      const kit = route.request().postDataJSON();
      expect(kit).toMatchObject({
        name: "Client B",
        font: "dm-sans",
        color: "#004466",
      });
      kits.push({ ...kit, id: "55555555-5555-4555-8555-555555555555" });
      return respond(route, { id: kits[1].id });
    }
    if (path === `/api/brand-kits/55555555-5555-4555-8555-555555555555`) {
      if (method === "PUT") {
        kits[1] = { ...route.request().postDataJSON(), id: kits[1].id };
        return respond(route, { id: kits[1].id });
      }
      if (method === "DELETE") {
        kits.splice(1, 1);
        return respond(route, { ok: true });
      }
    }
    return false;
  });
  await page.goto("/editor/new");
  await page.getByLabel("Opening caption").fill("Keep this exact story.");
  await page
    .getByRole("combobox", { name: "Saved brand kit", exact: true })
    .selectOption(kitId);
  await expect(page.getByLabel("Choose brand color")).toHaveValue("#004466");
  await expect(
    page.getByRole("combobox", { name: "Video font", exact: true }),
  ).toHaveValue("dm-sans");
  await expect(page.getByLabel("Closing URL text")).toHaveValue(
    "north.example",
  );
  await expect(page.getByLabel("Opening caption")).toHaveValue(
    "Keep this exact story.",
  );
  await page.getByLabel("Brand kit name", { exact: true }).fill("Client B");
  await page
    .getByRole("button", { name: "Save new brand kit", exact: true })
    .click();
  await expect(
    page.getByText("Brand kit saved.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: "Client B", exact: true }),
  ).toHaveCount(1);
  await page.getByLabel("Choose brand color").fill("#223344");
  await page.getByRole("button", { name: "Update kit", exact: true }).click();
  await expect.poll(() => kits[1].color).toBe("#223344");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete kit", exact: true }).click();
  await expect(
    page.getByText("Brand kit deleted.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Choose brand color")).toHaveValue("#223344");
  expect(unexpected).toEqual([]);
});

test("project search, duplicate, trash and restore preserve recoverable project management", async ({
  page,
}) => {
  const projects = [
    {
      id: projectId,
      name: "Client Alpha",
      updated_at: new Date().toISOString(),
      deleted_at: null as string | null,
      format: "landscape",
      template: "split",
    },
    {
      id: kitId,
      name: "Active project",
      updated_at: new Date().toISOString(),
      deleted_at: null as string | null,
    },
  ];
  let failFirstLoad = true;
  const unexpected = await setup(page, async (route, path, method) => {
    if (path === "/api/projects" && method === "GET") {
      if (failFirstLoad) {
        failFirstLoad = false;
        return respond(
          route,
          { error: "The workspace is temporarily unavailable." },
          503,
        );
      }
      const trash =
        new URL(route.request().url()).searchParams.get("trash") === "1";
      return respond(route, {
        projects: projects.filter((p) => Boolean(p.deleted_at) === trash),
      });
    }
    const match = path.match(
      /^\/api\/projects\/([^/]+)\/(duplicate|trash|restore)$/,
    );
    if (!match) return false;
    const project = projects.find((p) => p.id === match[1])!;
    if (match[2] === "duplicate") {
      const copy = {
        ...project,
        id: "66666666-6666-4666-8666-666666666666",
        name: `${project.name} (copy)`,
      };
      projects.push(copy);
      return respond(route, { id: copy.id });
    }
    if (match[2] === "trash" && project.id === kitId)
      return respond(
        route,
        {
          error:
            "Wait for the active export to finish before moving this project to trash.",
        },
        409,
      );
    project.deleted_at = match[2] === "trash" ? new Date().toISOString() : null;
    return respond(route, { id: project.id });
  });
  await page.goto("/projects");
  const loadAlert = page
    .getByRole("alert")
    .filter({ hasText: "temporarily unavailable" });
  await expect(loadAlert).toContainText("temporarily unavailable");
  await expect(loadAlert.getByRole("link", { name: /Sign in/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByText("Landscape", { exact: true })).toBeVisible();
  await expect(page.getByText("Split Compare", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "out/qa/projects-quality-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Duplicate Client Alpha", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Client Alpha (copy)", exact: true }),
  ).toBeVisible();
  await page.getByRole("searchbox", { name: "Search projects" }).fill("copy");
  await expect(
    page.getByRole("heading", { name: "Client Alpha", exact: true }),
  ).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", {
      name: "Move Client Alpha (copy) to trash",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Client Alpha (copy)", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Client Alpha (copy)", exact: true }),
  ).toBeVisible();
  await page.getByRole("searchbox", { name: "Search projects" }).clear();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Move Active project to trash", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "active export" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "active export" })
      .getByRole("link", { name: /Sign in/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Active project", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "out/qa/projects-quality-mobile.png",
    fullPage: true,
  });
  expect(unexpected).toEqual([]);
});

test("export history downloads retained output and retries failures while expired output stays unavailable", async ({
  page,
}) => {
  const completed = "77777777-7777-4777-8777-777777777777",
    failed = "88888888-8888-4888-8888-888888888888";
  const jobs = [
    {
      id: completed,
      status: "completed",
      progress: 1,
      attempt_count: 1,
      error: null,
      format: "landscape",
      template: "slide",
      created_at: "2026-10-15T12:00:00Z",
      output_expired_at: null,
    },
    {
      id: kitId,
      status: "completed",
      progress: 1,
      attempt_count: 1,
      error: null,
      format: "vertical",
      template: "reveal",
      created_at: "2026-09-01T12:00:00Z",
      output_expired_at: "2026-10-02T12:00:00Z",
    },
    {
      id: failed,
      status: "failed",
      progress: 0,
      attempt_count: 1,
      error: "Please retry this export.",
      format: "vertical",
      template: "split",
      created_at: "2026-10-16T12:00:00Z",
      output_expired_at: null,
    },
  ];
  const unexpected = await setup(page, async (route, path) => {
    if (path === `/api/projects/${projectId}`)
      return respond(route, {
        project: sampleProject,
        media: sampleMedia(),
        job: jobs[1],
      });
    if (path === `/api/projects/${projectId}/exports`)
      return respond(route, { jobs, hasMore: false });
    if (path === `/api/jobs/${completed}/download`)
      return respond(route, { url: "/sample/test-download.mp4" });
    if (path === `/api/jobs/${failed}/retry`) {
      jobs[2].status = "queued";
      return respond(route, { id: failed });
    }
    if (path === `/api/jobs/${failed}`) return respond(route, { job: jobs[2] });
    return false;
  });
  await page.route("**/sample/test-download.mp4", (route) =>
    route.fulfill({
      contentType: "video/mp4",
      body: "mocked-download",
      headers: {
        "Content-Disposition": "attachment; filename=demopop-redesign.mp4",
      },
    }),
  );
  await page.goto(`/editor/${projectId}`);
  await expect(
    page.getByRole("heading", { name: "Export history", exact: true }),
  ).toBeVisible();
  const expired = page.getByRole("listitem").filter({ hasText: "Expired" });
  await expect(expired.getByRole("button")).toHaveCount(0);
  await page.getByRole("button", { name: /This export has expired/ }).click();
  const expiredDialog = page.getByRole("dialog");
  await expect(expiredDialog.getByRole("heading")).toHaveText(
    "This export has expired.",
  );
  await expect(
    expiredDialog.getByRole("button", { name: "Download MP4", exact: true }),
  ).toHaveCount(0);
  await expiredDialog
    .getByRole("button", { name: "Close export status" })
    .click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download MP4", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("demopop-redesign.mp4");
  await page.getByRole("button", { name: "Retry export", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "You’re in the queue.", exact: true }),
  ).toBeVisible();
  expect(unexpected).toEqual([]);
});

test("password recovery requests a link and validates the replacement password", async ({
  page,
}) => {
  let requested = false,
    updated = false;
  const unexpected = await setup(page, async (route, path) => {
    if (path === "/api/auth/recover") {
      expect(route.request().postDataJSON()).toEqual({
        email: "designer@example.test",
      });
      requested = true;
      return respond(route, {
        message:
          "If an account exists for that email, a recovery link will arrive shortly.",
      });
    }
    if (path === "/api/auth/password") {
      updated = true;
      expect(route.request().postDataJSON()).toEqual({
        password: "new-mock-password-123",
      });
      return respond(route, { ok: true });
    }
    return false;
  });
  await page.goto("/auth");
  await page
    .getByRole("button", { name: "Forgot password?", exact: true })
    .click();
  await page.getByLabel("Email address").fill("designer@example.test");
  await page
    .getByRole("button", { name: "Send recovery link", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("If an account exists");
  expect(requested).toBe(true);
  await page.goto("/auth/reset");
  await page
    .getByLabel("New password", { exact: true })
    .fill("new-mock-password-123");
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("different-password");
  await page
    .getByRole("button", { name: "Update password", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "do not match" }),
  ).toBeVisible();
  expect(updated).toBe(false);
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("new-mock-password-123");
  await page
    .getByRole("button", { name: "Update password", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Password updated.", exact: true }),
  ).toBeVisible();
  expect(updated).toBe(true);
  expect(unexpected).toEqual([]);
});
