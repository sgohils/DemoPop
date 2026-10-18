import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderStill, selectComposition } from "@remotion/renderer";
import sharp from "sharp";
import {
  launchProject,
  projectSchema,
  SAMPLE_ASSETS,
  sampleProject,
  videoSettings,
  type Media,
  type ProjectInput,
  type VideoProps,
} from "../src/shared/project";
import { cleanupBundle, getBundle } from "../worker/render";

// A bounded visual regression matrix, separate from the sample film render.
// All media is local or generated here; this never requests a cloud render.
if (process.argv.length > 2)
  throw new Error("Usage: npx tsx scripts/render-launch-quality.ts");
const directory = "out/qa/launch-quality";
await mkdir(directory, { recursive: true });

const imageFile = async (key: keyof typeof SAMPLE_ASSETS): Promise<Media> => {
  const asset = SAMPLE_ASSETS[key];
  return {
    src: `data:image/png;base64,${(await readFile(`public/${asset.file}`)).toString("base64")}`,
    width: asset.width,
    height: asset.height,
  };
};
const svgMedia = async (
  svg: string,
  width: number,
  height: number,
): Promise<Media> => ({
  src: `data:image/png;base64,${(await sharp(Buffer.from(svg)).png().toBuffer()).toString("base64")}`,
  width,
  height,
});

