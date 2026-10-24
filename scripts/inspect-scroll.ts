import { chromium, expect } from "@playwright/test";
import { ensureBrowser } from "@remotion/renderer";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.DEMOPOP_QA_URL || "http://127.0.0.1:3001";
const directory = "out/qa/scroll-refinement";
await mkdir(directory, { recursive: true });
const executable = await ensureBrowser();
if (!("path" in executable)) throw new Error("Chromium is unavailable.");
const browser = await chromium.launch({
  executablePath: executable.path,
  headless: true,
});
const errors: string[] = [];
const samples: {
  introOverlap: number;
  chapterOverlap: number;
  controlsOverlap: number;
  videoError?: string;
  overflow: boolean;
}[] = [];
try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
    { width: 1366, height: 610 },
  ]) {
    const page = await browser.newPage({ viewport });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (entry) => {
      if (entry.type() === "error") errors.push(entry.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400)
        errors.push(`${response.status()} ${response.url()}`);
    });
    await page.goto(base);
    await page.evaluate(() => document.fonts.ready);
    const hero = page.locator("[data-home-scroll]");
    for (const amount of [0, 0.16, 0.2, 0.24, 0.27, 0.31, 0.46, 0.5, 0.72]) {
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
      const sample = await hero.evaluate((element) => {
        const intro = element.querySelector<HTMLElement>("[data-hero-intro]")!;
        const chapter = element.querySelector<HTMLElement>(
          "[data-hero-chapter]",
        )!;
        const film = element.querySelector("video")!;
        const controls = element.querySelector("[data-hero-transport]")!;
        const first = intro.getBoundingClientRect(),
          text = chapter.getBoundingClientRect(),
          video = film.getBoundingClientRect(),
          bar = controls.getBoundingClientRect();
        const introOpacity = Number(getComputedStyle(intro).opacity),
          chapterOpacity = Number(getComputedStyle(chapter).opacity);
        return {
          progress: element.getAttribute("data-scroll-progress"),
          viewport: { width: innerWidth, height: innerHeight },
          introOpacity,
          chapterOpacity,
          introOverlap:
            introOpacity > 0.2 ? Math.max(0, first.bottom - video.top) : 0,
          chapterOverlap:
            chapterOpacity > 0.2 ? Math.max(0, text.bottom - video.top) : 0,
          controlsOverlap: Math.max(0, video.bottom - bar.top),
          overflow: document.documentElement.scrollWidth > innerWidth,
          videoError: film.error?.message,
          video: { top: video.top, bottom: video.bottom, height: video.height },
          captions: Array.from(chapter.children).map((child) => ({
            text: child.textContent,
            opacity: getComputedStyle(child).opacity,
            visibility: getComputedStyle(child).visibility,
          })),
        };
      });
      samples.push(sample);
      if (
        sample.introOverlap > 1 ||
        sample.chapterOverlap > 1 ||
        sample.controlsOverlap > 1 ||
        sample.videoError ||
        sample.overflow
      )
        await page.screenshot({
          path: `${directory}/${viewport.width}-${amount}.png`,
        });
    }
    await page.close();
  }
  await writeFile(
    `${directory}/audit.json`,
    JSON.stringify({ errors, samples }, null, 2),
  );
  console.log(
    JSON.stringify({
      errors,
      issues: samples.filter(
        (sample) =>
          sample.introOverlap > 1 ||
          sample.chapterOverlap > 1 ||
          sample.controlsOverlap > 1 ||
          sample.videoError ||
          sample.overflow,
      ),
    }),
  );
} finally {
  await browser.close();
}
