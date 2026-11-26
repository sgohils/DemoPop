import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const validCapture = {
  name: "Desktop introduction",
  caption: "A clear start.",
  image: `data:image/png;base64,${(await readFile("public/sample/launch-after.png")).toString("base64")}`,
};

test("a partial website capture explains the problem and can recover on retry", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/website-import", (route) => {
    requests++;
    const shared = {
      url: "https://acme.example/",
      name: "Acme",
      opening: "Make your next move.",
      color: "#3567DA",
      font: "dm-sans",
      cta: "Start building.",
      logo: null,
    };
    return route.fulfill({
      json:
        requests === 1
          ? {
              ...shared,
              captures: [validCapture, { ...validCapture, image: "" }],
            }
          : {
              ...shared,
              captures: [
                validCapture,
                {
                  ...validCapture,
                  name: "Feature detail",
                  caption: "One useful feature.",
                },
                {
                  ...validCapture,
                  name: "Mobile experience",
                  caption: "Ready on mobile.",
                },
              ],
            },
    });
  });

  await page.goto("/editor/new");
  await page
    .getByRole("button", { name: "Start from a website", exact: false })
    .click();
  await page
    .getByLabel("Website URL", { exact: true })
    .fill("https://acme.example/");
  await page
    .getByRole("button", { name: "Capture website", exact: true })
    .click();

  await expect(page.locator(".website-import").getByRole("alert")).toContainText(
    "incomplete screenshots. Please retry the capture.",
  );
  await expect(
    page.getByRole("button", { name: "Use this draft", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Website URL", { exact: true })).toHaveValue(
    "https://acme.example/",
  );

  await page
    .getByRole("button", { name: "Capture website", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Use this draft", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Use this draft", exact: true })
    .click();

  await expect(page.getByLabel("Project name", { exact: true })).toHaveValue(
    "Acme",
  );
  await expect(page.getByLabel("Opening caption", { exact: true })).toHaveValue(
    "Make your next move.",
  );
  await expect(page.getByLabel("Scene 2 caption", { exact: true })).toHaveValue(
    "One useful feature.",
  );
  expect(requests).toBe(2);
});
