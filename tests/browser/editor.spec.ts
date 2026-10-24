import { test, expect } from "@playwright/test";
test("sample preview and desktop editor really play, scrub and update", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Turn client websites/ }),
  ).toBeVisible();
  await page.locator("#styles").scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByText("Loading your preview…", { exact: true }),
  ).toBeHidden();
  await page.screenshot({ path: "out/qa/home-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(async () =>
      Number(
        await page.getByRole("slider", { name: "Video position" }).inputValue(),
      ),
    )
    .toBeGreaterThan(5);
  expect(
    Number(
      await page.getByRole("slider", { name: "Video position" }).inputValue(),
    ),
  ).toBeLessThan(200);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("link", { name: "Use this style", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "The details" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Export video" }),
  ).toBeDisabled();
  await page
    .getByLabel("Project name")
    .fill("A project with a clearer direction");
  await page
    .getByLabel("Opening caption")
    .fill("Your next chapter starts here.");
  await page.getByLabel("First highlight").fill("Beautifully considered.");
  await expect(
    page
      .locator(".editor-stage .video-shell")
      .getByText("Beautifully considered.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Choose brand color").fill("#884433");
  await expect(
    page.getByRole("textbox", { name: "Hex brand color", exact: true }),
  ).toHaveValue("#884433");
  await page.getByRole("button", { name: "Position & zoom" }).first().click();
  await page.getByLabel("Zoom").first().fill("1.3");
  await page.getByRole("button", { name: "Restart", exact: true }).click();
  await expect(
    page.getByRole("slider", { name: "Video position" }),
  ).toHaveValue("0");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(async () =>
      Number(
        await page.getByRole("slider", { name: "Video position" }).inputValue(),
      ),
    )
    .toBeGreaterThan(5);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("slider", { name: "Video position" }).fill("300");
  await expect(
    page.getByText("Less setup. More momentum.", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Upload after screenshot")
    .setInputFiles("public/sample/before.png");
  await expect(page.getByText(/Local preview only/)).toBeVisible();
  await page.getByLabel("Upload before screenshot").setInputFiles({
    name: "corrupt.png",
    mimeType: "image/png",
    buffer: Buffer.from("not a real image"),
  });
  await expect(page.locator(".editor-message[role='alert']")).toBeVisible();
  await page.screenshot({ path: "out/qa/editor-desktop.png", fullPage: true });
  expect(errors).toEqual([]);
});
test("mobile preview and settings remain usable without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/editor/new");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: "out/qa/editor-mobile-preview.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Project name")).toBeVisible();
  await page.getByLabel("Project name").fill("A".repeat(60));
  await page
    .getByLabel("Closing URL text")
    .fill("example.com/" + "a".repeat(68));
  await page.getByLabel("Upload before screenshot").setInputFiles({
    name: "corrupt.png",
    mimeType: "image/png",
    buffer: Buffer.from("not a real image"),
  });
  const error = page.locator(".editor-message[role='alert']");
  await expect(error).toBeVisible();
  await expect(error).not.toBeEmpty();
  await expect(
    page.getByRole("button", { name: "Settings", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({
    path: "out/qa/editor-mobile-error.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Dismiss error" }).click();
  await expect(error).toHaveCount(0);
  await page.screenshot({
    path: "out/qa/editor-mobile-settings.png",
    fullPage: true,
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
});
