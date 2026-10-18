import { chromium } from "@playwright/test";
import { ensureBrowser } from "@remotion/renderer";
import { readFile, writeFile } from "node:fs/promises";

// Commit real glyph advances so layout stays synchronous and deterministic in
// the player, server-side tests, and Remotion's parallel render processes.
const installed = await ensureBrowser();
if (!("path" in installed))
  throw new Error("The video browser is unavailable.");
const browser = await chromium.launch({
  headless: true,
  executablePath: installed.path,
});
try {
  const page = await browser.newPage();
  const metrics = {};
  for (const [id, file, kind] of [
    ["dm-sans", "public/fonts/dm-sans.ttf", "truetype"],
    ["manrope", "public/fonts/manrope.woff2", "woff2"],
  ]) {
    const data = (await readFile(file)).toString("base64");
    metrics[id] = await page.evaluate(
      async ({ id, data, kind }) => {
        const face = new FontFace(id, `url(data:font/${kind};base64,${data})`, {
          weight: "100 1000",
        });
        await face.load();
        document.fonts.add(face);
        const context = document.createElement("canvas").getContext("2d");
        context.font = `750 1000px ${id}`;
        const result = {};
        for (const [from, to] of [
          [32, 255],
          [0x2000, 0x206f],
        ]) {
          for (let point = from; point <= to; point++) {
            const character = String.fromCodePoint(point);
            result[character] =
              Math.round(context.measureText(character).width) / 1000;
          }
        }
        return result;
      },
      { id, data, kind },
    );
  }
  await writeFile(
    "src/video/font-metrics.json",
    JSON.stringify(metrics, null, 2) + "\n",
  );
  console.log("Measured bundled DM Sans and Manrope at weight 750.");
} finally {
  await browser.close();
}
