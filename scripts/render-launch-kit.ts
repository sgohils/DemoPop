import path from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  launchProject,
  SAMPLE_ASSETS,
  type Media,
  type Story,
  type VideoProps,
} from "../src/shared/project";
import { starterStory } from "../src/shared/launch-kit";
import { renderLaunchPackage } from "../worker/launch-package";
import { cleanupBundle } from "../worker/render";
const args = process.argv.slice(2);
if (args.length > 1 || args.some((arg) => !/^--duration=(15|30|60)$/.test(arg)))
  throw new Error("Usage: npm run render:kit [-- --duration=15|30|60]");
const directory = path.resolve("out/demopop-launch-kit");
await mkdir(directory, { recursive: true });
const media = async (id: keyof typeof SAMPLE_ASSETS): Promise<Media> => {
  const asset = SAMPLE_ASSETS[id];
  return {
    src: `data:image/png;base64,${(await readFile(`public/${asset.file}`)).toString("base64")}`,
    width: asset.width,
    height: asset.height,
  };
};
const story = starterStory(launchProject, [
  randomUUID(),
  randomUUID(),
  randomUUID(),
]);
story.duration = Number(args[0]?.split("=")[1] || 15) as Story["duration"];
story.scenes[1].crop = { x: 0.7, y: 0.5, zoom: 1.5 };
story.scenes[2].crop = { x: 1, y: 1, zoom: 1.7 };
const props: VideoProps = {
  project: { ...launchProject, story },
  before: await media("sample-launch-before"),
  after: await media("sample-launch-after"),
  logo: null,
};
let previous = -1;
try {
  const result = await renderLaunchPackage(props, directory, (progress) => {
    const percent = Math.floor(progress * 20) * 5;
    if (percent !== previous) {
      console.log(`Launch package: ${percent}%`);
      previous = percent;
    }
  });
  console.log(`Ready: ${result.output}`);
} finally {
  await cleanupBundle();
}
