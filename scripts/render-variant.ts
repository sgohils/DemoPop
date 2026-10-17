import { renderVideo, cleanupBundle } from "../worker/render";
import { sampleProject, projectSchema } from "../src/shared/project";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
await mkdir("out/qa/variant", { recursive: true });
const project = projectSchema.parse({
  ...sampleProject,
  name: "Northfield architecture and interiors — a thoughtful new start".slice(
    0,
    60,
  ),
  opening:
    "A thoughtful new chapter for the spaces and places we call our own home.".slice(
      0,
      70,
    ),
  highlight1: "Considered design with room for a fresh direction.".slice(0, 48),
  highlight2: "A welcoming first impression, beautifully formed.".slice(0, 48),
  url: "northfield.example/architecture/interiors/a-thoughtful-new-chapter-for-our-community".slice(
    0,
    80,
  ),
  color: "#8A4836",
  beforeCrop: { x: 1, y: 1, zoom: 1.6 },
  afterCrop: { x: 0, y: 1, zoom: 1.2 },
});
const before = await readFile("public/sample/before.png");
// A very tall, unequal after-image exercises the same cover math at the extreme lower crop.
const originalAfter = await readFile("public/sample/after.png");
const after = await sharp({
  create: { width: 1440, height: 10000, channels: 3, background: "#f8f6ef" },
})
  .composite(
    Array.from({ length: 5 }, (_, i) => ({
      input: originalAfter,
      left: 0,
      top: i * 2000,
    })),
  )
  .png()
  .toBuffer();
await writeFile(
  "out/qa/variant/project.json",
  JSON.stringify(project, null, 2),
);
try {
  await renderVideo(
    {
      project,
      before: {
        src: `data:image/png;base64,${before.toString("base64")}`,
        width: 1440,
        height: 2000,
      },
      after: {
        src: `data:image/png;base64,${after.toString("base64")}`,
        width: 1440,
        height: 10000,
      },
      logo: null,
    },
    path.resolve("out/qa/variant/edited.mp4"),
    (p) => {
      if (p === 1) console.log("Edited video rendered.");
    },
  );
} finally {
  await cleanupBundle();
}
