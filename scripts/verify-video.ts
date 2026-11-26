import { getVideoMetadata, RenderInternals } from "@remotion/renderer";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import assert from "node:assert/strict";
import {
  projectSchema,
  sampleProject,
  videoSettings,
} from "../src/shared/project";

const project = process.env.SAMPLE_OVERRIDE
  ? projectSchema.parse(
      JSON.parse(await readFile(process.env.SAMPLE_OVERRIDE, "utf8")),
    )
  : sampleProject;
const file = path.resolve(
  process.env.SAMPLE_OUTPUT || "out/demopop-sample.mp4",
);
const metadata = await getVideoMetadata(file);
const expected = videoSettings(project);
console.log(JSON.stringify(metadata, null, 2));
assert.equal(metadata.width, expected.width);
assert.equal(metadata.height, expected.height);
assert.equal(metadata.fps, expected.fps);
assert.equal(metadata.codec, "h264");
assert.equal(metadata.pixelFormat, "yuv420p");
assert.ok(Math.abs(metadata.durationInSeconds! - 15) < 0.1);
const qa = process.env.QA_DIR || "out/qa";
await mkdir(qa, { recursive: true });
await writeFile(
  path.join(qa, "metadata.json"),
  JSON.stringify(metadata, null, 2),
);
// Internal executable lookup is used only by this QA script and pinned to the exact Remotion version.
const ffmpeg = RenderInternals.getExecutablePath({
  type: "ffmpeg",
  indent: false,
  logLevel: "error",
  binariesDirectory: null,
});
const times = [1, 3, 5.7, 6.4, 8, 10.5, 13.5];
const tiles = [];
const tileHeight = 480;
const tileWidth = Math.round(tileHeight * (metadata.width / metadata.height));
for (const [index, time] of times.entries()) {
  const frame = path.resolve(qa, `frame-${time}.png`);
  execFileSync(ffmpeg, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    String(time),
    "-i",
    file,
    "-frames:v",
    "1",
    frame,
  ]);
  const tile = await sharp(frame)
    .resize(tileWidth, tileHeight)
    .png()
    .toBuffer();
  tiles.push({ input: tile, left: index * tileWidth, top: 0 });
}
await sharp({
  create: {
    width: times.length * tileWidth,
    height: tileHeight,
    channels: 3,
    background: "#ddd",
  },
})
  .composite(tiles)
  .png()
  .toFile(path.join(qa, "contact-sheet.png"));
console.log(
  "Video metadata passed. Representative frames and contact sheet:",
  qa,
);
