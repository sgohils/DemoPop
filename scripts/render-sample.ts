import "dotenv/config";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  sampleProject,
  projectSchema,
  type Media,
} from "../src/shared/project";
import { renderVideo, cleanupBundle } from "../worker/render";
const project = process.env.SAMPLE_OVERRIDE
  ? projectSchema.parse(
      JSON.parse(await readFile(process.env.SAMPLE_OVERRIDE, "utf8")),
    )
  : sampleProject;
const media = async (name: string): Promise<Media> => ({
  src: `data:image/png;base64,${(await readFile(`public/sample/${name}.png`)).toString("base64")}`,
  width: 1440,
  height: 2000,
});
await mkdir("out", { recursive: true });
let last = -1;
try {
  await renderVideo(
    {
      project,
      before: await media("before"),
      after: await media("after"),
      logo: null,
    },
    path.resolve(process.env.SAMPLE_OUTPUT || "out/demopop-sample.mp4"),
    (progress) => {
      const percent = Math.floor((progress * 100) / 10) * 10;
      if (percent !== last) {
        console.log(`Rendering ${percent}%`);
        last = percent;
      }
    },
  );
} finally {
  await cleanupBundle();
}
console.log(
  "MP4 complete. Run npm run verify:video to inspect metadata and frames.",
);
