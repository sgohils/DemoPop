import { test, expect } from "@playwright/test";

const id = "d".repeat(64);
const endpoint = `/api/create-from-link/${id}`;

test("a stalled status poll reaches its deadline and retry reconnects to the same job", async ({
  page,
}) => {
  let submissions = 0;
  await page.clock.install();
  await page.addInitScript(
    ({ statusPath, jobId }) => {
      const nativeFetch = window.fetch.bind(window);
      let polls = 0;
      (window as Window & { __statusPolls?: number }).__statusPolls = 0;
      window.fetch = (input, init) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof Request
              ? input.url
              : "";
        if (new URL(url, window.location.href).pathname !== statusPath)
          return nativeFetch(input, init);
        polls++;
        (window as Window & { __statusPolls?: number }).__statusPolls = polls;
        if (polls === 1)
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () =>
                reject(
                  new DOMException("The request was aborted.", "AbortError"),
                ),
              { once: true },
            );
          });
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: jobId,
              mode: "local",
              status: "completed",
              progress: 1,
              videoUrl: "/films/demopop-launch.mp4",
              downloadUrl: `${statusPath}/download`,
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
        );
      };
    },
    { statusPath: endpoint, jobId: id },
  );
  await page.route("**/api/create-from-link", (route) => {
    submissions++;
    return route.fulfill({
      status: 202,
      json: { id, mode: "local", status: "queued" },
    });
  });

  await page.goto("/create");
  await page
    .getByLabel("Your website link", { exact: true })
    .fill("example.com");
  await page
    .getByRole("button", { name: "Generate video", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as Window & { __statusPolls?: number }).__statusPolls,
      ),
    )
    .toBe(1);

  await page.clock.fastForward(15_000);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Checking your video took too long",
  );
  await expect(
    page.getByRole("main").getByText("YOUR VIDEO IS READY", { exact: true }),
  ).toHaveCount(0);

  await page
    .getByRole("button", { name: "Check video status", exact: true })
    .click();
  await expect(
    page.getByText("YOUR VIDEO IS READY", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as Window & { __statusPolls?: number }).__statusPolls,
    ),
  ).toBe(2);
  expect(submissions).toBe(1);
});
