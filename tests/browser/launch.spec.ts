import { test, expect } from "@playwright/test";

test("launch film is the generator default, with synced scenes, original audio and recoverable CTA", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/editor/new");
  await expect(
    page.getByRole("radio", { name: "Launch Film", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("combobox", { name: "Soundtrack", exact: true }),
  ).toHaveValue("pulse");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Jump to Opening" }).click();
  await expect(
    page.getByRole("slider", { name: "Video position" }),
  ).toHaveValue("24");
  await page.getByRole("button", { name: "Mute preview", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Unmute preview", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Product", exact: true }).click();
  await expect(page.getByLabel("Opening caption")).toHaveValue("Meet Orbit.");
  await expect(
    page.getByRole("slider", { name: "Video position" }),
  ).toHaveValue("24");
  await page.getByLabel("Second highlight").fill("A better way to build.");
  await expect(
    page.getByRole("slider", { name: "Video position" }),
  ).toHaveValue("302");
  await page.getByLabel("Closing call to action").fill("Get early access.");
  await expect(
    page.getByRole("slider", { name: "Video position" }),
  ).toHaveValue("405");
  await expect(
    page.getByText("Get early access.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Soundtrack", exact: true })
    .selectOption("off");
  await expect(
    page.getByRole("button", { name: "Unmute preview", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Draft saved in this browser", { exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await page
    .getByRole("button", { name: "Restore draft", exact: true })
    .click();
  await expect(page.getByLabel("Closing call to action")).toHaveValue(
    "Get early access.",
  );
  await expect(
    page.getByRole("combobox", { name: "Soundtrack", exact: true }),
  ).toHaveValue("off");
  await page.getByRole("button", { name: "Jump to Reveal" }).click();
  await expect(
    page.getByRole("slider", { name: "Video position" }),
  ).toHaveValue("145");
  await page.screenshot({
    path: "out/qa/launch/editor-launch.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
