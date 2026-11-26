import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("opening copy clears before the expanding film takes its space", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mkdir("out/qa/scroll-refinement", { recursive: true });
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 1366, height: 610 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const hero = page.locator("[data-home-scroll]");
    for (const amount of [0.16, 0.2, 0.24, 0.28, 0.32]) {
      await hero.evaluate(
        (element, value) =>
          scrollTo(
            0,
            element.getBoundingClientRect().top +
              scrollY +
              (element.clientHeight - innerHeight) * value,
          ),
        amount,
      );
      await expect
        .poll(async () =>
          Number(await hero.getAttribute("data-scroll-progress")),
        )
        .toBeCloseTo(amount, 2);
      await expect(hero.locator("[data-immersion]")).toHaveAttribute(
        "data-scroll-settled",
        "true",
      );
      const geometry = await hero.evaluate((element) => {
        const intro = element.querySelector<HTMLElement>("[data-hero-intro]")!;
        const chapter = element.querySelector<HTMLElement>(
          "[data-hero-chapter]",
        )!;
        const film = element.querySelector("video")!.getBoundingClientRect();
        const controls = element
          .querySelector("[data-hero-transport]")!
          .getBoundingClientRect();
        return {
          copyOverlap:
            Number(getComputedStyle(intro).opacity) > 0.1
              ? Math.max(0, intro.getBoundingClientRect().bottom + 8 - film.top)
              : 0,
          chapterOverlap:
            Number(getComputedStyle(chapter).opacity) > 0.1
              ? Math.max(
                  0,
                  chapter.getBoundingClientRect().bottom + 8 - film.top,
                )
              : 0,
          controlsOverlap: Math.max(0, film.bottom + 8 - controls.top),
          progress: Number(element.getAttribute("data-scroll-progress")),
        };
      });
      expect(geometry.progress).toBeCloseTo(amount, 2);
      expect(
        geometry.copyOverlap,
        `opening clearance at ${viewport.width}px / ${amount}`,
      ).toBe(0);
      expect(geometry.chapterOverlap).toBe(0);
      expect(geometry.controlsOverlap).toBe(0);
      if (amount === 0.24)
        await page.screenshot({
          path: `out/qa/scroll-refinement/${viewport.width}-fixed-opening.png`,
        });
    }
  }
  expect(errors).toEqual([]);
});

test("chapter handoffs blend, finish when scrolling stops, and reverse without a framing jump", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const hero = page.locator("[data-home-scroll]");
  const reveal = hero.locator('[data-hero-chapter] > [data-chapter-layer="1"]');
  const proof = hero.locator('[data-hero-chapter] > [data-chapter-layer="2"]');
  const scrollTo = async (amount: number) =>
    hero.evaluate(
      (element, value) =>
        window.scrollTo(
          0,
          element.getBoundingClientRect().top +
            scrollY +
            (element.clientHeight - innerHeight) * value,
        ),
      amount,
    );
  await scrollTo(0.44);
  await expect(reveal).toHaveCSS("opacity", "1");
  await expect
    .poll(async () => Number(await hero.getAttribute("data-scroll-progress")))
    .toBe(0.44);
  const samples = await hero.evaluate(async (element) => {
    const from = element.querySelector<HTMLElement>(
      '[data-hero-chapter] > [data-chapter-layer="1"]',
    )!;
    const to = element.querySelector<HTMLElement>(
      '[data-hero-chapter] > [data-chapter-layer="2"]',
    )!;
    const film = element.querySelector("video")!;
    window.scrollTo(
      0,
      element.getBoundingClientRect().top +
        scrollY +
        (element.clientHeight - innerHeight) * 0.48,
    );
    const frames: {
      outgoing: number;
      incoming: number;
      top: number;
      width: number;
      textOverlap: number;
    }[] = [];
    await new Promise<void>((resolve) => {
      const started = performance.now();
      const read = (now: number) => {
        const rect = film.getBoundingClientRect();
        const outgoing = from.getBoundingClientRect(),
          incoming = to.getBoundingClientRect();
        frames.push({
          outgoing: Number(getComputedStyle(from).opacity),
          incoming: Number(getComputedStyle(to).opacity),
          top: rect.top,
          width: rect.width,
          textOverlap: Math.max(
            0,
            Math.min(outgoing.bottom, incoming.bottom) -
              Math.max(outgoing.top, incoming.top),
          ),
        });
        if (now - started > 650) resolve();
        else requestAnimationFrame(read);
      };
      requestAnimationFrame(read);
    });
    return frames;
  });
  expect(
    samples.some((sample) => sample.incoming > 0.05 && sample.outgoing > 0.05),
  ).toBe(true);
  expect(
    samples
      .filter((sample) => sample.outgoing > 0.05 && sample.incoming > 0.05)
      .every((sample) => sample.textOverlap < 0.5),
  ).toBe(true);
  expect(
    samples.every(
      (sample) => Math.abs(sample.incoming + sample.outgoing - 1) < 0.001,
    ),
  ).toBe(true);
  expect(
    Math.max(...samples.map((sample) => sample.top)) -
      Math.min(...samples.map((sample) => sample.top)),
  ).toBeLessThan(0.5);
  expect(
    Math.max(...samples.map((sample) => sample.width)) -
      Math.min(...samples.map((sample) => sample.width)),
  ).toBeLessThan(0.5);
  await expect(proof).toHaveCSS("opacity", "1");
  await expect(reveal).toHaveCSS("opacity", "0");
  await scrollTo(0.44);
  await expect(reveal).toHaveCSS("opacity", "1");
  await hero.evaluate(async (element) => {
    const start = element.getBoundingClientRect().top + scrollY;
    const distance = element.clientHeight - innerHeight;
    window.scrollTo(0, start + distance * 0.6);
    await new Promise((resolve) => setTimeout(resolve, 100));
    window.scrollTo(0, start + distance * 0.43);
  });
  await expect(reveal).toHaveCSS("opacity", "1");
  await expect(proof).toHaveCSS("opacity", "0");
  await expect
    .poll(async () => Number(await hero.getAttribute("data-scroll-progress")))
    .toBe(0.43);
});

