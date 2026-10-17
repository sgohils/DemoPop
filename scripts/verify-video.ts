import { getVideoMetadata, RenderInternals } from "@remotion/renderer";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import assert from "node:assert/strict";
const file = path.resolve(
  process.env.SAMPLE_OUTPUT || "out/demopop-sample.mp4",
);
const metadata = await getVideoMetadata(file);
console.log(JSON.stringify(metadata, null, 2));
assert.equal(metadata.width, 1080);
assert.equal(metadata.height, 1920);
assert.equal(metadata.fps, 30);
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
  const tile = await sharp(frame).resize(270, 480).png().toBuffer();
  tiles.push({ input: tile, left: index * 270, top: 0 });
}
await sharp({
  create: {
    width: times.length * 270,
    height: 480,
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
