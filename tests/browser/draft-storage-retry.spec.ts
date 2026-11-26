import { test, expect } from "@playwright/test";

test("editor draft recovery retries when browser storage becomes available", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const nativeOpen = IDBFactory.prototype.open;
    let failOnce = true;
    IDBFactory.prototype.open = function (
      this: IDBFactory,
      name: string,
      version?: number,
    ) {
      if (name === "demopop-drafts" && failOnce) {
        failOnce = false;
        throw new DOMException("Temporary storage failure", "UnknownError");
      }
      return nativeOpen.call(this, name, version);
    };
  });

  await page.goto("/editor/new");
  const draftStatus = page.locator(".draft-status");
  const alert = draftStatus
    .getByRole("alert")
    .filter({ hasText: "Browser draft storage is unavailable" });
  await expect(alert).toBeVisible();
  await alert.getByRole("button", { name: "Retry draft storage", exact: true }).click();
  await expect(alert).toHaveCount(0);
  await expect(page.getByLabel("Project name", { exact: true })).toBeEditable();
  await expect(draftStatus.getByRole("status")).toContainText(
    "Drafts stay in this browser",
  );
});