test("the opening expands into a cinema view and chapter controls follow native scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const hero = page.locator("[data-home-scroll]");
  const film = page.getByLabel("DemoPop launch film", { exact: true });
  await expect(hero).toHaveAttribute("data-scroll-progress", "0.000");
  const opening = await film.boundingBox();
  await mkdir("out/qa/immersive-scroll", { recursive: true });
  await page.screenshot({
    path: "out/qa/immersive-scroll/desktop-opening.png",
  });
  const create = hero.locator('a[href="/create"]');
  const watch = page.getByRole("button", {
    name: "Watch the film",
    exact: true,
  });
  await create.focus();
  await expect(create).toBeFocused();
  const heroStart = await hero.evaluate(
    (element) => element.getBoundingClientRect().top + scrollY,
  );
  const scrollDistance = await hero.evaluate(
    (element) => element.clientHeight - innerHeight,
  );
  await page.evaluate(
    ({ start, distance }) => window.scrollTo(0, start + distance * 0.4),
    { start: heroStart, distance: scrollDistance },
  );
  await expect
    .poll(async () => Number(await hero.getAttribute("data-scroll-progress")))
    .toBeCloseTo(0.4, 2);
  await expect(create).toHaveAttribute("tabindex", "-1");
  await expect(watch).toBeFocused();
  const rail = page.getByRole("navigation", { name: "Film chapters" });
  await rail
    .getByRole("button", { name: "Scroll to The reveal", exact: true })
    .click();
  await expect
    .poll(async () => Number(await hero.getAttribute("data-scroll-progress")))
    .toBeCloseTo(0.4, 2);
  await expect(
    rail.getByRole("button", { name: "Scroll to The reveal", exact: true }),
  ).toHaveAttribute("aria-current", "step");
  await expect
    .poll(() => film.evaluate((element: HTMLVideoElement) => element.seeking))
    .toBe(false);
  const cinema = await film.boundingBox();
  expect(cinema!.width).toBeGreaterThan(opening!.width * 1.45);
  expect(cinema!.width).toBeGreaterThan(1440 * 0.87);
  expect(cinema!.x).toBeGreaterThanOrEqual(0);
  expect(cinema!.x + cinema!.width).toBeLessThanOrEqual(1440);
  await page.screenshot({ path: "out/qa/immersive-scroll/desktop-reveal.png" });
  const close = rail.getByRole("button", {
    name: "Scroll to Your next launch",
    exact: true,
  });
  await close.focus();
  await page.keyboard.press("Enter");
  await expect
    .poll(async () => Number(await hero.getAttribute("data-scroll-progress")))
    .toBeCloseTo(0.94, 2);
  await expect(close).toHaveAttribute("aria-current", "step");
  expect(
    await film.evaluate((element: HTMLVideoElement) => element.muted),
  ).toBe(true);
  await page.screenshot({ path: "out/qa/immersive-scroll/desktop-close.png" });
  await rail
    .getByRole("button", { name: "Scroll to The hook", exact: true })
    .click();
  await expect
    .poll(async () => Number(await hero.getAttribute("data-scroll-progress")))
    .toBeCloseTo(0, 2);
  await expect(
    hero.getByRole("link", { name: "Create from a website", exact: true }),
  ).toHaveAttribute("tabindex", "0");
  expect(errors).toEqual([]);
});

