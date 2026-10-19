import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  renderStill,
  selectComposition,
  type makeCancelSignal,
} from "@remotion/renderer";
import { type VideoProps } from "../src/shared/project";
import { packageVariants } from "../src/shared/launch-kit";
import { zipFiles } from "../src/shared/zip";
import { getBundle, renderVideo } from "./render";
import { prepareVideoMedia } from "./private-clips";

export async function renderLaunchPackage(
  props: VideoProps,
  directory: string,
  onProgress: (progress: number) => void,
  cancelSignal?: ReturnType<typeof makeCancelSignal>["cancelSignal"],
) {
  const prepared = await prepareVideoMedia(props);
  try {
    return await renderPackage(
      prepared.props,
      directory,
      onProgress,
      cancelSignal,
    );
  } finally {
    await prepared.cleanup();
  }
}
async function renderPackage(
  props: VideoProps,
  directory: string,
  onProgress: (progress: number) => void,
  cancelSignal?: ReturnType<typeof makeCancelSignal>["cancelSignal"],
) {
  const files: { name: string; data: Buffer }[] = [];
  const variants = packageVariants(props.project);
  let size = 0;
  for (const [index, variant] of variants.entries()) {
    const name = `${variant.name}.mp4`,
      output = path.join(directory, name);
    await renderVideo(
      { ...props, project: variant.project },
      output,
      (progress) => onProgress(((index + progress) / variants.length) * 0.96),
      cancelSignal,
    );
    const data = await readFile(output);
    size += data.length;
    if (size > 98 * 1024 * 1024)
      throw new Error(
        "The launch package is too large. Use a shorter story or simpler media.",
      );
    files.push({ name, data });
  }
  const serveUrl = await getBundle();
  const thumbnailProps = { ...props, project: variants[0].project };
  const composition = await selectComposition({
    serveUrl,
    id: "Reveal",
    inputProps: thumbnailProps,
  });
  const thumbnail = path.join(directory, "thumbnail.png");
  await renderStill({
    serveUrl,
    composition,
    inputProps: thumbnailProps,
    output: thumbnail,
    frame: props.project.story
      ? Math.round(composition.durationInFrames * 0.3)
      : 145,
    imageFormat: "png",
    cancelSignal,
  });
  files.push({ name: "thumbnail.png", data: await readFile(thumbnail) });
  files.push({
    name: "manifest.json",
    data: Buffer.from(
      JSON.stringify(
        {
          version: 1,
          name: props.project.name,
          client: props.project.client || null,
          duration: props.project.story?.duration ?? 15,
          exports: variants.map((variant) => ({
            file: `${variant.name}.mp4`,
            format: variant.project.format,
            opening: variant.project.opening,
          })),
          project: props.project,
        },
        null,
        2,
      ),
    ),
  });
  const zip = zipFiles(files);
  if (zip.length > 100 * 1024 * 1024)
    throw new Error("The launch package exceeds 100 MB. Use a shorter story.");
  const output = path.join(directory, "launch-package.zip");
  await writeFile(output, zip);
  onProgress(0.98);
  return { output, preview: path.join(directory, "landscape-original.mp4") };
}
