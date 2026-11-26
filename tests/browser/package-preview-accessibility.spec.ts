import { test, expect } from "@playwright/test";

test("launch package hook choices expose their full copy to assistive technology", async ({
  page,
}) => {
  await page.goto("/editor/new");
  await page.getByRole("button", { name: "Preview launch package", exact: false }).click();
  const preview = page.getByRole("region", { name: "Launch package preview", exact: true });
  const hook = preview.getByRole("button", { name: "Preview package hook 2", exact: true });
  const copy = (await hook.locator("span").textContent())?.trim();

  expect(copy).toBeTruthy();
  await expect(hook).toHaveAccessibleName("Preview package hook 2");
  await expect(hook).toHaveAccessibleDescription(copy!);
  await hook.click();
  await expect(hook).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".editor-stage .video-shell")).toContainText(copy!);
});
