import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  selectComposition,
  makeCancelSignal,
} from "@remotion/renderer";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import type { VideoProps } from "../src/shared/project";
let bundled: Promise<string> | undefined;
let bundleDir: string | undefined;
export function getBundle() {
  return (bundled ??= (async () => {
    bundleDir = await mkdtemp(path.resolve(".render-bundle-"));
    return bundle({
      entryPoint: path.resolve("src/video/Root.tsx"),
      publicDir: path.resolve("public"),
      outDir: bundleDir,
    });
  })());
}
export async function cleanupBundle() {
  if (bundleDir) {
    const target = path.resolve(bundleDir);
    if (!target.startsWith(path.resolve(".render-bundle-")))
      throw new Error("Unexpected bundle cleanup path");
    await rm(target, { recursive: true, force: true });
    bundleDir = undefined;
    bundled = undefined;
  }
}
export async function renderVideo(
  inputProps: VideoProps,
  outputLocation: string,
  onProgress: (progress: number) => void = () => {},
  cancel?: ReturnType<typeof makeCancelSignal>["cancelSignal"],
) {
  const serveUrl = await getBundle();
  const composition = await selectComposition({
    serveUrl,
    id: "Reveal",
    inputProps,
  });
  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    outputLocation,
    codec: "h264",
    pixelFormat: "yuv420p",
    colorSpace: "bt709",
    imageFormat: "png",
    crf: 18,
    concurrency: Number(process.env.RENDER_CONCURRENCY || 2),
    chromiumOptions: { enableMultiProcessOnLinux: true },
    onProgress: ({ progress }) => onProgress(progress),
    cancelSignal: cancel,
    timeoutInMilliseconds: 60000,
  });
}
