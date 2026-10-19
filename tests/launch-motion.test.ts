import assert from "node:assert/strict";
import test from "node:test";
import {
  coverGeometry,
  defaultCrop,
  type ProjectInput,
} from "../src/shared/project";
import { contrastRatio } from "../src/shared/video-style";
import {
  launchAccent,
  launchAfterGeometry,
  fitLaunchText,
  launchProgress,
  launchShotGeometry,
  launchWindow,
  launchTextWidth,
} from "../src/video/launch-motion";

test("launch motion holds exactly at scene boundaries", () => {
  assert.equal(launchProgress(-20, 10, 30), 0);
  assert.equal(launchProgress(30, 10, 30), 1);
  assert.equal(launchProgress(90, 10, 30), 1);
  assert.equal(launchWindow(9, 10, 80), 0);
  assert.equal(launchWindow(35, 10, 80), 1);
  assert.equal(launchWindow(80, 10, 80), 0);
});

test("legacy and automatic framing retain the original shots for every source aspect", () => {
  for (const media of [
    { width: 1440, height: 2000 },
    { width: 2560, height: 1760 },
    { width: 3000, height: 320 },
  ]) {
    const aspect = media.width / media.height;
    const detailWeight = aspect < 1 ? 0 : aspect > 2.4 ? 0.2 : 1;
    const project = { afterCrop: { x: 0.2, y: 0.8, zoom: 1.3 } };
    for (const frame of [0, 105, 171, 182, 217, 255, 265, 302, 354, 449]) {
      const expected = launchShotGeometry(
        media,
        project.afterCrop,
        952,
        604,
        1 + 0.8 * detailWeight,
        0.63,
        0.68,
      );
      for (const optional of [
        {},
        { highlight1Crop: null, highlight2Crop: null },
      ]) {
        assert.deepEqual(
          launchAfterGeometry(
            media,
            { ...project, ...optional },
            952,
            604,
            frame,
            1.8,
            0.63,
            0.68,
          ),
          expected,
        );
      }
    }
  }
});

test("independent highlights can reach features outside the main crop without added automatic zoom", () => {
  const media = { width: 1440, height: 6000 };
  const project = {
    afterCrop: { x: 0, y: 0, zoom: 2 },
    highlight1Crop: { x: 1, y: 0.5, zoom: 1.2 },
    highlight2Crop: { x: 0, y: 1, zoom: 1.7 },
  };
  for (const [width, height] of [
    [946, 594],
    [1040, 770],
  ]) {
    for (const frame of [193, 217, 250, 255])
      assert.deepEqual(
        launchAfterGeometry(
          media,
          project,
          width,
          height,
          frame,
          1.9,
          0.9,
          0.9,
        ),
        coverGeometry(media, project.highlight1Crop, width, height),
      );
    for (const frame of [275, 302, 346, 354, 449]) {
      const current = launchAfterGeometry(
        media,
        project,
        width,
        height,
        frame,
        2.03,
      );
      assert.deepEqual(
        current,
        coverGeometry(media, project.highlight2Crop, width, height),
      );
      const base = coverGeometry(media, project.afterCrop, width, height);
      assert.ok(
        -current.top / current.height > (height - base.top) / base.height,
        "second shot must reach content beyond the main viewport",
      );
    }
  }
});

test("custom shot handoffs are continuous and cover the viewport throughout the film", () => {
  const first = { x: 0, y: 0, zoom: 1 };
  const second = { x: 1, y: 1, zoom: 2 };
  for (const media of [
    { width: 1440, height: 12000 },
    { width: 12000, height: 1440 },
    { width: 2560, height: 1760 },
  ])
    for (const [width, height] of [
      [946, 594],
      [946, 810],
      [1120, 690],
      [1040, 770],
    ])
      for (const [highlight1Crop, highlight2Crop] of [
        [first, second],
        [first, null],
        [null, second],
      ]) {
        const project = {
          afterCrop: defaultCrop,
          highlight1Crop,
          highlight2Crop,
        };
        for (let frame = 0; frame < 450; frame += 0.5) {
          const shot = launchAfterGeometry(
            media,
            project,
            width,
            height,
            frame,
            1.9,
            0.8,
            0.9,
          );
          assert.ok(shot.left <= 1e-8 && shot.top <= 1e-8);
          assert.ok(shot.left + shot.width >= width - 1e-8);
          assert.ok(shot.top + shot.height >= height - 1e-8);
          assert.ok(
            Math.abs(shot.width / shot.height - media.width / media.height) <
              1e-8,
          );
        }
        for (const boundary of [171, 193, 255, 275, 354]) {
          const left = launchAfterGeometry(
            media,
            project,
            width,
            height,
            boundary - 1e-5,
            1.9,
          );
          const right = launchAfterGeometry(
            media,
            project,
            width,
            height,
            boundary + 1e-5,
            1.9,
          );
          for (const key of Object.keys(left) as (keyof typeof left)[])
            assert.ok(Math.abs(left[key] - right[key]) < 0.00001);
        }
      }
});

