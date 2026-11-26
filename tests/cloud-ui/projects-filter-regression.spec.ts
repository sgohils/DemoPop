import { test, expect } from "@playwright/test";

const projects = [
  { id: "11111111-1111-4111-8111-111111111111", name: "North launch", updated_at: "2026-11-01T12:00:00Z", format: "vertical", template: "split", client: "Northstar" },
  { id: "22222222-2222-4222-8222-222222222222", name: "North site", updated_at: "2026-11-02T12:00:00Z", format: "landscape", template: "split", client: "Northstar" },
  { id: "33333333-3333-4333-8333-333333333333", name: "South launch", updated_at: "2026-11-03T12:00:00Z", format: "vertical", template: "reveal", client: "Southwind" },
];

test("project search matches style and format together and clears an empty client filter", async ({
  page,
}) => {
  const unexpected: string[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/metrics") return void (await route.fulfill({ status: 204 }));
    if (path === "/api/session")
      return void (await route.fulfill({ json: { signedIn: true, userId: "99999999-9999-4999-8999-999999999999" } }));
    if (path === "/api/brand-kits") return void (await route.fulfill({ json: { kits: [] } }));
    if (path === "/api/projects" && route.request().method() === "GET")
      return void (await route.fulfill({ json: { projects } }));
    unexpected.push(`${route.request().method()} ${path}`);
    await route.fulfill({ status: 501, json: { error: "Unexpected API" } });
  });

  await page.goto("/projects");
  const search = page.getByRole("searchbox", { name: "Search projects" });
  await search.fill("vertical split");
  await expect(page.getByRole("heading", { name: "North launch", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "North site", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "South launch", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: /^Southwind/ }).click();
  await expect(page.getByRole("heading", { name: "No projects match those filters." })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters", exact: false }).click();
  await expect(search).toHaveValue("");
  await expect(page.getByRole("heading", { name: "North launch", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "North site", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "South launch", exact: true })).toBeVisible();
  expect(unexpected).toEqual([]);
});
