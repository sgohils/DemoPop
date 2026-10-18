import { test, expect } from "@playwright/test";

test("all motion templates and formats preview with either bundled font", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (failure) => errors.push(failure.message));
  await page.goto("/editor/new?template=reveal");
  await page
    .getByRole("combobox", { name: "Video font", exact: true })
    .selectOption("dm-sans");
  for (const format of ["Vertical 9:16", "Landscape 16:9"]) {
    await page.getByRole("radio", { name: format, exact: true }).check();
    for (const template of [
      "Classic Reveal",
      "Slide & Settle",
      "Split Compare",
    ]) {
      await page.getByRole("radio", { name: template, exact: true }).check();
      await expect(
        page.getByRole("button", { name: "Play", exact: true }),
      ).toBeEnabled();
      await page.getByRole("slider", { name: "Video position" }).fill("180");
      const box = await page.locator(".video-shell").boundingBox();
      expect(
        format === "Landscape 16:9"
          ? box!.width > box!.height
          : box!.height > box!.width,
      ).toBe(true);
      await page.getByRole("slider", { name: "Video position" }).fill("335");
      await expect(
        page.getByText("A clearer path to getting in touch.", { exact: true }),
      ).toBeVisible();
    }
  }
  await page.screenshot({
    path: "out/qa/studio-landscape-editor.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("browser draft recovery retains incomplete text, image blobs and creative settings after reload", async ({
  page,
}) => {
  await page.goto("/editor/new?template=reveal");
  await page.getByLabel("Project name").fill("A recoverable local draft");
  await page.getByLabel("Opening caption").fill("");
  await page.getByRole("radio", { name: "Split Compare", exact: true }).check();
  await page
    .getByRole("radio", { name: "Landscape 16:9", exact: true })
    .check();
  await page
    .getByRole("combobox", { name: "Video font", exact: true })
    .selectOption("dm-sans");
  await page
    .getByLabel("Upload before screenshot")
    .setInputFiles("public/sample/after.png");
  await expect(
    page.getByText("Draft saved in this browser", { exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Restore draft", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Restore draft", exact: true })
    .click();
  await expect(page.getByLabel("Project name")).toHaveValue(
    "A recoverable local draft",
  );
  await expect(page.getByLabel("Opening caption")).toHaveValue("");
  await expect(
    page.getByRole("radio", { name: "Split Compare", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("radio", { name: "Landscape 16:9", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("combobox", { name: "Video font", exact: true }),
  ).toHaveValue("dm-sans");
  await expect(
    page.getByRole("img", { name: "before website screenshot", exact: true }),
  ).toHaveAttribute("src", /^blob:/);
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
});
