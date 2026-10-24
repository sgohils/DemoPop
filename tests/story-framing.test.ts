import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  launchProject,
  projectSchema,
  type ProjectInput,
} from "../src/shared/project";
import {
  packageVariants,
  starterStory,
  storyTimeline,
} from "../src/shared/launch-kit";
import { draftProjectSchema } from "../src/client/drafts";
import { createHistory, projectHistory } from "../src/client/project-history";

function project(): ProjectInput {
  return {
    ...launchProject,
    story: starterStory(launchProject, [
      randomUUID(),
      randomUUID(),
      randomUUID(),
    ]),
  };
}

test("story framing retains legacy crops and validates optional format overrides strictly", () => {
  const legacy = project();
  assert.deepEqual(projectSchema.parse(legacy), legacy);
  for (const format of ["vertical", "landscape", "square"] as const)
    assert.deepEqual(
      storyTimeline({ ...legacy, format }).beats[0].crop,
      legacy.story!.scenes[0].crop,
    );

  const updated = structuredClone(legacy);
  const formatCrops = {
    vertical: { x: 0.2, y: 0.3, zoom: 1.4 },
    square: { x: 0.7, y: 0.5, zoom: 1.2 },
  };
  updated.story!.scenes[0].formatCrops = formatCrops;
  assert.deepEqual(projectSchema.parse(updated), updated);
  assert.deepEqual(draftProjectSchema.parse(updated), updated);
  // Recipes, browser drafts and export snapshots serialize the same project.
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(updated))),
    updated,
  );

  for (const invalid of [
    null,
    { portrait: formatCrops.vertical },
    { vertical: { ...formatCrops.vertical, x: -0.1 } },
    { landscape: { ...formatCrops.vertical, y: 1.1 } },
    { square: { ...formatCrops.square, zoom: 2.1 } },
    { vertical: { ...formatCrops.vertical, zoom: "1.4" } },
    { vertical: { ...formatCrops.vertical, rotation: 2 } },
  ]) {
    const candidate = structuredClone(updated);
    Object.assign(candidate.story!.scenes[0], { formatCrops: invalid });
    assert.equal(projectSchema.safeParse(candidate).success, false);
    assert.equal(draftProjectSchema.safeParse(candidate).success, false);
  }
});

test("every package hook uses its format's scene crop without changing media, timing or shared framing", () => {
  const input = project();
  input.story!.scenes[0] = {
    ...input.story!.scenes[0],
    trimStart: 1.2,
    weight: 5,
    formatCrops: {
      vertical: { x: 0.1, y: 0.2, zoom: 1.6 },
      landscape: { x: 0.8, y: 0.6, zoom: 1.1 },
    },
  };
  input.story!.scenes[1].formatCrops = {
    square: { x: 0.4, y: 0.3, zoom: 1.3 },
  };
  const original = structuredClone(input);
  const expected = {
    vertical: [
      { x: 0.1, y: 0.2, zoom: 1.6 },
      original.story!.scenes[1].crop,
      original.story!.scenes[2].crop,
    ],
    landscape: [
      { x: 0.8, y: 0.6, zoom: 1.1 },
      original.story!.scenes[1].crop,
      original.story!.scenes[2].crop,
    ],
    square: [
      original.story!.scenes[0].crop,
      { x: 0.4, y: 0.3, zoom: 1.3 },
      original.story!.scenes[2].crop,
    ],
  };
  const baselineTimeline = storyTimeline(original);
  for (const variant of packageVariants(input)) {
    const timeline = storyTimeline(variant.project);
    assert.deepEqual(
      timeline.beats.map((beat) => beat.crop),
      expected[variant.project.format],
      variant.name,
    );
    assert.deepEqual(
      timeline.beats.map(({ asset, trimStart, start, end }) => ({
        asset,
        trimStart,
        start,
        end,
      })),
      baselineTimeline.beats.map(({ asset, trimStart, start, end }) => ({
        asset,
        trimStart,
        start,
        end,
      })),
    );
  }
  assert.deepEqual(input, original);
});

test("framing undo groups each format drag and keeps reset and global framing as separate actions", () => {
  const original = project();
  let state = createHistory(original);
  const crop = (format: ProjectInput["format"], x: number, at: number) => {
    state = projectHistory(state, {
      type: "edit",
      at,
      value: (current) => ({
        ...current,
        story: {
          ...current.story!,
          scenes: current.story!.scenes.map((scene, index) =>
            index === 0
              ? {
                  ...scene,
                  formatCrops: {
                    ...scene.formatCrops,
                    [format]: { ...scene.crop, x },
                  },
                }
              : scene,
          ),
        },
      }),
    });
  };
  crop("vertical", 0.1, 1000);
  crop("vertical", 0.2, 1100);
  assert.equal(state.entries.length, 2);
  crop("landscape", 0.8, 1200);
  crop("landscape", 0.9, 1300);
  assert.equal(state.entries.length, 3);

  const framed = state.entries[state.index];
  const reset = structuredClone(framed);
  delete reset.story!.scenes[0].formatCrops!.landscape;
  state = projectHistory(state, { type: "edit", at: 1400, value: reset });
  assert.equal(state.entries.length, 4);
  state = projectHistory(state, { type: "undo" });
  assert.deepEqual(state.entries[state.index], framed);

  const shared = structuredClone(framed);
  shared.story!.scenes[0].crop = { x: 0.9, y: 0, zoom: 1 };
  shared.story!.scenes[0].formatCrops = undefined;
  state = projectHistory(state, { type: "edit", at: 1500, value: shared });
  assert.equal(state.entries.length, 4);
  for (const format of ["vertical", "landscape", "square"] as const)
    assert.deepEqual(
      storyTimeline({ ...shared, format }).beats[0].crop,
      shared.story!.scenes[0].crop,
    );
  state = projectHistory(state, { type: "undo" });
  assert.deepEqual(state.entries[state.index], framed);
  state = projectHistory(state, { type: "undo" });
  assert.equal(
    state.entries[state.index].story!.scenes[0].formatCrops?.vertical?.x,
    0.2,
  );
  assert.equal(
    state.entries[state.index].story!.scenes[0].formatCrops?.landscape,
    undefined,
  );
  state = projectHistory(state, { type: "undo" });
  assert.deepEqual(state.entries[state.index], original);
});
