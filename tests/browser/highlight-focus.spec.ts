import { test, expect } from "@playwright/test";

test("each launch highlight keeps its own framing through history, drafts and image changes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/editor/new");
  const first = page.getByRole("group", {
    name: "Highlight 01 framing",
    exact: true,
  });
  const second = page.getByRole("group", {
    name: "Highlight 02 framing",
    exact: true,
  });
  const position = page.getByRole("slider", {
    name: "Video position",
    exact: true,
  });

  await expect(
    first.getByRole("button", { name: "Auto", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  // A custom detail starts from the after screenshot's existing crop.
  const after = page.locator(".asset-card").nth(1);
  await after.getByRole("button", { name: "Position & zoom" }).click();
  await after.getByRole("slider").nth(0).fill("0.7");
  await after.getByRole("slider").nth(1).fill("0.2");
  await after.getByRole("slider").nth(2).fill("1.1");
  await first.getByRole("button", { name: "Custom", exact: true }).click();
  await expect(
    first.getByRole("slider", {
      name: "Highlight 01 horizontal position",
      exact: true,
    }),
  ).toHaveValue("0.7");
  await expect(
    first.getByRole("slider", {
      name: "Highlight 01 vertical position",
      exact: true,
    }),
  ).toHaveValue("0.2");
  await expect(
    first.getByRole("slider", { name: "Highlight 01 zoom", exact: true }),
  ).toHaveValue("1.1");
  await expect(position).toHaveValue("217");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    first.getByRole("button", { name: "Auto", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(
    first.getByRole("button", { name: "Custom", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  await second.getByRole("button", { name: "Custom", exact: true }).click();
  await second
    .getByRole("slider", { name: "Highlight 02 zoom", exact: true })
    .fill("1.6");
  await expect(position).toHaveValue("302");
  await expect(
    first.getByRole("slider", { name: "Highlight 01 zoom", exact: true }),
  ).toHaveValue("1.1");
  await expect(
    page.getByText("Draft saved in this browser", { exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await page
    .getByRole("button", { name: "Restore draft", exact: true })
    .click();
  await expect(
    first.getByRole("slider", { name: "Highlight 01 zoom", exact: true }),
  ).toHaveValue("1.1");
  await expect(
    second.getByRole("slider", { name: "Highlight 02 zoom", exact: true }),
  ).toHaveValue("1.6");

  await first
    .getByRole("button", { name: "Reset to automatic", exact: true })
    .click();
  await expect(first.getByRole("slider")).toHaveCount(0);
  await expect(second.getByRole("slider")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Swap screenshots", exact: true })
    .click();
  await expect(
    second.getByRole("button", { name: "Auto", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    second.getByRole("slider", { name: "Highlight 02 zoom", exact: true }),
  ).toHaveValue("1.6");
  await page
    .getByLabel("Upload after screenshot", { exact: true })
    .setInputFiles("public/sample/after.png");
  await expect(
    second.getByRole("button", { name: "Auto", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});

test("keyboard framing changes keep the launch preview on the focused highlight", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/editor/new");
  const first = page.getByRole("group", {
    name: "Highlight 01 framing",
    exact: true,
  });
  await first.getByRole("button", { name: "Custom", exact: true }).click();

  const horizontal = first.getByRole("slider", {
    name: "Highlight 01 horizontal position",
    exact: true,
  });
  await horizontal.focus();
  await expect(horizontal).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(horizontal).toHaveValue("0.51");
  await expect(horizontal).toHaveAttribute("aria-valuetext", "51 percent");
  await expect(
    first.getByRole("img", {
      name: "First highlight selected screenshot area",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("slider", { name: "Video position", exact: true }),
  ).toHaveValue("217");
  await expect(horizontal).toBeFocused();

  const vertical = first.getByRole("slider", {
    name: "Highlight 01 vertical position",
    exact: true,
  });
  await vertical.focus();
  await page.keyboard.press("ArrowRight");
  await expect(vertical).toHaveValue("0.51");
  await expect(vertical).toBeFocused();

  const zoom = first.getByRole("slider", {
    name: "Highlight 01 zoom",
    exact: true,
  });
  await zoom.focus();
  await page.keyboard.press("ArrowRight");
  await expect(zoom).toHaveValue("1.01");
  await expect(zoom).toBeFocused();
  await expect(
    first.getByRole("img", {
      name: "First highlight selected screenshot area",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("slider", { name: "Video position", exact: true }),
  ).toHaveValue("217");
});

test("custom launch framing remains usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/editor/new");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const first = page.getByRole("group", {
    name: "Highlight 01 framing",
    exact: true,
  });
  await first.getByRole("button", { name: "Custom", exact: true }).click();
  const zoom = first.getByRole("slider", {
    name: "Highlight 01 zoom",
    exact: true,
  });
  await zoom.fill("1.5");
  await zoom.focus();
  await page.keyboard.press("ArrowRight");
  await expect(zoom).toHaveValue("1.51");
  await expect(
    first.getByRole("img", {
      name: "First highlight selected screenshot area",
      exact: true,
    }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await first.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "out/qa/highlight-focus-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    page.getByRole("slider", { name: "Video position", exact: true }),
  ).toHaveValue("217");
});