test("the layered hero stops writing animation styles once its scroll position settles", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const hero = page.locator("[data-home-scroll]");
  await hero.evaluate((element) =>
    scrollTo(
      0,
      element.getBoundingClientRect().top +
        scrollY +
        (element.clientHeight - innerHeight) * 0.65,
    ),
  );
  await expect
    .poll(async () => Number(await hero.getAttribute("data-scroll-progress")))
    .toBe(0.65);
  await expect(hero.locator("[data-immersion]")).toHaveAttribute(
    "data-scroll-settled",
    "true",
  );
  const mutations = await hero.evaluate(
    (element) =>
      new Promise<number>((resolve) => {
        const stage = element.querySelector("[data-immersion]")!;
        let count = 0;
        const observer = new MutationObserver((records) => {
          count += records.length;
        });
        observer.observe(stage, {
          attributes: true,
          attributeFilter: ["style"],
        });
        setTimeout(() => {
          observer.disconnect();
          resolve(count);
        }, 500);
      }),
  );
  expect(mutations).toBe(0);
});

test("immersive framing fits phone, landscape and short laptop screens", async ({
  page,
}) => {
  await mkdir("out/qa/immersive-scroll", { recursive: true });
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 568 },
    { width: 844, height: 390 },
    { width: 1366, height: 610 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const hero = page.locator("[data-home-scroll]");
    for (const amount of [0, 0.65]) {
      await hero.evaluate(
        (element, value) =>
          scrollTo(
            0,
            element.getBoundingClientRect().top +
              scrollY +
              (element.clientHeight - innerHeight) * value,
          ),
        amount,
      );
      await expect
        .poll(async () =>
          Number(await hero.getAttribute("data-scroll-progress")),
        )
        .toBeCloseTo(amount, 2);
      const film = await page
        .getByLabel("DemoPop launch film", { exact: true })
        .boundingBox();
      const watch = await page
        .getByRole("button", { name: "Watch the film", exact: true })
        .boundingBox();
      expect(film!.height).toBeGreaterThan(60);
      expect(film!.x).toBeGreaterThanOrEqual(0);
      expect(film!.x + film!.width).toBeLessThanOrEqual(viewport.width);
      expect(watch!.y + watch!.height).toBeLessThanOrEqual(viewport.height);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(viewport.width);
      await page.screenshot({
        path: `out/qa/immersive-scroll/${viewport.width}x${viewport.height}-${amount === 0 ? "opening" : "proof"}.png`,
      });
    }
  }
});

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
    page.getByRole("heading", { name: /Turn client websites/ }),
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
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() =>
      page
        .getByLabel("DemoPop launch film", { exact: true })
        .evaluate((film: HTMLVideoElement) => film.readyState),
    )
    .toBeGreaterThanOrEqual(2);
  const samples = await hero.evaluate(async (element) => {
    const start = element.getBoundingClientRect().top + scrollY;
    const distance = element.clientHeight - innerHeight;
    const values: number[] = [];
    window.scrollTo(0, start + distance * 0.55);
    await new Promise<void>((resolve) => {
      const started = performance.now();
      const sample = (now: number) => {
        values.push(Number(element.getAttribute("data-scroll-progress")));
        // Check interpolation across frames, independent of how quickly this
        // headless browser paints them on a busy development machine.
        const distinct = new Set(values.map((value) => value.toFixed(3))).size;
        if ((now - started >= 450 && distinct >= 6) || now - started > 1500)
          resolve();
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

test("the scroll story pauses on the product reveal and closing identity", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const hero = page.locator("[data-home-scroll]");
  const film = page.getByLabel("DemoPop launch film", { exact: true });
  await expect
    .poll(() => film.evaluate((video: HTMLVideoElement) => video.duration))
    .toBeGreaterThan(10);
  async function seekTo(amount: number) {
    await hero.evaluate((element, value) => {
      const start = element.getBoundingClientRect().top + scrollY;
      window.scrollTo(0, start + (element.clientHeight - innerHeight) * value);
    }, amount);
    await expect
      .poll(async () => Number(await hero.getAttribute("data-scroll-progress")))
      .toBeCloseTo(amount, 2);
    await expect
      .poll(() => film.evaluate((video: HTMLVideoElement) => video.seeking))
      .toBe(false);
    return film.evaluate((video: HTMLVideoElement) => video.currentTime);
  }
  const reveal = await seekTo(0.4);
  expect(reveal).toBeGreaterThan(4);
  expect(Math.abs((await seekTo(0.44)) - reveal)).toBeLessThan(1 / 30);
  expect(await seekTo(0.6)).toBeGreaterThan(reveal + 2);
  const closing = await seekTo(0.94);
  expect(closing).toBeGreaterThan(14);
  expect(Math.abs((await seekTo(0.99)) - closing)).toBeLessThan(1 / 30);
});

test("desktop chapter captions leave the film and transport clear", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 1366, height: 610 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const hero = page.locator("[data-home-scroll]");
    for (const amount of [0.48, 0.65, 0.94]) {
      await hero.evaluate((element, value) => {
        const start = element.getBoundingClientRect().top + scrollY;
        window.scrollTo(
          0,
          start + (element.clientHeight - innerHeight) * value,
        );
      }, amount);
      await expect
        .poll(() =>
          hero.evaluate((element) => {
            const chapter = element.querySelector("[data-hero-chapter]")!;
            const film = element
              .querySelector("video")!
              .getBoundingClientRect();
            const transport = element
              .querySelector("[data-hero-transport]")!
              .getBoundingClientRect();
            return (
              Number(getComputedStyle(chapter).opacity) > 0.98 &&
              film.top > chapter.getBoundingClientRect().bottom + 10 &&
              film.bottom < transport.top - 10 &&
              film.height > 200
            );
          }),
        )
        .toBe(true);
    }
  }
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
    page.getByRole("heading", { name: /Turn client websites/ }),
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
    page.getByRole("heading", { name: /Turn client websites/ }),
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
  await expect(
    hero.getByRole("link", { name: /See a sample package/ }),
  ).toBeVisible();
  const create = await hero
    .getByRole("link", { name: "Create from a website", exact: true })
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
  const panel = page.getByRole("tabpanel", { name: /Send it out/ });
  await expect(panel).toHaveAttribute("tabindex", "0");
  await page.keyboard.press("Tab");
  await expect(panel).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("tab", { name: /Send it out/ })).toBeFocused();
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

test("mobile gallery format controls stay easy to tap and expose their selection", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#styles").scrollIntoViewIfNeeded();
  const group = page.getByRole("group", { name: "Sample video format" });
  const portrait = group.getByRole("button", { name: "Portrait sample" });
  const landscape = group.getByRole("button", { name: "Landscape sample" });

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(landscape).toHaveAttribute("aria-pressed", "true");
    for (const button of [portrait, landscape]) {
      const bounds = await button.boundingBox();
      expect(
        bounds?.height,
        `${width}px format control height`,
      ).toBeGreaterThanOrEqual(44);
    }
    await portrait.click();
    await expect(portrait).toHaveAttribute("aria-pressed", "true");
    await expect(landscape).toHaveAttribute("aria-pressed", "false");
    await landscape.click();
  }
});

test("gallery format controls switch with arrow keys and keep focus on the choice", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("#styles").scrollIntoViewIfNeeded();
  const group = page.getByRole("group", { name: "Sample video format" });
  const portrait = group.getByRole("button", { name: "Portrait sample" });
  const landscape = group.getByRole("button", { name: "Landscape sample" });

  await landscape.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(portrait).toBeFocused();
  await expect(portrait).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowRight");
  await expect(landscape).toBeFocused();
  await expect(landscape).toHaveAttribute("aria-pressed", "true");
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
  await expect(page).toHaveTitle(/Client websites\. Complete launch campaigns/);
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
