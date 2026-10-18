import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getVideoMetadata, RenderInternals } from "@remotion/renderer";
import { LAUNCH_BEATS } from "../src/video/launch-motion";

// Inspect decoded deliverables, including every edit boundary, rather than
// judging only the pristine frames that went into the encoder.
const ffmpeg = RenderInternals.getExecutablePath({
  type: "ffmpeg",
  indent: false,
  logLevel: "error",
  binariesDirectory: null,
});
const directory = "out/qa/launch/encoded";
await mkdir(directory, { recursive: true });
for (const format of ["vertical", "landscape"] as const) {
  const file = path.resolve(
    format === "vertical"
      ? "out/demopop-launch.mp4"
      : "out/qa/launch/demopop-launch-landscape.mp4",
  );
  const metadata = await getVideoMetadata(file);
  assert.equal(metadata.width, format === "vertical" ? 1080 : 1920);
  assert.equal(metadata.height, format === "vertical" ? 1920 : 1080);
  assert.equal(metadata.fps, 30);
  assert.equal(metadata.codec, "h264");
  assert.equal(metadata.audioCodec, "aac");
  assert.equal(metadata.pixelFormat, "yuv420p");
  assert.ok(Math.abs(metadata.durationInSeconds! - 15) < 0.1);
  // A full decode catches errors anywhere in the file, not only near a poster.
  execFileSync(
    ffmpeg,
    [
      "-v",
      "error",
      "-xerror",
      "-i",
      file,
      "-c:v",
      "rawvideo",
      "-c:a",
      "pcm_s16le",
      "-f",
      "null",
      "-",
    ],
    {
      stdio: "pipe",
    },
  );
  for (const [sheet, frames, columns] of [
    ["first-half", Array.from({ length: 15 }, (_, i) => i * 15), 5],
    ["second-half", Array.from({ length: 15 }, (_, i) => 225 + i * 15), 5],
    [
      "edits",
      [
        LAUNCH_BEATS.before,
        LAUNCH_BEATS.reveal,
        LAUNCH_BEATS.highlight1,
        LAUNCH_BEATS.highlight2,
        LAUNCH_BEATS.closing,
      ].flatMap((frame) => [-3, -1, 0, 2, 8].map((offset) => frame + offset)),
      5,
    ],
  ] as const) {
    const tileWidth = format === "vertical" ? 216 : 384;
    const tileHeight = format === "vertical" ? 384 : 216;
    const tiles = [];
    for (const [index, frame] of frames.entries()) {
      const output = path.resolve(directory, `${format}-${frame}.png`);
      execFileSync(ffmpeg, [
        "-v",
        "error",
        "-y",
        "-ss",
        String(frame / 30),
        "-i",
        file,
        "-frames:v",
        "1",
        output,
      ]);
      const label = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="24"><rect width="100%" height="100%" fill="#1d2330"/><text x="8" y="16" font-family="Arial" font-size="12" fill="white">${(frame / 30).toFixed(2)}s · f${frame}</text></svg>`,
      );
      const tile = await sharp(output)
        .resize(tileWidth, tileHeight)
        .extend({
          top: 24,
          bottom: 0,
          left: 0,
          right: 0,
          background: "#1d2330",
        })
        .composite([{ input: label, left: 0, top: 0 }])
        .png()
        .toBuffer();
      tiles.push({
        input: tile,
        left: (index % columns) * tileWidth,
        top: Math.floor(index / columns) * (tileHeight + 24),
      });
    }
    await sharp({
      create: {
        width: columns * tileWidth,
        height: Math.ceil(frames.length / columns) * (tileHeight + 24),
        channels: 3,
        background: "#08090c",
      },
    })
      .composite(tiles)
      .png()
      .toFile(`${directory}/${format}-${sheet}.png`);
  }
  const wav = path.resolve(directory, `${format}.wav`);
  execFileSync(ffmpeg, [
    "-v",
    "error",
    "-y",
    "-i",
    file,
    "-vn",
    "-acodec",
    "pcm_s16le",
    "-ar",
    "48000",
    "-ac",
    "2",
    wav,
  ]);
  const audio = await readFile(wav);
  const dataChunk = audio.indexOf(Buffer.from("data"));
  assert.ok(dataChunk >= 0);
  const bytes = audio.readUInt32LE(dataChunk + 4);
  let peak = 0,
    energy = 0,
    clipped = 0;
  for (let index = dataChunk + 8; index < dataChunk + 8 + bytes; index += 2) {
    const value = audio.readInt16LE(index) / 32768;
    peak = Math.max(peak, Math.abs(value));
    energy += value ** 2;
    if (Math.abs(value) >= 32767 / 32768) clipped++;
  }
  assert.equal(clipped, 0);
  const analysis = {
    ...metadata,
    decodedAudio: {
      peakDbfs: 20 * Math.log10(peak),
      rmsDbfs: 20 * Math.log10(Math.sqrt(energy / (bytes / 2))),
      clippedSamples: clipped,
    },
  };
  await writeFile(
    `${directory}/${format}-qa.json`,
    JSON.stringify(analysis, null, 2),
  );
  console.log(
    `Decoded and inspected ${format}: full file, 55 sampled frames, AAC without clipping.`,
  );
}
