import { test, expect } from "@playwright/test";

test("sample gallery wraps style arrow navigation and carries both choices into the editor", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#styles").scrollIntoViewIfNeeded();
  const styles = page.getByRole("group", { name: "Sample motion template" });
  const first = styles.getByRole("button", { name: "Launch Film sample", exact: true });
  const last = styles.getByRole("button", { name: "Split Compare sample", exact: true });

  await first.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(last).toBeFocused();
  await expect(last).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowRight");
  await expect(first).toBeFocused();
  await expect(first).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Portrait sample", exact: true }).click();
  await expect(page.getByRole("link", { name: "Use this style", exact: false }))
    .toHaveAttribute("href", "/editor/new?template=launch&format=vertical");
  await page.getByRole("link", { name: "Use this style", exact: false }).click();
  await expect(page.getByRole("radio", { name: "Launch Film", exact: true })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Vertical 9:16", exact: true })).toBeChecked();
});
