import { test, expect } from "@playwright/test";

test("homepage style selection opens the matching editor and mobile home fits", async ({
  page,
}) => {
  await page.goto("/editor/new");
  const dialogs: string[] = [];
  const rejectUnexpectedDialog = async (
    dialog: import("@playwright/test").Dialog,
  ) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  };
  page.on("dialog", rejectUnexpectedDialog);
  await page.getByRole("link", { name: "DemoPop home", exact: true }).click();
  await expect(page).toHaveURL("/");
  expect(dialogs).toEqual([]);
  page.off("dialog", rejectUnexpectedDialog);
  await page.locator("#styles").scrollIntoViewIfNeeded();
  await page
    .getByRole("button", { name: "Split Compare sample", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Portrait sample", exact: true })
    .click();
  await page.getByRole("link", { name: "Use this style" }).click();
  await expect(
    page.getByRole("radio", { name: "Split Compare", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("radio", { name: "Vertical 9:16", exact: true }),
  ).toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  // A fresh navigation avoids discarding the selected editor's browser draft.
  page.once("dialog", (dialog) => dialog.accept());
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "out/qa/home-mobile-quality.png",
    fullPage: true,
  });
});

test("scene navigation, caption focus, image swaps and edit history form a usable editing loop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/editor/new?template=reveal");
  const opening = page.getByLabel("Opening caption");
  await opening.fill("A much stronger first impression.");
  await expect(
    page.getByRole("slider", { name: "Video position" }),
  ).toHaveValue("35");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(opening).toHaveValue(
    "A fresh perspective.\nA better first impression.",
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(opening).toHaveValue("A much stronger first impression.");
  await page.getByRole("button", { name: "Undo", exact: true }).focus();
  await page.keyboard.press("Control+z");
  await expect(opening).toHaveValue(
    "A fresh perspective.\nA better first impression.",
  );
  await page.keyboard.press("Control+Shift+z");
  await expect(opening).toHaveValue("A much stronger first impression.");
  const before = page.getByRole("img", {
    name: "before website screenshot",
    exact: true,
  });
  const original = await before.getAttribute("src");
  await page
    .getByRole("button", { name: "Swap screenshots", exact: true })
    .click();
  await expect(before).toHaveAttribute("src", "/sample/after.png");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(before).toHaveAttribute("src", original!);
  await page
    .getByLabel("Upload before screenshot")
    .setInputFiles("public/sample/after.png");
  await expect(before).toHaveAttribute("src", /^blob:/);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(before).toHaveAttribute("src", original!);
  await page
    .getByRole("button", { name: "Jump to Closing", exact: true })
    .click();
  await expect(
    page.getByRole("slider", { name: "Video position" }),
  ).toHaveValue("410");
  await page
    .getByRole("button", { name: "Jump to Highlight 02", exact: true })
    .click();
  await expect(
    page.getByRole("slider", { name: "Video position" }),
  ).toHaveValue("335");
  await page
    .getByLabel("Video preview. Press Space to play or pause.", { exact: true })
    .focus();
  await page.keyboard.press("Space");
  await expect
    .poll(async () =>
      Number(
        await page.getByRole("slider", { name: "Video position" }).inputValue(),
      ),
    )
    .toBeGreaterThan(335);
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  await page.locator(".settings-panel").evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({
    path: "out/qa/editor-quality-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Redo", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
});
