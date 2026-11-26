import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const image = `data:image/png;base64,${(await readFile("public/sample/launch-after.png")).toString("base64")}`;

test("canceling an in-flight website capture keeps the URL and ignores its late response", async ({
  page,
}) => {
  let releaseFirst!: () => void;
  const firstResponse = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let requests = 0;
  await page.route("**/api/website-import", async (route) => {
    const requestNumber = ++requests;
    if (requestNumber === 1) await firstResponse;
    await route.fulfill({
      json: {
        url: "https://acme.example/",
        name: requestNumber === 1 ? "Stale response" : "Acme",
        opening: "Make your next move.",
        color: "#3567DA",
        font: "dm-sans",
        cta: "Start building.",
        logo: null,
        captures: [
          { name: "Desktop", caption: "A clear start.", image },
          { name: "Feature", caption: "One useful feature.", image },
          { name: "Mobile", caption: "Ready on mobile.", image },
        ],
      },
    });
  });

  await page.goto("/editor/new");
  await page.getByRole("button", { name: /Start from a website/ }).click();
  const url = page.getByLabel("Website URL", { exact: true });
  const importPanel = page.locator(".website-import");
  await url.fill("https://acme.example/");
  await page.getByRole("button", { name: "Capture website", exact: true }).click();
  await expect(importPanel.getByRole("button", { name: "Cancel capture", exact: true })).toBeVisible();
  await expect.poll(() => requests).toBe(1);
  await importPanel.getByRole("button", { name: "Cancel capture", exact: true }).click();
  await expect(importPanel.getByRole("alert")).toContainText("Website capture canceled");
  await expect(url).toHaveValue("https://acme.example/");

  releaseFirst();
  await page.getByRole("button", { name: "Capture website", exact: true }).click();
  await expect(page.getByLabel("Imported project name", { exact: true })).toHaveValue("Acme");
  await expect(importPanel.getByRole("alert")).toHaveCount(0);
  expect(requests).toBe(2);
});
