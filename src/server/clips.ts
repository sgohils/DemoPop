import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getVideoMetadata, RenderInternals } from "@remotion/renderer";
import { MAX_UPLOAD } from "../shared/project";

export async function prepareClip(bytes: Buffer) {
  if (
    !bytes.length ||
    bytes.length > MAX_UPLOAD ||
    bytes.toString("ascii", 4, 8) !== "ftyp"
  )
    throw new Error("Choose an MP4 clip smaller than 10 MB.");
  const prefix = path.join(os.tmpdir(), "demopop-clip-");
  const directory = await mkdtemp(prefix);
  try {
    const input = path.join(directory, "input.mp4"),
      output = path.join(directory, "clip.mp4");
    await writeFile(input, bytes);
    const metadata = await getVideoMetadata(input);
    if (
      metadata.codec !== "h264" ||
      !metadata.durationInSeconds ||
      metadata.durationInSeconds > 30 ||
      metadata.durationInSeconds < 0.1 ||
      !metadata.fps ||
      metadata.fps > 60 ||
      Math.min(metadata.width, metadata.height) < 64 ||
      Math.max(metadata.width, metadata.height) > 4096 ||
      metadata.pixelFormat !== "yuv420p"
    )
      throw new Error(
        "Use a 0.1–30 second H.264 MP4, yuv420p, up to 4096 pixels and 60 fps.",
      );
    const ffmpeg = RenderInternals.getExecutablePath({
      type: "ffmpeg",
      binariesDirectory: null,
      indent: false,
      logLevel: "error",
    });
    // Decode every frame before accepting the clip; metadata alone is insufficient.
    await promisify(execFile)(
      ffmpeg,
      [
        "-v",
        "error",
        "-xerror",
        "-i",
        input,
        "-map",
        "0:v:0",
        "-an",
        "-c:v",
        "rawvideo",
        "-f",
        "null",
        "-",
      ],
      { timeout: 45000, maxBuffer: 1024 * 1024, windowsHide: true },
    );
    // Keep the verified H.264 picture stream; remove sound and source metadata.
    await promisify(execFile)(
      ffmpeg,
      [
        "-v",
        "error",
        "-y",
        "-i",
        input,
        "-map",
        "0:v:0",
        "-c:v",
        "copy",
        "-an",
        "-map_metadata",
        "-1",
        "-movflags",
        "+faststart",
        output,
      ],
      { timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true },
    );
    const data = await readFile(output);
    if (data.length > 15 * 1024 * 1024)
      throw new Error("The prepared clip exceeds the storage limit.");
    return {
      data,
      width: metadata.width,
      height: metadata.height,
      duration: metadata.durationInSeconds,
      kind: "video" as const,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      /^(Choose|Use |The prepared)/.test(error.message)
    )
      throw error;
    throw new Error(
      "This clip could not be decoded. Use a valid H.264 MP4 up to 30 seconds.",
      { cause: error },
    );
  } finally {
    const target = path.resolve(directory);
    if (!target.startsWith(path.resolve(prefix)))
      throw new Error("Invalid clip cleanup path");
    await rm(target, { recursive: true, force: true });
  }
}
