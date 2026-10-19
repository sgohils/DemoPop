import { test, expect } from "@playwright/test";

const id = "44444444-4444-4444-8444-444444444444";
const projectId = "33333333-3333-4333-8333-333333333333";

test("sign in returns to the website and options the user already entered", async ({
  page,
}) => {
  const logins: unknown[] = [];
  const submissions: unknown[] = [];
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/login") {
      logins.push(route.request().postDataJSON());
      return route.fulfill({ json: { signedIn: true } });
    }
    if (path === "/api/create-from-link") {
      submissions.push(route.request().postDataJSON());
      return route.fulfill(
        submissions.length === 1
          ? { status: 401, json: { error: "Sign in to generate your video." } }
          : {
              status: 202,
              json: { id, projectId, mode: "cloud", status: "queued" },
            },
      );
    }
    if (path === `/api/create-from-link/${id}`)
      return route.fulfill({
        json: {
          id,
          projectId,
          mode: "cloud",
          status: "completed",
          progress: 1,
          videoUrl: "/films/demopop-launch.mp4",
          downloadUrl: `/api/exports/${id}/download`,
        },
      });
    return route.fulfill({
      status: 404,
      json: { error: "Unexpected API request" },
    });
  });
  await page.goto("/create");
  await page
    .getByLabel("Your website link", { exact: true })
    .fill("https://example.com/new-product");
  await page.getByText("Video options", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Video format", exact: true })
    .selectOption("vertical");
  await page
    .getByRole("combobox", { name: "Video length", exact: true })
    .selectOption("60");
  await page
    .getByRole("button", { name: "Generate video", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Sign in",
  );
  await page
    .getByRole("link", { name: "Sign in to generate", exact: true })
    .click();
  await expect(page).toHaveURL(/\/auth\?next=%2Fcreate$/);
  await page
    .getByLabel("Email address", { exact: true })
    .fill("creator@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/create$/);
  await expect(
    page.getByLabel("Your website link", { exact: true }),
  ).toHaveValue("https://example.com/new-product");
  await page.getByText("Video options", { exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Video format", exact: true }),
  ).toHaveValue("vertical");
  await expect(
    page.getByRole("combobox", { name: "Video length", exact: true }),
  ).toHaveValue("60");
  await page
    .getByRole("button", { name: "Generate video", exact: true })
    .click();
  await expect(
    page.getByText("YOUR VIDEO IS READY", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Edit your video", exact: true }),
  ).toHaveAttribute("href", `/editor/${projectId}`);
  expect(logins).toEqual([
    {
      email: "creator@example.com",
      password: "test-password",
      next: "/create",
    },
  ]);
  expect(submissions).toEqual(
    Array(2).fill({
      url: "https://example.com/new-product",
      format: "vertical",
      duration: 60,
    }),
  );
});

test("a saved website draft remains accessible if the render queue cannot accept it", async ({
  page,
}) => {
  await page.route("**/api/create-from-link", (route) =>
    route.fulfill({
      status: 429,
      json: {
        error:
          "Your project was saved, but today’s export allowance has been used.",
        projectId,
      },
    }),
  );
  await page.goto("/create");
  await page
    .getByLabel("Your website link", { exact: true })
    .fill("example.com");
  await page
    .getByRole("button", { name: "Generate video", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Your project was saved",
  );
  await expect(
    page.getByRole("link", { name: "Open saved project" }),
  ).toHaveAttribute("href", `/editor/${projectId}`);
  await expect(
    page.getByLabel("Your website link", { exact: true }),
  ).toHaveValue("example.com");
});
