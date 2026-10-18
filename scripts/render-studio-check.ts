import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import {
  renderStill,
  selectComposition,
  getVideoMetadata,
} from "@remotion/renderer";
import sharp from "sharp";
import {
  TEMPLATES,
  sampleProject,
  videoSettings,
  type Media,
  type VideoProps,
} from "../src/shared/project";
import { getBundle, renderVideo, cleanupBundle } from "../worker/render";
const qa = "out/qa/studio";
const videosOnly = process.argv.includes("--videos-only");
const stillsOnly = process.argv.includes("--stills-only");
if (videosOnly && stillsOnly)
  throw new Error("Choose either --videos-only or --stills-only.");
await mkdir(qa, { recursive: true });
const image = async (name: string): Promise<Media> => ({
  src: `data:image/png;base64,${(await readFile(`public/sample/${name}.png`)).toString("base64")}`,
  width: 1440,
  height: 2000,
});
const inputs = {
  before: await image("before"),
  after: await image("after"),
  logo: null,
};
try {
  const serveUrl = await getBundle();
  if (!videosOnly) {
    for (const format of ["vertical", "landscape"] as const) {
      const tiles = [];
      for (const [index, template] of TEMPLATES.entries()) {
        const inputProps: VideoProps = {
          ...inputs,
          project: {
            ...sampleProject,
            format,
            template: template.id,
            font: "dm-sans",
          },
        };
        const composition = await selectComposition({
          serveUrl,
          id: "Reveal",
          inputProps,
        });
        const expected = videoSettings(inputProps.project);
        assert.equal(composition.width, expected.width);
        assert.equal(composition.height, expected.height);
        for (const [column, frame] of [90, 180, 335, 405].entries()) {
          const file = path.resolve(
            qa,
            `${format}-${template.id}-${frame}.png`,
          );
          await renderStill({
            serveUrl,
            composition,
            inputProps,
            frame,
            output: file,
            imageFormat: "png",
            timeoutInMilliseconds: 60000,
          });
          const w = format === "vertical" ? 270 : 480,
            h = format === "vertical" ? 480 : 270;
          tiles.push({
            input: await sharp(file).resize(w, h).toBuffer(),
            left: column * w,
            top: index * h,
          });
        }
        console.log(`Verified stills: ${format}/${template.id}`);
      }
      const w = format === "vertical" ? 270 : 480,
        h = format === "vertical" ? 480 : 270;
      await sharp({
        create: {
          width: 4 * w,
          height: 3 * h,
          channels: 3,
          background: "white",
        },
      })
        .composite(tiles)
        .png()
        .toFile(`${qa}/${format}-contact.png`);
    }
  }
  if (!stillsOnly)
    for (const [format, template] of [
      ["landscape", "slide"],
      ["vertical", "split"],
    ] as const) {
      const inputProps: VideoProps = {
        ...inputs,
        project: { ...sampleProject, format, template, font: "dm-sans" },
      };
      const file = path.resolve(qa, `${format}-${template}.mp4`);
      console.log(`Rendering MP4: ${format}/${template}`);
      let previousProgress = 0;
      await renderVideo(inputProps, file, (progress) => {
        const percent = Math.floor(progress * 100);
        if (percent >= previousProgress + 25) {
          console.log(`Rendering ${format}/${template}: ${percent}%`);
          previousProgress = percent;
        }
      });
      const metadata = await getVideoMetadata(file),
        expected = videoSettings(inputProps.project);
      assert.equal(metadata.width, expected.width);
      assert.equal(metadata.height, expected.height);
      assert.equal(metadata.fps, 30);
      assert.equal(metadata.codec, "h264");
      assert.equal(metadata.pixelFormat, "yuv420p");
      assert.equal(metadata.audioCodec, null);
      assert.ok(Math.abs(metadata.durationInSeconds! - 15) < 0.1);
      await writeFile(
        `${qa}/${format}-${template}-metadata.json`,
        JSON.stringify(metadata, null, 2),
      );
      console.log(`MP4 verified: ${format}/${template}`);
    }
} finally {
  await cleanupBundle();
}
