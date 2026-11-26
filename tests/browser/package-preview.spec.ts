import { test, expect } from "@playwright/test";

test("all nine launch variants preview without changing the main film or creating edits", async ({
  page,
}) => {
  const errors: string[] = [];
  const exports: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/exports"))
      exports.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/editor/new?format=landscape");
  const opening = await page
    .getByLabel("Opening caption", { exact: true })
    .inputValue();
  const hooks = [
    opening,
    await page.getByLabel("Package hook 2", { exact: false }).inputValue(),
    await page.getByLabel("Package hook 3", { exact: false }).inputValue(),
  ];
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Preview launch package", exact: false })
    .click();
  const controls = page.getByRole("region", {
    name: "Launch package preview",
    exact: true,
  });
  const shell = page.locator(".editor-stage .video-shell");
  for (const [format, ratio] of [
    ["landscape", 16 / 9],
    ["vertical", 9 / 16],
    ["square", 1],
  ] as const) {
    await controls
      .getByRole("button", { name: `Preview ${format} package`, exact: true })
      .click();
    for (let hook = 0; hook < 3; hook++) {
      await controls
        .getByRole("button", {
          name: `Preview package hook ${hook + 1}`,
          exact: true,
        })
        .click();
      await expect(shell).toContainText(hooks[hook]);
      await expect(page.locator(".preview-footer")).toContainText(
        format.toUpperCase(),
      );
      const bounds = await shell.boundingBox();
      expect(Math.abs(bounds!.width / bounds!.height - ratio)).toBeLessThan(
        0.01,
      );
    }
  }
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Back to main film", exact: true })
    .click();
  await expect(
    page.getByRole("radio", { name: "Landscape 16:9", exact: true }),
  ).toBeChecked();
  await expect(page.getByLabel("Opening caption", { exact: true })).toHaveValue(
    opening,
  );
  await expect(page.locator(".preview-footer")).toContainText("LANDSCAPE");
  expect(exports).toEqual([]);
  expect(errors).toEqual([]);
});

test("story framing stays independent across formats and survives draft recovery", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/editor/new");
  await page
    .getByRole("button", { name: "Product story", exact: true })
    .click();
  const scene = page.getByRole("group", { name: "Story scene 1", exact: true });
  await scene.getByText("Framing", { exact: true }).click();
  const zoom = scene.getByRole("slider", { name: "Scene 1 zoom", exact: true });
  await zoom.fill("1.6");
  await page
    .getByRole("radio", { name: "Landscape 16:9", exact: true })
    .check();
  await expect(zoom).toHaveValue("1");
  await zoom.fill("1.2");
  await page.getByRole("radio", { name: "Square 1:1", exact: true }).check();
  await expect(zoom).toHaveValue("1");
  await page.getByRole("radio", { name: "Vertical 9:16", exact: true }).check();
  await expect(zoom).toHaveValue("1.6");
  await expect(
    page.getByText("Draft saved in this browser", { exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await page
    .getByRole("button", { name: "Restore draft", exact: true })
    .click();
  await scene.getByText("Framing", { exact: true }).click();
  await expect(zoom).toHaveValue("1.6");
  await page
    .getByRole("radio", { name: "Landscape 16:9", exact: true })
    .check();
  await expect(zoom).toHaveValue("1.2");
  await page
    .getByRole("button", { name: "Preview 9 versions", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Preview vertical package", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit vertical framing", exact: true })
    .click();
  await expect(
    scene.getByRole("slider", { name: "Scene 1 x", exact: true }),
  ).toBeFocused();
  await expect(zoom).toHaveValue("1.6");
  await scene
    .getByRole("button", {
      name: "Reset scene 1 vertical framing",
      exact: true,
    })
    .click();
  await expect(zoom).toHaveValue("1");
  await page
    .getByRole("radio", { name: "Landscape 16:9", exact: true })
    .check();
  await expect(zoom).toHaveValue("1.2");
  await scene
    .getByRole("button", {
      name: "Apply scene 1 framing to every format",
      exact: true,
    })
    .click();
  await page.getByRole("radio", { name: "Square 1:1", exact: true }).check();
  await expect(zoom).toHaveValue("1.2");
});

test("package preview and its framing handoff fit narrow phones", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/editor/new");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Product story", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Preview 9 versions", exact: true })
    .click();
  const controls = page.getByRole("region", {
    name: "Launch package preview",
    exact: true,
  });
  await expect(controls).toBeVisible();
  for (const format of ["landscape", "vertical", "square"]) {
    await controls
      .getByRole("button", { name: `Preview ${format} package`, exact: true })
      .click();
    await controls
      .getByRole("button", { name: "Preview package hook 3", exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
  }
  await page.screenshot({
    path: "out/qa/package-preview/mobile-nine-versions.png",
    fullPage: true,
  });
  await controls
    .getByRole("button", { name: "Edit square framing", exact: true })
    .click();
  await expect(
    page.getByRole("slider", { name: "Scene 1 zoom", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "Square 1:1", exact: true }),
  ).toBeChecked();
});
