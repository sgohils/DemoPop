import assert from "node:assert/strict";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import {
  ensureBrowser,
  getVideoMetadata,
  renderMedia,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import sharp from "sharp";
import {
  launchProject,
  projectSchema,
  type Media,
  type VideoProps,
} from "../src/shared/project";
import { cleanupBundle, getBundle } from "../worker/render";

const directory = "public/films";
const logoFile = "public/brand/breakout-ink.png";
const argumentsList = process.argv.slice(2);
if (
  argumentsList.some(
    (argument) =>
      !["--capture-only", "--render-only", "--poster-only"].includes(argument),
  ) ||
  (argumentsList.includes("--capture-only") &&
    (argumentsList.includes("--render-only") ||
      argumentsList.includes("--poster-only")))
)
  throw new Error(
    "Usage: npx tsx scripts/create-demopop-film.ts [--capture-only | --render-only | --poster-only]",
  );
await mkdir(directory, { recursive: true });
const project = projectSchema.parse({
  ...launchProject,
  name: "DemoPop",
  format: "landscape",
  font: "dm-sans",
  color: "#8C9EFF",
  sound: "pulse",
  opening: "Your launch.\nMake it move.",
  highlight1: "Two screenshots. One film.",
  highlight2: "Your product. In the spotlight.",
  cta: "Your next launch starts here.",
  url: "Create your first film",
  beforeCrop: { x: 0.5, y: 0.5, zoom: 1 },
  afterCrop: { x: 0.5, y: 0.5, zoom: 1 },
});

if (
  !argumentsList.includes("--render-only") &&
  !argumentsList.includes("--poster-only")
) {
  const installed = await ensureBrowser();
  if (!("path" in installed)) throw new Error("Video browser is unavailable.");
  const browser = await chromium.launch({
    headless: true,
    executablePath: installed.path,
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 2,
      colorScheme: "light",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(
      `${process.env.DEMOPOP_CAPTURE_URL || "http://127.0.0.1:3001"}/editor/new?template=reveal`,
      { waitUntil: "networkidle" },
    );
    await expect(
      page.getByRole("button", { name: "Play", exact: true }),
    ).toBeEnabled();
    await page.getByLabel("Upload optional logo").setInputFiles(logoFile);
    await expect(
      page.getByRole("img", { name: "Project logo", exact: true }),
    ).toHaveAttribute("src", /^blob:/);
    await page.getByLabel("Project name").fill(project.name);
    await page.getByLabel("Opening caption").fill(project.opening);
    await page.getByLabel("First highlight").fill(project.highlight1);
    await page.getByLabel("Second highlight").fill(project.highlight2);
    await page.getByLabel("Closing URL text").fill(project.url);
    await page
      .getByLabel("Hex brand color", { exact: true })
      .fill(project.color);
    await page
      .getByRole("combobox", { name: "Video font", exact: true })
      .selectOption(project.font);
    await page.getByRole("button", { name: "Jump to Opening" }).click();
    await expect(
      page.getByRole("slider", { name: "Video position" }),
    ).toHaveValue("35");
    await page.evaluate(async () => {
      await document.fonts.ready;
      (document.activeElement as HTMLElement | null)?.blur();
      document.querySelector(".settings-panel")?.scrollTo(0, 0);
    });
    await expect(
      page.getByText("Draft saved in this browser", { exact: true }),
    ).toBeVisible();
    const before = await page.screenshot({
      type: "png",
      animations: "disabled",
    });
    await sharp(before)
      .webp({ quality: 92, effort: 6 })
      .toFile(`${directory}/demopop-before.webp`);
    console.log("Captured real DemoPop Classic Reveal editor.");

    await page.getByRole("radio", { name: "Launch Film", exact: true }).check();
    await page
      .getByRole("radio", { name: "Landscape 16:9", exact: true })
      .check();
    await page.getByLabel("Closing call to action").fill(project.cta);
    await page
      .getByRole("combobox", { name: "Soundtrack", exact: true })
      .selectOption("pulse");
    for (const kind of ["before", "after"] as const) {
      await page.getByLabel(`Upload ${kind} screenshot`).setInputFiles({
        name: "demopop-editor.png",
        mimeType: "image/png",
        buffer: before,
      });
      await expect(
        page.getByRole("img", {
          name: `${kind} website screenshot`,
          exact: true,
        }),
      ).toHaveAttribute("src", /^blob:/);
    }
    // A normal setting edit dismisses the transient upload status before capture.
    await page
      .getByRole("combobox", { name: "Soundtrack", exact: true })
      .selectOption("off");
    await page
      .getByRole("combobox", { name: "Soundtrack", exact: true })
      .selectOption("pulse");
    await expect(
      page.getByRole("button", { name: "Play", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Jump to Closing" }).click();
    await expect(
      page.getByRole("slider", { name: "Video position" }),
    ).toHaveValue("405");
    await page.evaluate(async () => {
      await document.fonts.ready;
      (document.activeElement as HTMLElement | null)?.blur();
      document.querySelector(".settings-panel")?.scrollTo(0, 0);
    });
    await expect(
      page.getByText("Draft saved in this browser", { exact: true }),
    ).toBeVisible();
    const afterCapture = await page.screenshot({
      type: "png",
      animations: "disabled",
    });
    await sharp(afterCapture)
      .webp({ quality: 92, effort: 6 })
      .toFile(`${directory}/demopop-after-capture.webp`);
    // Preserve the real editor capture inside a graphite presentation matte.
    // Launch's panoramic-image framing keeps the full UI and identity visible
    // during its close-up, rather than magnifying the nested preview headline.
    await sharp({
      create: { width: 6000, height: 2400, channels: 3, background: "#1f252e" },
    })
      .composite([{ input: afterCapture, left: 1560, top: 200 }])
      .webp({ quality: 92, effort: 6 })
      .toFile(`${directory}/demopop-after.webp`);
    assert.deepEqual(
      errors,
      [],
      "Product screenshots must not contain browser errors.",
    );
    console.log("Captured real DemoPop landscape Launch Film editor.");
  } finally {
    await browser.close();
  }
}

if (!argumentsList.includes("--capture-only")) {
  const image = async (name: string): Promise<Media> => {
    const file = `${directory}/${name}.webp`;
    const { width, height } = await sharp(file).metadata();
    assert.ok(width && height);
    return {
      src: `data:image/webp;base64,${(await readFile(file)).toString("base64")}`,
      width,
      height,
    };
  };
  const inputProps: VideoProps = {
    project,
    before: await image("demopop-before"),
    after: await image("demopop-after"),
    logo: {
      src: `data:image/png;base64,${(await readFile(logoFile)).toString("base64")}`,
      width: 512,
      height: 512,
    },
  };
  try {
    const serveUrl = await getBundle();
    const composition = await selectComposition({
      serveUrl,
      id: "Reveal",
      inputProps,
    });
    const posterPng = await renderStill({
      serveUrl,
      composition,
      inputProps,
      frame: 217,
      imageFormat: "png",
      timeoutInMilliseconds: 60000,
    });
    assert.ok(posterPng.buffer);
    await sharp(posterPng.buffer)
      .webp({ quality: 90, effort: 6 })
      .toFile(`${directory}/demopop-launch-poster.webp`);
    console.log("Rendered genuine frame 217 for the film poster.");

    if (!argumentsList.includes("--poster-only")) {
      let previous = -1;
      const video = path.resolve(directory, "demopop-launch.mp4");
      // The shared generator and composition remain unchanged. The landing asset
      // uses a short GOP for frequent scroll seeks; Remotion's MP4 muxer adds
      // faststart so a browser can read its index before downloading the payload.
      await renderMedia({
        serveUrl,
        composition,
        inputProps,
        outputLocation: video,
        codec: "h264",
        pixelFormat: "yuv420p",
        colorSpace: "bt709",
        imageFormat: "png",
        crf: 18,
        gopSize: 15,
        concurrency: Number(process.env.RENDER_CONCURRENCY || 2),
        chromiumOptions: { enableMultiProcessOnLinux: true },
        timeoutInMilliseconds: 60000,
        onProgress: ({ progress }) => {
          const percent = Math.floor(progress * 10) * 10;
          if (percent !== previous) {
            console.log(`DemoPop film: ${percent}%`);
            previous = percent;
          }
        },
      });
      const metadata = await getVideoMetadata(video);
      assert.equal(metadata.width, 1920);
      assert.equal(metadata.height, 1080);
      assert.equal(metadata.fps, 30);
      assert.equal(metadata.codec, "h264");
      assert.equal(metadata.pixelFormat, "yuv420p");
      assert.equal(metadata.audioCodec, "aac");
      assert.ok(Math.abs(metadata.durationInSeconds! - 15) < 0.1);
      const bytes = await readFile(video);
      const atoms = new Map<string, { start: number; end: number }>();
      for (let offset = 0; offset + 8 <= bytes.length;) {
        const size = bytes.readUInt32BE(offset);
        assert.ok(size >= 8, "MP4 atoms must have valid explicit lengths.");
        atoms.set(bytes.toString("ascii", offset + 4, offset + 8), {
          start: offset,
          end: offset + size,
        });
        offset += size;
      }
      const moov = atoms.get("moov"),
        mdat = atoms.get("mdat");
      assert.ok(
        moov && mdat && moov.start < mdat.start,
        "MP4 must have a faststart index.",
      );
      const stss = bytes.indexOf("stss", moov.start);
      assert.ok(
        stss > moov.start && stss < moov.end,
        "MP4 must declare its keyframes.",
      );
      const count = bytes.readUInt32BE(stss + 8);
      const keyframes = Array.from({ length: count }, (_, index) =>
        bytes.readUInt32BE(stss + 12 + index * 4),
      );
      assert.equal(keyframes[0], 1);
      assert.ok(
        keyframes.every(
          (frame, index) => index === 0 || frame - keyframes[index - 1] <= 15,
        ),
      );
      assert.ok(450 - keyframes[keyframes.length - 1] < 15);
      await writeFile(
        `${directory}/demopop-launch-metadata.json`,
        JSON.stringify(
          {
            ...metadata,
            bytes: (await stat(video)).size,
            faststart: true,
            maximumGopFrames: 15,
            keyframeCount: keyframes.length,
            posterFrame: 217,
            brand: { mark: "Breakout", logo: logoFile },
            capture: {
              viewport: { width: 1440, height: 1000 },
              deviceScaleFactor: 2,
              afterPresentation:
                "Unmodified real editor capture centered in a 6000×2400 graphite matte",
              before: "Real DemoPop Classic Reveal editor, opening scene",
              after:
                "Real DemoPop landscape Launch Film editor, closing identity",
              media: {
                before: {
                  width: inputProps.before.width,
                  height: inputProps.before.height,
                },
                after: {
                  width: inputProps.after.width,
                  height: inputProps.after.height,
                },
              },
            },
            project,
          },
          null,
          2,
        ) + "\n",
      );
      console.log(
        `Verified 15-second DemoPop film: ${(await stat(video)).size} bytes, AAC soundtrack.`,
      );
    }
  } finally {
    await cleanupBundle();
  }
}
