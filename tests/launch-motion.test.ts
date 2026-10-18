import assert from "node:assert/strict";
import test from "node:test";
import { coverGeometry } from "../src/shared/project";
import { contrastRatio } from "../src/shared/video-style";
import {
  launchAccent,
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
