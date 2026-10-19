import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  frameLinkMobileCapture,
  linkMobileFrameGeometry,
} from "../src/server/link-video-framing";
import { coverGeometry, defaultCrop } from "../src/shared/project";
import { storyViewport } from "../src/shared/launch-kit";

test("automatic mobile capture framing keeps the whole screen visible in every story format", async () => {
  const source = { width: 390, height: 844 };
  const frame = linkMobileFrameGeometry(source);
  for (const format of ["landscape", "vertical", "square"] as const) {
    const viewport = storyViewport(format);
    for (const zoom of [1, 1.025]) {
      const geometry = coverGeometry(
        frame,
        defaultCrop,
        viewport.width,
        viewport.height,
        zoom,
      );
      const scale = geometry.width / frame.width;
      const left = geometry.left + frame.screen.left * scale;
      const top = geometry.top + frame.screen.top * scale;
      assert.ok(
        left >= 0 && top >= 0,
        `${format}: screen begins inside the card`,
      );
      assert.ok(left + frame.screen.width * scale <= viewport.width);
      assert.ok(top + frame.screen.height * scale <= viewport.height);
    }
  }
  const input = await sharp({
    create: { ...source, channels: 3, background: "#ffffff" },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: 390,
            height: 200,
            channels: 3,
            background: "#ff0000",
          },
        })
          .png()
          .toBuffer(),
        top: 0,
        left: 0,
      },
      {
        input: await sharp({
          create: {
            width: 390,
            height: 200,
            channels: 3,
            background: "#0000ff",
          },
        })
          .png()
          .toBuffer(),
        top: 644,
        left: 0,
      },
    ])
    .webp({ lossless: true })
    .toBuffer();
  const output = await frameLinkMobileCapture({ data: input, ...source });
  assert.equal(output.width / output.height, 16 / 9);
  const pixel = async (top: number) => [
    ...(await sharp(output.data)
      .removeAlpha()
      .extract({ left: 800, top, width: 1, height: 1 })
      .raw()
      .toBuffer()),
  ];
  assert.deepEqual(await pixel(frame.screen.top + 40), [255, 0, 0]);
  assert.deepEqual(
    await pixel(frame.screen.top + frame.screen.height - 40),
    [0, 0, 255],
  );
});
