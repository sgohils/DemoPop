import { test, expect } from "@playwright/test";

test("mobile scroll chapters never overlap the film, including wide and short screens", async ({
  page,
}) => {
  for (const viewport of [
    { width: 676, height: 768 },
    { width: 676, height: 568 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    for (const progress of [0, 0.4, 0.85]) {
      await page.locator("[data-home-scroll]").evaluate((hero, value) => {
        window.scrollTo(
          0,
          hero.getBoundingClientRect().top +
            scrollY +
            (hero.clientHeight - innerHeight) * value,
        );
      }, progress);
      await expect
        .poll(() =>
          page.locator("[data-home-scroll]").evaluate((hero) => {
            const chapter = hero.querySelector<HTMLElement>(
              Number(hero.getAttribute("data-scroll-progress")) > 0.3
                ? "[data-hero-chapter]"
                : "[data-hero-intro]",
            )!;
            const text = chapter.getBoundingClientRect();
            const film = hero.querySelector("video")!.getBoundingClientRect();
            const controls = hero
              .querySelector("[data-hero-transport]")!
              .getBoundingClientRect();
            return (
              film.top >= text.bottom + 10 &&
              film.bottom <= controls.top - 10 &&
              film.height > 60
            );
          }),
        )
        .toBe(true);
    }
  }
  await page.goto("/");
  await expect(
    page.locator(
      '[aria-label="Made for product launches, website reveals, portfolio drops, and new features"]',
    ),
  ).toBeAttached();
  await expect(
    page.getByRole("heading", { name: /Make a little noise/ }),
  ).toBeAttached();
});

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

test("scroll motion eases through wheel jumps and follows a quick reversal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const hero = page.locator("[data-home-scroll]");
  await expect(hero).toHaveAttribute("data-scroll-progress", "0.000");
  const samples = await hero.evaluate(async (element) => {
    const start = element.getBoundingClientRect().top + scrollY;
    const distance = element.clientHeight - innerHeight;
    const values: number[] = [];
    window.scrollTo(0, start + distance * 0.55);
    await new Promise<void>((resolve) => {
      const started = performance.now();
      const sample = (now: number) => {
        values.push(Number(element.getAttribute("data-scroll-progress")));
        if (now - started >= 450) resolve();
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    return values;
  });
  // A wheel jump should produce intermediate frames instead of a hard cut.
  expect(samples.some((value) => value > 0.01 && value < 0.5)).toBe(true);
  expect(
    new Set(samples.map((value) => value.toFixed(3))).size,
  ).toBeGreaterThan(4);
  expect(samples.every((value) => value >= 0 && value <= 0.55)).toBe(true);
  await expect
    .poll(async () => Number(await hero.getAttribute("data-scroll-progress")))
    .toBeCloseTo(0.55, 2);

  await hero.evaluate(async (element) => {
    const start = element.getBoundingClientRect().top + scrollY;
    const distance = element.clientHeight - innerHeight;
    window.scrollTo(0, start + distance * 0.9);
    await new Promise((resolve) => setTimeout(resolve, 80));
    window.scrollTo(0, start + distance * 0.12);
  });
  await expect
    .poll(async () => Number(await hero.getAttribute("data-scroll-progress")))
    .toBeCloseTo(0.12, 2);
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
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  const hero = page.locator("[data-home-scroll]");
  await expect(hero.getByText(/Your product\. In motion\./)).toBeVisible();
  const create = await hero
    .getByRole("link", { name: "Create a video", exact: true })
    .boundingBox();
  const film = await page
    .getByLabel("DemoPop launch film", { exact: true })
    .boundingBox();
  expect(create).not.toBeNull();
  expect(film).not.toBeNull();
  expect(create!.y + create!.height).toBeLessThan(film!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  );
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

test("launch package demos load on demand, switch hooks with the keyboard, and pause offscreen", async ({
  page,
}) => {
  const errors: string[] = [];
  const videoRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/\/films\/campaign\/.*\.mp4/.test(request.url()))
      videoRequests.push(request.url());
  });
  await page.goto("/");
  await page.locator("#campaign").scrollIntoViewIfNeeded();
  const picker = page.getByRole("tablist", { name: "Sample opening hook" });
  await expect(picker).toBeVisible();
  const panel = page.getByRole("tabpanel", { name: /The idea/ });
  await expect(panel.locator("video")).toHaveCount(3);
  expect(videoRequests).toHaveLength(0);
  const files = page.locator(
    '[aria-label="Nine videos included in a launch package"]',
  );
  await expect(files.locator("span")).toHaveCount(9);
  for (const [index, hook] of ["original", "product", "benefit"].entries()) {
    await picker.getByRole("tab").nth(index).click();
    for (const format of ["landscape", "vertical", "square"]) {
      const film = page.locator(
        `#campaign video[src$="${format}-${hook}.mp4"]`,
      );
      await expect(film).toHaveCount(1);
      await film.evaluate(async (video: HTMLVideoElement) => {
        video.muted = true;
        await video.play();
      });
      await expect
        .poll(() =>
          film.evaluate((video: HTMLVideoElement) => video.currentTime),
        )
        .toBeGreaterThan(0);
      const dimensions = await film.evaluate((video: HTMLVideoElement) => ({
        ratio: video.videoWidth / video.videoHeight,
        duration: video.duration,
      }));
      expect(dimensions.duration).toBeCloseTo(15, 0);
      expect(dimensions.ratio).toBeCloseTo(
        format === "landscape" ? 16 / 9 : format === "vertical" ? 9 / 16 : 1,
        2,
      );
      expect(
        await page
          .locator("#campaign video")
          .evaluateAll(
            (videos) =>
              videos.filter((video) => !(video as HTMLVideoElement).paused)
                .length,
          ),
      ).toBe(1);
    }
  }
  await picker.getByRole("tab").nth(2).focus();
  await page.keyboard.press("Home");
  await expect(picker.getByRole("tab").nth(0)).toBeFocused();
  await expect(picker.getByRole("tab").nth(0)).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("ArrowLeft");
  await expect(picker.getByRole("tab").nth(2)).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const last = page.locator("#campaign video").last();
  await last.evaluate(async (video: HTMLVideoElement) => {
    video.muted = true;
    await video.play();
  });
  await page.locator("#studio").scrollIntoViewIfNeeded();
  await expect
    .poll(() => last.evaluate((video: HTMLVideoElement) => video.paused))
    .toBe(true);
  expect(errors).toEqual([]);
});

test("launch positioning, FAQ and package call to action lead into the working editor", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/One product\. A whole launch/);
  await page.getByRole("link", { name: "Launch package", exact: true }).click();
  await expect(page.locator("#campaign")).toBeInViewport();
  const question = page.getByText("What’s in a launch package?", {
    exact: true,
  });
  await question.click();
  await expect(page.locator("details[open]")).toContainText("Nine MP4 videos");
  await expect(page.locator("#studio")).toContainText(
    "Save your branding, copy, timing, and framing as a recipe.",
  );
  await page
    .getByRole("link", { name: "Build your launch package", exact: true })
    .click();
  await expect(page).toHaveURL(/\/editor\/new$/);
  await expect(page.getByLabel("Project name", { exact: true })).toBeVisible();
});
