import { test } from "node:test";
import assert from "node:assert/strict";
import { coverGeometry, resolveStoryMedia } from "../src/shared/project";
import {
  contrastRatio,
  highlightGeometry,
  highlightMotion,
  mixColor,
  readableTextColor,
  REVEAL_BACKGROUND,
  revealColors,
} from "../src/shared/video-style";
import { fitStudioText, splitPanelGeometry } from "../src/video/studio-layout";

test("story scenes never silently render a different screenshot for a missing asset", () => {
  const before = { src: "before.png", width: 100, height: 100 };
  const after = { src: "after.png", width: 200, height: 100 };
  const uploaded = {
    src: "clip.mp4",
    width: 640,
    height: 360,
    kind: "video" as const,
  };
  const sceneMedia = { "clip-id": uploaded };

  assert.equal(
    resolveStoryMedia(
      "before-id",
      "before-id",
      "after-id",
      before,
      after,
      sceneMedia,
    ),
    before,
  );
  assert.equal(
    resolveStoryMedia(
      "after-id",
      "before-id",
      "after-id",
      before,
      after,
      sceneMedia,
    ),
    after,
  );
  assert.equal(
    resolveStoryMedia(
      "clip-id",
      "before-id",
      "after-id",
      before,
      after,
      sceneMedia,
    ),
    uploaded,
  );
  assert.equal(
    resolveStoryMedia(
      "missing-id",
      "before-id",
      "after-id",
      before,
      after,
      sceneMedia,
    ),
    null,
  );
});

test("brand text stays readable for light, dark and saturated colors", () => {
  const colors = new Set([
    "#FFFFFF",
    "#000000",
    "#365DDB",
    "#808080",
    "#777777",
    "#FFFF00",
    "#FF00FF",
    "#00FFFF",
    "#FF0000",
    "#00FF00",
    "#0000FF",
  ]);
  for (const r of [0, 51, 102, 153, 204, 255])
    for (const g of [0, 51, 102, 153, 204, 255])
      for (const b of [0, 51, 102, 153, 204, 255])
        colors.add(
          `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`,
        );

  for (const brand of colors) {
    const style = revealColors(brand);
    for (const [foreground, background] of [
      [style.outroText, brand],
      [style.accent, REVEAL_BACKGROUND],
      [style.badgeText, style.badgeBackground],
    ])
      assert.ok(
        contrastRatio(foreground, background) >= 4.5,
        `${foreground} must be readable on ${background} for brand ${brand}`,
      );
    for (const opacity of [0.51, 0.65, 0.8, 1]) {
      const backdrop = mixColor(REVEAL_BACKGROUND, brand, opacity);
      assert.ok(contrastRatio(readableTextColor(backdrop), backdrop) >= 4.5);
    }
  }
  const sample = revealColors("#365DDB");
  assert.equal(sample.accent, "#365DDB");
  assert.equal(sample.outroText, "#ffffff");
});

test("highlights have two smooth movement beats aligned with their captions", () => {
  assert.equal(highlightMotion(209).zoom, 1);
  assert.equal(highlightMotion(210).zoom, 1);
  assert.ok(highlightMotion(230).zoom > 1);
  assert.equal(highlightMotion(255).zoom, 1.025);
  assert.deepEqual(highlightMotion(255), highlightMotion(285));
  assert.ok(highlightMotion(310).zoom > highlightMotion(285).zoom);
  assert.ok(highlightMotion(310).anchorX > highlightMotion(285).anchorX);
  assert.ok(highlightMotion(310).anchorY > highlightMotion(285).anchorY);
  assert.equal(highlightMotion(335).zoom, 1.045);
  assert.deepEqual(highlightMotion(335), highlightMotion(449));
  for (const boundary of [210, 255, 285, 335]) {
    assert.ok(
      Math.abs(
        highlightMotion(boundary + 0.001).zoom -
          highlightMotion(boundary - 0.001).zoom,
      ) < 0.000001,
    );
  }
});

test("both movements remain inside the selected crop at every frame", () => {
  const width = 936;
  const height = 1050;
  const epsilon = 1e-9;
  for (const media of [
    { width: 800, height: 12000 },
    { width: 4000, height: 100 },
    { width: 1440, height: 2000 },
    { width: 936, height: 1050 },
  ])
    for (const x of [0, 0.5, 1])
      for (const y of [0, 0.5, 1])
        for (const zoom of [1, 2]) {
          const crop = { x, y, zoom };
          const base = coverGeometry(media, crop, width, height);
          for (let frame = 0; frame < 450; frame++) {
            const current = highlightGeometry(
              media,
              crop,
              width,
              height,
              frame,
            );
            assert.ok(current.left <= epsilon && current.top <= epsilon);
            assert.ok(current.left + current.width >= width - epsilon);
            assert.ok(current.top + current.height >= height - epsilon);
            assert.ok(
              -current.left / current.width >=
                -base.left / base.width - epsilon,
            );
            assert.ok(
              -current.top / current.height >=
                -base.top / base.height - epsilon,
            );
            assert.ok(
              (width - current.left) / current.width <=
                (width - base.left) / base.width + epsilon,
            );
            assert.ok(
              (height - current.top) / current.height <=
                (height - base.top) / base.height + epsilon,
            );
          }
        }
});

test("studio comparison expands continuously without gaps or a layout swap", () => {
  for (const width of [936, 1136]) {
    assert.deepEqual(splitPanelGeometry(width, 0), {
      left: width / 2,
      width: width / 2,
      beforeWidth: width / 2,
    });
    assert.deepEqual(splitPanelGeometry(width, 1), {
      left: 0,
      width,
      beforeWidth: 0,
    });
    let previous = width / 2;
    for (let frame = 0; frame <= 60; frame++) {
      const panel = splitPanelGeometry(width, frame / 60);
      assert.equal(panel.left, panel.beforeWidth);
      assert.equal(panel.left + panel.width, width);
      assert.ok(panel.width >= previous);
      assert.ok(panel.width - previous <= width / 120 + 0.000001);
      previous = panel.width;
    }
    const nearEnd = splitPanelGeometry(width, 1 - 1e-9);
    assert.ok(Math.abs(nearEnd.width - width) < 0.000001);
  }
});

test("studio copy fits its allotted height without dropping long user text", () => {
  for (const [text, width, height, size, lineHeight] of [
    ["W".repeat(70), 936, 860, 100, 1.08],
    ["W".repeat(60), 1500, 320, 116, 1.08],
    ["W".repeat(48), 520, 245, 46, 1.2],
    ["站".repeat(48), 936, 220, 56, 1.2],
    ["https://" + "m".repeat(72), 780, 140, 38, 1.2],
    [Array(35).fill("A").join("\n"), 936, 860, 100, 1.08],
  ] as const) {
    const fit = fitStudioText(text, width, height, size, lineHeight);
    assert.ok(fit.fontSize >= 28, "allowed copy must stay legible");
    assert.ok(
      fit.text.split("\n").length * fit.fontSize * lineHeight <= height,
    );
    assert.equal(fit.text.replace(/\s/g, ""), text.replace(/\s/g, ""));
  }
  const opening = "A fresh perspective.\nA better first impression.";
  assert.ok(fitStudioText(opening, 1570, 540, 112).text.includes("\n"));
});
