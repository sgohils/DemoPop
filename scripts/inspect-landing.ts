import { chromium, type Page } from "@playwright/test";
import { ensureBrowser } from "@remotion/renderer";
import { mkdir, writeFile } from "node:fs/promises";

const directory = "out/qa/landing";
await mkdir(directory, { recursive: true });
const executable = await ensureBrowser();
if (!("path" in executable)) throw new Error("Chromium is unavailable.");
const browser = await chromium.launch({
  executablePath: executable.path,
  headless: true,
});
const errors: string[] = [];

async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => setTimeout(resolve, 650));
  });
}

async function screenshot(page: Page, name: string, fullPage = false) {
  await settle(page);
  await page.screenshot({ path: `${directory}/${name}.png`, fullPage });
}

async function alignSection(page: Page, selector: string) {
  await page
    .locator(selector)
    .evaluate((element) => element.scrollIntoView({ block: "start" }));
}

async function walkPage(page: Page) {
  const height = await page.evaluate(
    () => document.documentElement.scrollHeight,
  );
  for (let top = 0; top < height; top += 650) {
    await page.evaluate((position) => window.scrollTo(0, position), top);
    await page.waitForTimeout(100);
  }
  await page.locator("#styles").scrollIntoViewIfNeeded();
  await page
    .getByRole("button", { name: "Launch Film sample", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Play", exact: true }).waitFor();
  await settle(page);
}

async function heroGeometry(page: Page) {
  return page.locator("[data-home-scroll]").evaluate((hero) => {
    const title = hero.querySelector("h1")!;
    const cta = Array.from(hero.querySelectorAll("a")).find((element) =>
      element.textContent?.includes("Create a video"),
    )!;
    const film = hero.querySelector<HTMLVideoElement>(
      "video[aria-label='DemoPop launch film']",
    )!;
    const watch = hero.querySelector<HTMLButtonElement>(
      "button[aria-label='Watch the film']",
    )!;
    const describe = (element: Element) => {
      const bounds = element.getBoundingClientRect();
      let opacity = 1;
      for (
        let node: Element | null = element;
        node;
        node = node.parentElement
      ) {
        opacity *= Number(getComputedStyle(node).opacity);
      }
      const center = {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
      };
      const hit = document.elementFromPoint(center.x, center.y);
      return {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        bottom: bounds.bottom,
        opacity,
        insideViewport: bounds.top >= 0 && bounds.bottom <= innerHeight,
        centerCanReceiveClick:
          !!hit && (hit === element || element.contains(hit)),
      };
    };
    const heading = describe(title);
    const create = describe(cta);
    const movie = describe(film);
    const intersects = (first: typeof heading, second: typeof heading) =>
      first.opacity > 0.1 &&
      second.opacity > 0.1 &&
      first.x < second.x + second.width &&
      first.x + first.width > second.x &&
      first.y < second.y + second.height &&
      first.y + first.height > second.y;
    return {
      progress: hero.getAttribute("data-scroll-progress"),
      viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      heading,
      create,
      film: movie,
      watch: describe(watch),
      overlaps: {
        headingFilm: intersects(heading, movie),
        ctaFilm: intersects(create, movie),
      },
    };
  });
}

try {
  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["mobile", { width: 390, height: 844 }],
    ["mobile-short", { width: 390, height: 667 }],
    ["mobile-small", { width: 320, height: 568 }],
  ] as const) {
    const page = await browser.newPage({ viewport });
    page.on("pageerror", (error) => errors.push(`${name}: ${error.message}`));
    await page.goto("http://127.0.0.1:3001/", { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: /You built it\./ }).waitFor();
    await page.waitForFunction(() => {
      const film = document.querySelector<HTMLVideoElement>(
        "video[aria-label='DemoPop launch film']",
      );
      return film && Number.isFinite(film.duration);
    });
    await screenshot(page, `${name}-hero`);
    const top = await heroGeometry(page);
    await page.locator("[data-home-scroll]").evaluate((element) => {
      const top = element.getBoundingClientRect().top + scrollY;
      scrollTo(0, top + (element.clientHeight - innerHeight) * 0.5);
    });
    await page.waitForFunction(() => {
      const film = document.querySelector<HTMLVideoElement>(
        "video[aria-label='DemoPop launch film']",
      );
      return film && film.currentTime > 5 && !film.seeking;
    });
    await screenshot(page, `${name}-scroll-half`);
    const midpoint = await heroGeometry(page);
    await writeFile(
      `${directory}/${name}-hero-geometry.json`,
      JSON.stringify({ top, midpoint }, null, 2),
    );
    if (name === "mobile-short" || name === "mobile-small") {
      const watch = page.getByRole("button", {
        name: "Watch the film",
        exact: true,
      });
      await watch.scrollIntoViewIfNeeded();
      const scrollBefore = await page.evaluate(() => scrollY);
      await watch.click();
      const dialog = page.getByRole("dialog", {
        name: "Made with DemoPop.",
        exact: true,
      });
      await dialog.waitFor();
      await screenshot(page, `${name}-film-dialog`);
      const modal = await page.evaluate(() => ({
        bodyPosition: document.body.style.position,
        bodyOverflow: document.body.style.overflow,
        dialogHeight: document.querySelector("dialog")!.getBoundingClientRect()
          .height,
        viewportHeight: innerHeight,
      }));
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      const closed = await page.evaluate(() => ({
        bodyPosition: document.body.style.position,
        scrollY,
        watchFocused:
          document.activeElement?.getAttribute("aria-label") ===
          "Watch the film",
      }));
      await writeFile(
        `${directory}/${name}-dialog-geometry.json`,
        JSON.stringify({ scrollBefore, modal, closed }, null, 2),
      );
      await page.close();
      continue;
    }
    await walkPage(page);
    await alignSection(page, "#product");
    await screenshot(page, `${name}-product`);
    for (const [number, title] of [
      [2, "Make it yours."],
      [3, "Send it out."],
    ] as const) {
      await page.getByRole("tab", { name: new RegExp(title) }).click();
      const panel = page.getByRole("tabpanel", { name: new RegExp(title) });
      await panel.waitFor();
      await panel.locator("img").evaluateAll(async (images) => {
        await Promise.all(
          (images as HTMLImageElement[]).map(async (image) => {
            if (!image.complete) await image.decode();
          }),
        );
      });
      await settle(page);
      await panel.screenshot({
        path: `${directory}/${name}-story-${number}.png`,
      });
    }
    await page.getByRole("tab", { name: /Drop it in\./ }).click();
    await alignSection(page, "#styles");
    await screenshot(page, `${name}-gallery`);
    await page.locator("footer").scrollIntoViewIfNeeded();
    await screenshot(page, `${name}-footer`);
    await screenshot(page, `${name}-full`, true);
    const measurements = await page.evaluate(() => ({
      viewport: { width: innerWidth, height: innerHeight },
      page: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      },
      images: Array.from(document.images)
        .filter(
          (image) =>
            image.getClientRects().length > 0 &&
            (!image.complete || !image.naturalWidth),
        )
        .map((image) => image.src),
      hiddenReveals: Array.from(
        document.querySelectorAll("[data-reveal]"),
      ).filter((element) => (element as HTMLElement).dataset.seen !== "true")
        .length,
    }));
    await writeFile(
      `${directory}/${name}-measurements.json`,
      JSON.stringify(measurements, null, 2),
    );
    await page.close();
  }
  await writeFile(
    `${directory}/page-errors.json`,
    JSON.stringify(errors, null, 2),
  );
  console.log(`Landing screenshots saved to ${directory}.`);
  console.log(JSON.stringify({ errors }));
} finally {
  await browser.close();
}
