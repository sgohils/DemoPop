import path from "node:path";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { RenderInternals, getVideoMetadata } from "@remotion/renderer";
import { PACKAGE_FORMATS, PACKAGE_HOOKS } from "../src/shared/launch-kit";

const inputArg = process.argv.slice(2);
if (inputArg.length > 1 || inputArg.some((arg) => !arg.startsWith("--input=")))
  throw new Error(
    "Usage: npm run assets:campaign [-- --input=out/demopop-launch-kit]",
  );
const input = path.resolve(inputArg[0]?.slice(8) || "out/demopop-launch-kit");
const output = path.resolve("public/films/campaign");
await mkdir(output, { recursive: true });
const ffmpeg = RenderInternals.getExecutablePath({
  type: "ffmpeg",
  indent: false,
  logLevel: "error",
  binariesDirectory: null,
});
const files = [];
for (const format of PACKAGE_FORMATS) {
  for (const hook of PACKAGE_HOOKS) {
    const name = `${format}-${hook}`;
    const source = path.join(input, `${name}.mp4`);
    const destination = path.join(output, `${name}.mp4`);
    const scale =
      format === "landscape"
        ? "960:540"
        : format === "square"
          ? "640:640"
          : "406:720";
    execFileSync(
      ffmpeg,
      [
        "-v",
        "error",
        "-y",
        "-i",
        source,
        "-vf",
        `scale=${scale}`,
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "27",
        "-pix_fmt",
        "yuv420p",
        "-colorspace",
        "bt709",
        "-color_primaries",
        "bt709",
        "-color_trc",
        "bt709",
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-movflags",
        "+faststart",
        destination,
      ],
      { stdio: "pipe" },
    );
    const frame = execFileSync(
      ffmpeg,
      [
        "-v",
        "error",
        "-ss",
        "0.83",
        "-i",
        destination,
        "-frames:v",
        "1",
        "-f",
        "image2pipe",
        "-c:v",
        "png",
        "-",
      ],
      { maxBuffer: 8 * 1024 * 1024 },
    );
    await sharp(frame)
      .webp({ quality: 82 })
      .toFile(path.join(output, `${name}.webp`));
    const metadata = await getVideoMetadata(destination);
    files.push({
      name,
      bytes: (await readFile(destination)).length,
      width: metadata.width,
      height: metadata.height,
      duration: metadata.durationInSeconds,
      codec: metadata.codec,
    });
    console.log(`Prepared ${name}`);
  }
}
await writeFile(
  path.join(output, "metadata.json"),
  JSON.stringify(
    {
      description:
        "Web previews of a real DemoPop launch package. Orbit is a fictional sample product. Full exports retain their original 1080p dimensions.",
      source: path.relative(process.cwd(), input).replaceAll("\\", "/"),
      files,
    },
    null,
    2,
  ) + "\n",
);
