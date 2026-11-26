import assert from "node:assert/strict";
import test from "node:test";
import { storyOpeningShotBox } from "../src/video/story-layout";

test("square story opening shot stays below the title and within safe margins", () => {
  const shot = storyOpeningShotBox(1080, 1080);
  assert.equal(shot.top, 590);
  assert.ok(shot.top + shot.height <= 1080 - 72);
  assert.ok(shot.left >= 72);
  assert.ok(shot.left + shot.width <= 1080 - 72);
});

test("landscape opening shot keeps its top and right inset", () => {
  const shot = storyOpeningShotBox(1920, 1080);
  assert.equal(shot.left, 980);
  assert.equal(shot.top, 220);
  assert.ok(shot.left + shot.width <= 1920 - 96);
  assert.ok(shot.top + shot.height <= 1080 - 96);
});

test("vertical story opening shot keeps its established position and size", () => {
  assert.deepEqual(storyOpeningShotBox(1080, 1920), {
    left: 72,
    top: 1050,
    width: 936,
    height: 650,
  });
});
