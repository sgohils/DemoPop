import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ensureBrowser,
  openBrowser,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import sharp from "sharp";
import {
  launchProject,
  projectSchema,
  SAMPLE_ASSETS,
  videoSettings,
  type Media,
  type ProjectInput,
  type VideoProps,
} from "../src/shared/project";
import {
  PACKAGE_FORMATS,
  starterStory,
  storyTimeline,
} from "../src/shared/launch-kit";
import { cleanupBundle, getBundle } from "../worker/render";

// Local renderer proof: no account, queue, website capture, or external media.
if (process.argv.length > 2)
  throw new Error("Usage: npx tsx scripts/inspect-format-framing.ts");
const directory = path.resolve("out/qa/package-preview");
const scale = 0.5;
const override = { x: 1, y: 1, zoom: 1.8 };
const sha256 = (value: Buffer) =>
  createHash("sha256").update(value).digest("hex");
const imageFile = async (key: keyof typeof SAMPLE_ASSETS): Promise<Media> => {
  const asset = SAMPLE_ASSETS[key];
  return {
    src: `data:image/png;base64,${(await readFile(path.resolve("public", asset.file))).toString("base64")}`,
    width: asset.width,
    height: asset.height,
  };
};
const story = starterStory(launchProject, [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
]);
const [before, after] = await Promise.all([
  imageFile("sample-launch-before"),
  imageFile("sample-launch-after"),
]);
const results: {
  format: ProjectInput["format"];
  frame: number;
  inactiveFormat: ProjectInput["format"];
  activeOverrideChangesOutput: boolean;
  inactiveOverridePreservesOutput: boolean;
  renders: {
    variant: string;
    file: string;
    width: number;
    height: number;
    bytes: number;
    sha256: string;
    pixelSha256: string;
  }[];
}[] = [];
let browser: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  await mkdir(directory, { recursive: true });
  const executable = await ensureBrowser({
    onBrowserDownload: () => {
      throw new Error(
        "Install the repository's Remotion browser before running this offline check.",
      );
    },
  });
  if (!("path" in executable)) throw new Error("Chromium is unavailable.");
  browser = await openBrowser("chrome", { browserExecutable: executable.path });
  const serveUrl = await getBundle();
  for (const format of PACKAGE_FORMATS) {
    const project = projectSchema.parse({
      ...launchProject,
      format,
      sound: "off",
      story: structuredClone(story),
    });
    const inputProps: VideoProps = { project, before, after, logo: null };
    const expected = videoSettings(project);
    const frame = storyTimeline(project).beats[0].preview;
    const inactiveFormat = PACKAGE_FORMATS.find((value) => value !== format)!;
    const renders = [];
    const buffers: { png: Buffer; pixels: Buffer }[] = [];
    for (const variant of [
      "shared",
      "active-override",
      "inactive-override",
    ] as const) {
      const candidate = structuredClone(project);
      if (variant !== "shared")
        candidate.story!.scenes[0].formatCrops = {
          [variant === "active-override" ? format : inactiveFormat]: override,
        };
      const candidateProps: VideoProps = { ...inputProps, project: candidate };
      // selectComposition resolves projectSchema and supplies composition.props;
      // resolve every candidate so renderStill receives its exact override.
      const composition = await selectComposition({
        serveUrl,
        id: "Reveal",
        inputProps: candidateProps,
        puppeteerInstance: browser,
      });
      assert.equal(composition.width, expected.width);
      assert.equal(composition.height, expected.height);
      const file = `${format}-${variant}.png`;
      const output = path.join(directory, file);
      await renderStill({
        serveUrl,
        composition,
        inputProps: candidateProps,
        frame,
        output,
        imageFormat: "png",
        scale,
        puppeteerInstance: browser,
        timeoutInMilliseconds: 60_000,
      });
      const png = await readFile(output);
      const { data: pixels, info } = await sharp(png)
        .raw()
        .toBuffer({ resolveWithObject: true });
      assert.equal(info.width, expected.width * scale);
      assert.equal(info.height, expected.height * scale);
      buffers.push({ png, pixels });
      renders.push({
        variant,
        file,
        width: info.width,
        height: info.height,
        bytes: png.length,
        sha256: sha256(png),
        pixelSha256: sha256(pixels),
      });
    }
    results.push({
      format,
      frame,
      inactiveFormat,
      activeOverrideChangesOutput:
        !buffers[0].png.equals(buffers[1].png) &&
        !buffers[0].pixels.equals(buffers[1].pixels),
      inactiveOverridePreservesOutput:
        buffers[0].png.equals(buffers[2].png) &&
        buffers[0].pixels.equals(buffers[2].pixels),
      renders,
    });
  }
  await writeFile(
    path.join(directory, "format-framing.json"),
    `${JSON.stringify({ scale, override, results }, null, 2)}\n`,
  );
  for (const result of results) {
    assert.ok(
      result.activeOverrideChangesOutput,
      `${result.format}: active crop did not change rendered pixels`,
    );
    assert.ok(
      result.inactiveOverridePreservesOutput,
      `${result.format}: another format's crop changed the rendered output`,
    );
  }
  console.log(JSON.stringify({ passed: results.length, directory }));
} finally {
  try {
    await browser?.close({ silent: true });
  } finally {
    await cleanupBundle();
  }
}
