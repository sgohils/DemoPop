import { test, expect } from "@playwright/test";

test("landing scroll advances a real DemoPop film without playing sound", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /You built it\./ }),
  ).toBeVisible();
  const hero = page.locator("[data-home-scroll]");
  const film = page.getByLabel("DemoPop launch film", { exact: true });
  await expect(hero).toHaveAttribute("data-scroll-progress", /\d/);
  await expect
    .poll(() =>
      film.evaluate((element: HTMLVideoElement) =>
        Number.isFinite(element.duration) ? element.duration : 0,
      ),
    )
    .toBeGreaterThan(10);
  expect(
    await film.evaluate((element: HTMLVideoElement) => element.currentSrc),
  ).toMatch(/demopop.*\.mp4/);
  expect(
    await film.evaluate((element: HTMLVideoElement) => element.muted),
  ).toBe(true);

  const initial = Number(await hero.getAttribute("data-scroll-progress"));
  const travel = await hero.evaluate((element) => ({
    start: element.getBoundingClientRect().top + window.scrollY,
    distance: element.clientHeight - window.innerHeight,
  }));
  expect(travel.distance).toBeGreaterThan(500);
  await page.evaluate(
    ({ start, distance }) => window.scrollTo(0, start + distance * 0.65),
    travel,
  );
  await expect
    .poll(async () => Number(await hero.getAttribute("data-scroll-progress")))
    .toBeGreaterThan(initial + 0.3);
  await expect
    .poll(() =>
      film.evaluate((element: HTMLVideoElement) => element.currentTime),
    )
    .toBeGreaterThan(2);
  expect(errors).toEqual([]);
  await page.screenshot({ path: "out/qa/home-scroll-desktop.png" });
});

test("watching the film supports keyboard dismissal and returns focus", async ({
  page,
}) => {
  await page.goto("/");
  const hero = page.locator("[data-home-scroll]");
  const scrollPoint = await hero.evaluate(
    (element) => (element.clientHeight - innerHeight) * 0.35,
  );
  await page.evaluate((top) => window.scrollTo(0, top), scrollPoint);
  const watch = page.getByRole("button", {
    name: "Watch the film",
    exact: true,
  });
  await watch.click();
  const dialog = page.getByRole("dialog", {
    name: "Made with DemoPop.",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  const film = dialog.locator("video");
  await expect
    .poll(() => film.evaluate((element: HTMLVideoElement) => element.paused))
    .toBe(false);
  expect(
    await film.evaluate((element: HTMLVideoElement) => element.muted),
  ).toBe(false);
  await page.keyboard.press("Tab");
  expect(
    await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(true);
  await page.keyboard.press("Shift+Tab");
  expect(
    await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(watch).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeCloseTo(scrollPoint, 0);
});

test("reduced motion keeps the film and page content useful without a long pin", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const hero = page.locator("[data-home-scroll]");
  await expect(hero).toHaveAttribute("data-reduced-motion", "true");
  await expect(
    page.getByRole("heading", { name: /You built it\./ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Watch the film", exact: true }),
  ).toBeVisible();
  expect(await hero.evaluate((element) => element.clientHeight)).toBeLessThan(
    2000,
  );
  expect(
    await hero
      .locator("[data-scroll-progress]")
      .evaluate((element) => getComputedStyle(element).position),
  ).not.toBe("sticky");
  await page.locator("#product").scrollIntoViewIfNeeded();
  await expect(page.locator("#product")).toBeInViewport();
});

test("mobile landing stays within the viewport throughout the scroll story", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /You built it\./ }),
  ).toBeVisible();
  for (const progress of [0, 0.25, 0.7, 1]) {
    await page.evaluate((amount) => {
      const limit = document.documentElement.scrollHeight - innerHeight;
      window.scrollTo(0, amount * limit);
    }, progress);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
  }
  await page.screenshot({
    path: "out/qa/home-mobile-landing.png",
    fullPage: true,
  });
});

test("workflow tabs support the keyboard and show the actual finished film", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#product").scrollIntoViewIfNeeded();
  const start = page.getByRole("tab", { name: /Drop it in/ });
  await start.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: /Make it yours/ }),
  ).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: /Send it out/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const poster = page.getByRole("img", {
    name: "A frame from the real DemoPop launch film",
  });
  await expect(poster).toBeVisible();
  await expect
    .poll(() =>
      poster.evaluate(
        (element: HTMLImageElement) =>
          element.complete && element.naturalWidth > 0,
      ),
    )
    .toBe(true);
  await page.keyboard.press("Home");
  await expect(start).toHaveAttribute("aria-selected", "true");
});

test("live gallery stops playing when it leaves the viewport", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#styles").scrollIntoViewIfNeeded();
  const play = page.getByRole("button", { name: "Play", exact: true });
  await expect(play).toBeEnabled();
  await play.click();
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await page.locator("footer").scrollIntoViewIfNeeded();
  await expect(play).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toHaveCount(0);
});