test("returning a single custom highlight to automatic leaves other scenes unchanged", () => {
  const media = { width: 2560, height: 1760 };
  const automatic = { afterCrop: defaultCrop };
  const project: Pick<
    ProjectInput,
    "afterCrop" | "highlight1Crop" | "highlight2Crop"
  > = {
    ...automatic,
    highlight1Crop: { x: 1, y: 1, zoom: 2 },
  };
  for (const frame of [0, 105, 170, 171, 275, 302, 354, 449])
    assert.deepEqual(
      launchAfterGeometry(media, project, 1040, 770, frame, 1.9),
      launchAfterGeometry(media, automatic, 1040, 770, frame, 1.9),
    );
});

test("launch headlines use the actual font width and balance readable phrases", () => {
  for (const font of ["dm-sans", "manrope"] as const) {
    const hook = fitLaunchText(
      "Your idea.\nAlready in motion.",
      810,
      650,
      158,
      1.02,
      font,
    );
    assert.equal(hook.text.split("\n")[0], "Your idea.");
    assert.ok(hook.text.split("\n").length <= 3);
    const proof = fitLaunchText(
      "One prompt. A clear plan.",
      810,
      400,
      114,
      1.02,
      font,
    );
    assert.equal(proof.text, "One prompt.\nA clear plan.");
    for (const fitted of [hook, proof]) {
      for (const line of fitted.text.split("\n")) {
        assert.ok(launchTextWidth(line, fitted.fontSize, font) <= 810);
      }
    }
  }
});

test("launch fitting preserves accented copy, CJK and complete emoji sequences", () => {
  for (const copy of [
    "Créez l’avenir. Avec clarté.",
    "新しいアイデアを形にする",
    "👩🏽‍💻".repeat(36),
  ]) {
    const fitted = fitLaunchText(copy, 730, 450, 128);
    assert.equal(fitted.text.replace(/\s/g, ""), copy.replace(/\s/g, ""));
    assert.ok(
      fitted.text.split("\n").length * fitted.fontSize * fitted.lineHeight <=
        450,
    );
    assert.ok(!fitted.text.includes("\n\u200d"));
    for (const line of fitted.text.split("\n"))
      assert.ok(launchTextWidth(line, fitted.fontSize) <= 730);
  }
});

test("launch detail cuts only sample inside the chosen viewport", () => {
  for (const media of [
    { width: 1440, height: 2000 },
    { width: 2800, height: 1100 },
  ]) {
    for (const crop of [
      { x: 0, y: 0, zoom: 1 },
      { x: 1, y: 1, zoom: 2 },
      { x: 0.5, y: 0.2, zoom: 1.3 },
    ]) {
      for (const [width, height] of [
        [952, 1440],
        [1544, 870],
      ]) {
        const base = coverGeometry(media, crop, width, height);
        for (const [anchorX, anchorY] of [
          [0, 0],
          [1, 1],
          [0.22, 0.66],
        ]) {
          const cut = launchShotGeometry(
            media,
            crop,
            width,
            height,
            1.24,
            anchorX,
            anchorY,
          );
          const source = {
            left: -cut.left / cut.width,
            top: -cut.top / cut.height,
            right: (width - cut.left) / cut.width,
            bottom: (height - cut.top) / cut.height,
          };
          assert.ok(source.left >= -base.left / base.width - 1e-9);
          assert.ok(source.top >= -base.top / base.height - 1e-9);
          assert.ok(source.right <= (width - base.left) / base.width + 1e-9);
          assert.ok(source.bottom <= (height - base.top) / base.height + 1e-9);
          assert.ok(cut.left <= 0 && cut.top <= 0);
          assert.ok(cut.left + cut.width >= width - 1e-9);
          assert.ok(cut.top + cut.height >= height - 1e-9);
        }
      }
    }
  }
});

test("every allowed launch accent stays readable on the graphite stage", () => {
  for (const color of [
    "#000000",
    "#08090c",
    "#ffffff",
    "#365DDB",
    "#00ff77",
    "#ff0044",
  ]) {
    assert.ok(contrastRatio(launchAccent(color), "#08090c") >= 5);
  }
});

test("launch captions keep ordinary words intact at a bold readable size", () => {
  const copy = "Less setup. More momentum.";
  const fitted = fitLaunchText(copy, 680, 460, 108);
  assert.equal(fitted.text.replace(/\s+/g, " "), copy);
  assert.equal(fitted.text, "Less setup.\nMore momentum.");
  assert.ok(fitted.fontSize >= 80);
  const longWord = "Extraordinary possibilities.";
  const longFit = fitLaunchText(longWord, 548, 550, 98);
  assert.equal(longFit.text.replace(/\s+/g, " "), longWord);
  assert.ok(longFit.fontSize < 98);
});

test("launch supports max-length identifiers and uppercase custom calls to action", () => {
  const identifier = "W".repeat(60);
  const name = fitLaunchText(identifier, 810, 490, 150);
  assert.equal(name.text.replace(/\s/g, ""), identifier);
  assert.ok(
    name.text.split("\n").length * name.fontSize * name.lineHeight <= 490,
  );
  for (const copy of [
    "EXPLORE THE NEXT GENERATION OF IDEAS.",
    "W".repeat(36),
  ]) {
    const cta = fitLaunchText(copy, 730, 112, 27, 1.14);
    assert.equal(cta.text.replace(/\s/g, ""), copy.replace(/\s/g, ""));
    assert.ok(
      cta.text.split("\n").length * cta.fontSize * cta.lineHeight <= 112,
    );
  }
});
