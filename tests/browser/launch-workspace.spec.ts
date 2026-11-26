import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("product stories support six scenes, timing, reorder, framing, media replacement and incomplete draft recovery", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/editor/new");
  await page
    .getByRole("button", { name: "Product story", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Story duration", exact: true }),
  ).toHaveValue("30");
  await expect(
    page.getByRole("group", { name: /^Story scene \d$/ }),
  ).toHaveCount(3);
  await page
    .getByLabel("Scene 1 caption", { exact: true })
    .fill("First feature to show.");
  await page.getByRole("button", { name: "Add scene", exact: true }).click();
  await page.getByRole("button", { name: "Add scene", exact: true }).click();
  await page.getByRole("button", { name: "Add scene", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add scene", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("group", { name: /^Story scene \d$/ }),
  ).toHaveCount(6);
  await page.getByRole("button", { name: "Remove scene 3" }).click();
  await expect(
    page.getByRole("button", { name: "Scene 03", exact: true }),
  ).toBeFocused();
  await expect(page.locator(".story-builder").getByRole("status")).toContainText(
    "Scene 3 removed. Focus moved to scene 3.",
  );
  await page.getByRole("button", { name: "Add scene", exact: true }).click();
  await page
    .getByRole("button", { name: "Move scene 1 down", exact: true })
    .click();
  await expect(page.getByLabel("Scene 2 caption", { exact: true })).toHaveValue(
    "First feature to show.",
  );
  await page
    .getByRole("combobox", { name: "Story duration", exact: true })
    .selectOption("60");
  await expect(
    page.getByRole("slider", { name: "Video position", exact: true }),
  ).toHaveAttribute("max", "1799");
  const second = page.getByRole("group", {
    name: "Story scene 2",
    exact: true,
  });
  await second.getByText("Framing", { exact: true }).click();
  await second
    .getByRole("slider", { name: "Scene 2 zoom", exact: true })
    .fill("1.4");
  await page
    .getByLabel("Replace scene 2 media", { exact: true })
    .setInputFiles("public/sample/after.png");
  await expect(
    page.getByRole("img", { name: "Scene 2 screenshot", exact: true }),
  ).toHaveAttribute("src", /^blob:/);
  await expect(
    second.getByRole("slider", { name: "Scene 2 zoom", exact: true }),
  ).toHaveValue("1.4");
  await expect(page.getByLabel("Scene 2 caption", { exact: true })).toHaveValue(
    "First feature to show.",
  );
  await page.getByLabel("Scene 2 caption", { exact: true }).fill("");
  await expect(
    page.getByText("Draft saved in this browser", { exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await page
    .getByRole("button", { name: "Restore draft", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Story duration", exact: true }),
  ).toHaveValue("60");
  await expect(page.getByLabel("Scene 2 caption", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    page.getByRole("img", { name: "Scene 2 screenshot", exact: true }),
  ).toHaveAttribute("src", /^blob:/);
  expect(errors).toEqual([]);
});

test("launch recipes preserve selected image blobs and can be applied, undone and recovered", async ({
  page,
}) => {
  await page.goto("/editor/new");
  await page
    .getByRole("button", { name: "Product story", exact: true })
    .click();
  await page
    .getByLabel("Scene 1 caption", { exact: true })
    .fill("Acme launch feature.");
  await page
    .getByLabel("Replace scene 1 media", { exact: true })
    .setInputFiles("public/sample/after.png");
  await expect(
    page.getByRole("img", { name: "Scene 1 screenshot", exact: true }),
  ).toHaveAttribute("src", /^blob:/);
  await page
    .getByLabel("Recipe name", { exact: true })
    .fill("Acme reusable launch");
  await page
    .getByRole("button", { name: "Save launch recipe", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Apply recipe Acme reusable launch",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("Scene 1 caption", { exact: true })
    .fill("A later edit.");
  await page
    .getByRole("button", {
      name: "Apply recipe Acme reusable launch",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Scene 1 caption", { exact: true })).toHaveValue(
    "Acme launch feature.",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Scene 1 caption", { exact: true })).toHaveValue(
    "A later edit.",
  );
  await expect(
    page.getByText("Draft saved in this browser", { exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await page
    .getByRole("button", { name: "Discard draft", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Apply recipe Acme reusable launch",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Scene 1 caption", { exact: true })).toHaveValue(
    "Acme launch feature.",
  );
  await expect(
    page.getByRole("img", { name: "Scene 1 screenshot", exact: true }),
  ).toHaveAttribute("src", /^blob:/);
});

test("website import is staged, editable, applied atomically and undoable", async ({
  page,
}) => {
  const image = `data:image/png;base64,${(await readFile("public/sample/launch-after.png")).toString("base64")}`;
  await page.route("**/api/website-import", (route) =>
    route.fulfill({
      json: {
        url: "https://acme.example/",
        name: "Acme",
        opening: "Make your next move.",
        color: "#3567DA",
        font: "dm-sans",
        cta: "Start building.",
        logo: null,
        captures: [
          { name: "Desktop introduction", caption: "A clear start.", image },
          { name: "Feature detail", caption: "One useful feature.", image },
          { name: "Mobile experience", caption: "Ready on mobile.", image },
        ],
      },
    }),
  );
  await page.goto("/editor/new");
  await page
    .getByRole("button", { name: "Start from a website", exact: false })
    .click();
  await page
    .getByLabel("Website URL", { exact: true })
    .fill("https://acme.example/");
  await page
    .getByRole("button", { name: "Capture website", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Use this draft", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Project name", { exact: true })).toHaveValue(
    "Orbit",
  );
  await page
    .getByRole("textbox", { name: "Suggested opening", exact: true })
    .fill("Your own launch story.");
  await page
    .getByRole("button", { name: "Use this draft", exact: true })
    .click();
  await expect(page.getByLabel("Project name", { exact: true })).toHaveValue(
    "Acme",
  );
  await expect(page.getByLabel("Opening caption", { exact: true })).toHaveValue(
    "Your own launch story.",
  );
  await expect(page.getByLabel("Scene 2 caption", { exact: true })).toHaveValue(
    "One useful feature.",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Project name", { exact: true })).toHaveValue(
    "Orbit",
  );
  await expect(
    page.getByRole("button", { name: "Reveal film", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("square product stories and launch controls fit mobile without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/editor/new");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("radio", { name: "Square 1:1", exact: true }).check();
  await page
    .getByRole("button", { name: "Product story", exact: true })
    .click();
  await page
    .getByLabel("Scene 1 caption", { exact: true })
    .fill("A feature worth sharing.");
  await page.getByLabel("Client folder", { exact: false }).fill("Acme Studio");
  await page
    .getByLabel("Package hook 2", { exact: false })
    .fill("Meet the new Acme.");
  await expect(
    page.getByRole("button", { name: "Export launch package", exact: true }),
  ).toBeDisabled();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  const shell = page.locator(".square .video-shell");
  await expect(shell).toBeVisible();
  const box = await shell.boundingBox();
  expect(Math.abs(box!.width - box!.height)).toBeLessThan(2);
  await page.screenshot({
    path: "out/qa/launch-workspace/mobile-story.png",
    fullPage: true,
  });
});

test("short MP4 story clips preview and survive browser draft recovery", async ({
  page,
}) => {
  await page.goto("/editor/new");
  await page
    .getByRole("button", { name: "Product story", exact: true })
    .click();
  await page
    .getByLabel("Replace scene 2 media", { exact: true })
    .setInputFiles("public/films/demopop-launch.mp4");
  await expect(
    page.getByLabel("Scene 2 clip", { exact: true }),
  ).toHaveAttribute("src", /^blob:/);
  await page
    .getByRole("button", { name: "Jump to Scene 02", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByText("Draft saved in this browser", { exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await page
    .getByRole("button", { name: "Restore draft", exact: true })
    .click();
  await expect(
    page.getByLabel("Scene 2 clip", { exact: true }),
  ).toHaveAttribute("src", /^blob:/);
});

test("public review collects timestamped feedback and approval for the displayed version", async ({
  page,
}) => {
  const token = "a".repeat(64),
    comments: {
      id: string;
      author: string;
      body: string;
      seconds: number;
      created_at: string;
    }[] = [];
  let approved = false;
  const submitted: unknown[] = [];
  await page.route(`**/api/reviews/${token}`, async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      submitted.push(body);
      if (body.approve) approved = true;
      else {
        approved = false;
        comments.push({
          id: "comment-1",
          author: body.author,
          body: body.body,
          seconds: body.seconds,
          created_at: "2026-10-18T15:00:00Z",
        });
      }
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await route.fulfill({
      json: {
        agencyName: "Acme Studio",
        name: "Acme launch",
        color: "#365DDB",
        status: approved
          ? "approved"
          : comments.length
            ? "changes_requested"
            : "pending",
        approvedBy: approved ? "Client Taylor" : null,
        approvedAt: approved ? "2026-10-18T15:05:00Z" : null,
        expiresAt: "2026-11-01T15:00:00Z",
        duration: 15,
        playbackUrl: "/films/demopop-launch.mp4",
        downloadUrl: "/films/demopop-launch.mp4",
        outputKind: "video",
        comments,
      },
    });
  });
  await page.goto(`/review/${token}`);
  await expect(
    page.getByRole("heading", { name: "Acme launch", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve this version", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Your name", { exact: true }).fill("Client Taylor");
  await page
    .getByLabel("Comment", { exact: true })
    .fill("Please hold this feature longer.");
  await page.getByLabel("At second", { exact: true }).fill("6.2");
  await page
    .getByRole("button", { name: "Add timestamped comment", exact: true })
    .click();
  await expect(
    page.getByText("Please hold this feature longer.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Approve this version", exact: true })
    .click();
  await expect(page.locator(".review-approved")).toContainText("Client Taylor");
  expect(submitted).toMatchObject([
    {
      author: "Client Taylor",
      body: "Please hold this feature longer.",
      seconds: 6.2,
      approve: false,
    },
    { author: "Client Taylor", approve: true },
  ]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "out/qa/launch-workspace/client-review-mobile.png",
    fullPage: true,
  });
});
