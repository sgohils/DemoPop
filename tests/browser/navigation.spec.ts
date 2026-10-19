import { test, expect, type Page } from "@playwright/test";

async function openEditor(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: "Try the studio", exact: true }).click();
  await expect(page.getByLabel("Project name")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
}

async function decideNavigation(
  page: Page,
  action: () => Promise<unknown>,
  accept: boolean,
) {
  const confirmation = page.waitForEvent("dialog");
  const navigation = action();
  const dialog = await confirmation;
  expect(dialog.type()).toBe("confirm");
  expect(dialog.message()).toContain("unsaved edits");
  if (accept) await dialog.accept();
  else await dialog.dismiss();
  await navigation;
}

test("canceling browser Back keeps edits and continuing Back discards them", async ({
  page,
}) => {
  await openEditor(page);
  await page.getByLabel("Project name").fill("Keep these unsaved edits");
  await page.getByLabel("Opening caption").fill("A caption worth keeping.");

  // Repeated cancellation must not add a duplicate editor entry or lose the guard.
  for (let attempt = 0; attempt < 2; attempt++) {
    await decideNavigation(page, () => page.goBack(), false);
    await expect(page).toHaveURL(/\/editor\/new$/);
    await expect(page.getByLabel("Project name")).toHaveValue(
      "Keep these unsaved edits",
    );
    await expect(page.getByLabel("Opening caption")).toHaveValue(
      "A caption worth keeping.",
    );
  }

  await decideNavigation(page, () => page.goBack(), true);
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: /You built it/ }),
  ).toBeVisible();
});

test("canceling an internal link keeps edits and accepting leaves the editor", async ({
  page,
}) => {
  await openEditor(page);
  await page
    .getByLabel("Project name")
    .fill("Keep edits on internal navigation");

  await decideNavigation(
    page,
    () => page.getByRole("link", { name: "Projects", exact: true }).click(),
    false,
  );
  await expect(page).toHaveURL(/\/editor\/new$/);
  await expect(page.getByLabel("Project name")).toHaveValue(
    "Keep edits on internal navigation",
  );

  await decideNavigation(
    page,
    () => page.getByRole("link", { name: "Projects", exact: true }).click(),
    true,
  );
  await expect(page).toHaveURL(/\/projects$/);
});

test("canceling browser Forward keeps the mounted editor and unsaved edits", async ({
  page,
}) => {
  await openEditor(page);
  await page.getByLabel("Project name").fill("First unsaved edit");
  await decideNavigation(
    page,
    () => page.getByRole("link", { name: "Projects", exact: true }).click(),
    true,
  );
  await expect(page).toHaveURL(/\/projects$/);
  await page.goBack();
  await expect(page.getByLabel("Project name")).toBeVisible();
  await page.getByLabel("Project name").fill("Keep edits on Forward");

  await decideNavigation(page, () => page.goForward(), false);
  await expect(page).toHaveURL(/\/editor\/new$/);
  await expect(page.getByLabel("Project name")).toHaveValue(
    "Keep edits on Forward",
  );

  await decideNavigation(page, () => page.goForward(), true);
  await expect(page).toHaveURL(/\/projects$/);
});