function extremeSvg(width: number, height: number, after: boolean) {
  const tall = height > width;
  const background = after ? "#172036" : "#e8e6df";
  const foreground = after ? "#f8faff" : "#263344";
  const accent = after ? "#96efff" : "#768291";
  const panels = Array.from({ length: 8 }, (_, index) => {
    const x = tall ? 16 : index * 300 + 16;
    const y = tall ? index * 300 + 16 : 16;
    return `<g transform="translate(${x} ${y})"><rect width="288" height="288" rx="18" fill="${foreground}" opacity="${0.04 + index * 0.008}"/><text x="22" y="58" fill="${accent}" font-size="32" font-family="Arial,sans-serif" font-weight="700">${String(index + 1).padStart(2, "0")}</text><text x="22" y="102" fill="${foreground}" font-size="21" font-family="Arial,sans-serif">${after ? "New product" : "Earlier product"}</text><path d="M22 136H260M22 160H235M22 184H250" stroke="${foreground}" stroke-width="8" opacity=".22"/><rect x="22" y="218" width="142" height="38" rx="10" fill="${accent}"/></g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${background}"/>${panels}<rect x="2" y="2" width="${width - 4}" height="${height - 4}" fill="none" stroke="${accent}" stroke-width="4"/></svg>`;
}

const [
  formaBefore,
  formaAfter,
  orbitBefore,
  orbitAfter,
  tallBefore,
  tallAfter,
  wideBefore,
  wideAfter,
  logo,
] = await Promise.all([
  imageFile("sample-before"),
  imageFile("sample-after"),
  imageFile("sample-launch-before"),
  imageFile("sample-launch-after"),
  svgMedia(extremeSvg(320, 2400, false), 320, 2400),
  svgMedia(extremeSvg(320, 2400, true), 320, 2400),
  svgMedia(extremeSvg(2400, 320, false), 2400, 320),
  svgMedia(extremeSvg(2400, 320, true), 2400, 320),
  svgMedia(
    '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><circle cx="256" cy="256" r="220" fill="#182036"/><path d="M142 334 256 122 370 334H142Z" fill="none" stroke="#b7eaff" stroke-width="30" stroke-linejoin="round"/><circle cx="256" cy="272" r="36" fill="#ffffff"/></svg>',
    512,
    512,
  ),
]);

const maximumCopy = {
  name: "Extraordinary system for ambitious creator building tomorrow",
  opening:
    "Turn your truly ambitious ideas into something worth announcing today.",
  highlight1: "A clearer path from the first prompts to launch.",
  highlight2: "Everything you need to keep your work in motion.",
  cta: "Start building your next great idea.",
  url: "https://extraordinary-future.example/product/the-next-generation-launch-platform",
};
for (const [key, maximum] of Object.entries({
  name: 60,
  opening: 70,
  highlight1: 48,
  highlight2: 48,
  cta: 36,
  url: 80,
})) {
  assert.equal(
    maximumCopy[key as keyof typeof maximumCopy].length,
    maximum,
    `${key} must exercise the exact schema limit`,
  );
}

type QualityCase = {
  id: string;
  frames: readonly number[];
  props: VideoProps;
};
const cases: QualityCase[] = [
  {
    id: "portrait-upload-manrope-light",
    frames: [145, 217, 302],
    props: {
      project: {
        ...sampleProject,
        template: "launch",
        font: "manrope",
        color: "#FEFFFF",
      },
      before: formaBefore,
      after: formaAfter,
      logo: null,
    },
  },
  {
    id: "maximum-copy-logo-dm-sans-dark",
    frames: [24, 145, 217, 302, 405],
    props: {
      project: {
        ...launchProject,
        ...maximumCopy,
        color: "#10151F",
        logo: "00000000-0000-4000-8000-000000000001",
      },
      before: orbitBefore,
      after: orbitAfter,
      logo,
    },
  },
  {
    id: "extreme-tall-edge-zoom2-dark",
    frames: [217],
    props: {
      project: {
        ...launchProject,
        color: "#000001",
        beforeCrop: { x: 0, y: 0, zoom: 2 },
        afterCrop: { x: 1, y: 1, zoom: 2 },
      },
      before: tallBefore,
      after: tallAfter,
      logo: null,
    },
  },
  {
    id: "extreme-wide-edge-zoom2-light",
    frames: [302],
    props: {
      project: {
        ...launchProject,
        font: "manrope",
        color: "#FBFCFF",
        beforeCrop: { x: 1, y: 1, zoom: 2 },
        afterCrop: { x: 0, y: 0, zoom: 2 },
      },
      before: wideBefore,
      after: wideAfter,
      logo: null,
    },
  },
];

const manifest: Array<{
  case: string;
  frame: number;
  file: string;
  project: ProjectInput;
}> = [];
try {
  const serveUrl = await getBundle();
  for (const format of ["vertical", "landscape"] as const) {
    const tiles: Array<{ input: Buffer; left: number; top: number }> = [];
    const tileWidth = format === "vertical" ? 270 : 480;
    const tileHeight = format === "vertical" ? 480 : 270;
    const labelHeight = 32;
    for (const qualityCase of cases) {
      const inputProps: VideoProps = {
        ...qualityCase.props,
        project: projectSchema.parse({ ...qualityCase.props.project, format }),
      };
      const composition = await selectComposition({
        serveUrl,
        id: "Reveal",
        inputProps,
      });
      const expected = videoSettings(inputProps.project);
      assert.equal(composition.width, expected.width);
      assert.equal(composition.height, expected.height);
      for (const frame of qualityCase.frames) {
        const file = path.resolve(
          directory,
          `${format}-${qualityCase.id}-${frame}.png`,
        );
        await renderStill({
          serveUrl,
          composition,
          inputProps,
          frame,
          output: file,
          imageFormat: "png",
          timeoutInMilliseconds: 60_000,
        });
        const metadata = await sharp(file).metadata();
        assert.equal(metadata.width, expected.width);
        assert.equal(metadata.height, expected.height);
        const label = Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#1d2330"/><text x="8" y="13" fill="#ffffff" font-family="Arial,sans-serif" font-size="10">${qualityCase.id}</text><text x="8" y="26" fill="#b7bfd0" font-family="Arial,sans-serif" font-size="10">${format} / frame ${frame}</text></svg>`,
        );
        const tile = await sharp(file)
          .resize(tileWidth, tileHeight)
          .extend({
            top: labelHeight,
            bottom: 0,
            left: 0,
            right: 0,
            background: "#1d2330",
          })
          .composite([{ input: label, left: 0, top: 0 }])
          .png()
          .toBuffer();
        const index = tiles.length;
        tiles.push({
          input: tile,
          left: (index % 5) * tileWidth,
          top: Math.floor(index / 5) * (tileHeight + labelHeight),
        });
        manifest.push({
          case: qualityCase.id,
          frame,
          file: path.relative(process.cwd(), file),
          project: inputProps.project,
        });
      }
      console.log(`Quality stills: ${format}/${qualityCase.id}`);
    }
    assert.equal(tiles.length, 10);
    await sharp({
      create: {
        width: tileWidth * 5,
        height: (tileHeight + labelHeight) * 2,
        channels: 3,
        background: "#08090c",
      },
    })
      .composite(tiles)
      .png()
      .toFile(`${directory}/${format}-contact.png`);
  }
  assert.equal(manifest.length, 20);
  await writeFile(
    `${directory}/manifest.json`,
    JSON.stringify({ stills: manifest }, null, 2),
  );
  console.log("Launch quality matrix complete: 20 stills across both formats.");
} finally {
  await cleanupBundle();
}
