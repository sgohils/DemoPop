import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  selectComposition,
  makeCancelSignal,
} from "@remotion/renderer";
import path from "node:path";
import type { VideoProps } from "../src/shared/project";
import { createBundleCache } from "./bundle-cache";
import { prepareVideoMedia } from "./private-clips";

const cache = createBundleCache((outDir) =>
  bundle({
    entryPoint: path.resolve("src/video/Root.tsx"),
    publicDir: path.resolve("public"),
    outDir,
  }),
);
export const getBundle = cache.get;
export const cleanupBundle = cache.cleanup;
export async function renderVideo(
  inputProps: VideoProps,
  outputLocation: string,
  onProgress: (progress: number) => void = () => {},
  cancel?: ReturnType<typeof makeCancelSignal>["cancelSignal"],
) {
  const prepared = await prepareVideoMedia(inputProps);
  try {
    inputProps = prepared.props;
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
  } finally {
    await prepared.cleanup();
  }
}
