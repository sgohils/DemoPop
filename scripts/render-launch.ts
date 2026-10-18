import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  renderStill,
  selectComposition,
  getVideoMetadata,
} from "@remotion/renderer";
import {
  launchProject,
  SAMPLE_ASSETS,
  videoSettings,
  type VideoProps,
} from "../src/shared/project";
import { getBundle, renderVideo, cleanupBundle } from "../worker/render";
const directory = "out/qa/launch";
const args = process.argv.slice(2);
if (
  args.some(
    (arg) =>
      ![
        "--stills-only",
        "--videos-only",
        "--format=vertical",
        "--format=landscape",
      ].includes(arg),
  ) ||
  (args.includes("--stills-only") && args.includes("--videos-only")) ||
  (args.includes("--format=vertical") && args.includes("--format=landscape"))
)
  throw new Error(
    "Usage: npm run render:launch [-- --stills-only | --videos-only] [--format=vertical | --format=landscape]",
  );
await mkdir(directory, { recursive: true });
const inputMedia = async (id: keyof typeof SAMPLE_ASSETS) => {
  const asset = SAMPLE_ASSETS[id];
  return {
    src: `data:image/png;base64,${(await readFile(`public/${asset.file}`)).toString("base64")}`,
    width: asset.width,
    height: asset.height,
  };
};
const media = {
  before: await inputMedia("sample-launch-before"),
  after: await inputMedia("sample-launch-after"),
  logo: null,
};
try {
  const serveUrl = await getBundle();
  const formats = args.includes("--format=vertical")
    ? (["vertical"] as const)
    : args.includes("--format=landscape")
      ? (["landscape"] as const)
      : (["vertical", "landscape"] as const);
  for (const format of formats) {
    const inputProps: VideoProps = {
      project: { ...launchProject, format },
      ...media,
    };
    const composition = await selectComposition({
      serveUrl,
      id: "Reveal",
      inputProps,
    });
    const tiles = [];
    const frames = [0, 24, 77, 145, 217, 302, 405, 449];
    const tileWidth = format === "vertical" ? 270 : 480;
    const tileHeight = format === "vertical" ? 480 : 270;
    if (!process.argv.includes("--videos-only")) {
      for (const [index, frame] of frames.entries()) {
        const file = path.resolve(directory, `${format}-${frame}.png`);
        await renderStill({
          serveUrl,
          composition,
          inputProps,
          frame,
          output: file,
          imageFormat: "png",
          timeoutInMilliseconds: 60000,
        });
        tiles.push({
          input: await sharp(file).resize(tileWidth, tileHeight).toBuffer(),
          left: (index % 4) * tileWidth,
          top: Math.floor(index / 4) * tileHeight,
        });
      }
      await sharp({
        create: {
          width: tileWidth * 4,
          height: tileHeight * 2,
          channels: 3,
          background: "#08090c",
        },
      })
        .composite(tiles)
        .png()
        .toFile(`${directory}/${format}-contact.png`);
      console.log(`Launch stills verified: ${format}`);
    }
    if (!process.argv.includes("--stills-only")) {
      const file = path.resolve(
        format === "vertical"
          ? "out/demopop-launch.mp4"
          : `${directory}/demopop-launch-landscape.mp4`,
      );
      let previous = -1;
      await renderVideo(inputProps, file, (progress) => {
        const percent = Math.floor(progress * 10) * 10;
        if (percent !== previous) {
          console.log(`Launch ${format}: ${percent}%`);
          previous = percent;
        }
      });
      const metadata = await getVideoMetadata(file),
        expected = videoSettings(inputProps.project);
      assert.equal(metadata.width, expected.width);
      assert.equal(metadata.height, expected.height);
      assert.equal(metadata.fps, 30);
      assert.equal(metadata.codec, "h264");
      assert.equal(metadata.pixelFormat, "yuv420p");
      assert.equal(metadata.audioCodec, "aac");
      assert.ok(Math.abs(metadata.durationInSeconds! - 15) < 0.1);
      await writeFile(
        `${directory}/${format}-metadata.json`,
        JSON.stringify(metadata, null, 2),
      );
      console.log(`Launch MP4 verified: ${format}, with AAC soundtrack`);
    }
  }
} finally {
  await cleanupBundle();
}
