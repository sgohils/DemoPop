import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  projectSchema,
  projectAssetIds,
  launchProject,
  videoSettings,
} from "../src/shared/project";
import {
  starterStory,
  storyTimeline,
  packageVariants,
  launchHooks,
} from "../src/shared/launch-kit";
import { videoScenes } from "../src/shared/scenes";
import { draftProjectSchema } from "../src/client/drafts";
import { createHistory, projectHistory } from "../src/client/project-history";
import { crc32, zipFiles } from "../src/shared/zip";
import { isPublicAddress, publicWebUrl } from "../src/server/public-web";

const story = () =>
  starterStory(launchProject, [randomUUID(), randomUUID(), randomUUID()]);
test("stories validate all scene assets, duration, identities and editable drafts", () => {
  const project = {
    ...launchProject,
    story: story(),
    client: "Acme",
    format: "square" as const,
  };
  assert.equal(projectSchema.parse(project).story!.scenes.length, 3);
  assert.deepEqual(videoSettings(project), {
    width: 1080,
    height: 1080,
    fps: 30,
    durationInFrames: 900,
  });
  const id = randomUUID();
  project.story.scenes[1].asset = id;
  assert.ok(projectAssetIds(project).includes(id));
  for (const invalid of [
    { ...project.story, duration: 120 },
    { ...project.story, scenes: project.story.scenes.slice(0, 2) },
    {
      ...project.story,
      scenes: [...project.story.scenes, project.story.scenes[0]],
    },
    {
      ...project.story,
      scenes: project.story.scenes.map((scene) => ({
        ...scene,
        asset: "https://private/image",
      })),
    },
  ])
    assert.equal(
      projectSchema.safeParse({ ...project, story: invalid }).success,
      false,
    );
  const incomplete = {
    ...project,
    hooks: ["", "Two", "Three"],
    story: {
      ...project.story,
      scenes: project.story.scenes.map((scene) => ({ ...scene, caption: "" })),
    },
  };
  assert.equal(projectSchema.safeParse(incomplete).success, false);
  assert.equal(draftProjectSchema.safeParse(incomplete).success, true);
});

test("story timing is gap-free with a minimum readable hold and exact total length", () => {
  for (const duration of [15, 30, 60] as const)
    for (const count of [3, 4, 5, 6]) {
      const input = story();
      input.duration = duration;
      while (input.scenes.length < count)
        input.scenes.push({ ...input.scenes[0], id: randomUUID() });
      input.scenes = input.scenes.map((scene, index) => ({
        ...scene,
        weight: index === 0 ? 1 : 5,
      }));
      const project = { ...launchProject, story: input },
        timeline = storyTimeline(project),
        scenes = videoScenes(project);
      assert.equal(timeline.total, duration * 30);
      assert.equal(scenes[0].start, 0);
      assert.equal(scenes.at(-1)!.end, timeline.total);
      for (let i = 1; i < scenes.length; i++)
        assert.equal(scenes[i - 1].end, scenes[i].start);
      for (const beat of timeline.beats) {
        assert.ok(beat.end - beat.start >= 45);
        assert.ok(beat.preview >= beat.start && beat.preview < beat.end);
      }
      assert.ok(
        timeline.beats[1].end - timeline.beats[1].start >=
          timeline.beats[0].end - timeline.beats[0].start,
      );
    }
});

test("launch package captures nine independent variants without mutating its project", () => {
  const project = {
    ...launchProject,
    story: story(),
    hooks: ["Hook one.", "Hook two.", "Hook three."],
  };
  const original = structuredClone(project),
    variants = packageVariants(project);
  assert.equal(variants.length, 9);
  assert.equal(new Set(variants.map((variant) => variant.name)).size, 9);
  for (const format of ["landscape", "vertical", "square"])
    assert.deepEqual(
      variants
        .filter((variant) => variant.project.format === format)
        .map((variant) => variant.project.opening),
      project.hooks,
    );
  assert.deepEqual(project, original);
  assert.equal(
    new Set(
      launchHooks({ ...launchProject, opening: `Meet ${launchProject.name}.` }),
    ).size,
    3,
  );
  const editedHooks = [
    "Meet Orbit.",
    "  meet   orbit.  ",
    "A new way forward.",
  ];
  assert.deepEqual(
    launchHooks({ ...launchProject, hooks: editedHooks }),
    editedHooks,
  );
  const generatedProject = {
    ...launchProject,
    opening: " Meet  Orbit. ",
    story: story(),
  };
  generatedProject.story.scenes[0].caption = "meet orbit.";
  const duplicateHooks = launchHooks(generatedProject);
  assert.equal(
    new Set(
      duplicateHooks.map((hook) =>
        hook.trim().replace(/\s+/g, " ").toLowerCase(),
      ),
    ).size,
    3,
  );
});

test("story typing groups independently, while reorder and asset replacement remain undoable", () => {
  const original = { ...launchProject, story: story() };
  let state = createHistory(original);
  const caption = (copy: string, at: number) => {
    state = projectHistory(state, {
      type: "edit",
      at,
      value: (current) => ({
        ...current,
        story: {
          ...current.story!,
          scenes: current.story!.scenes.map((scene, index) =>
            index === 0 ? { ...scene, caption: copy } : scene,
          ),
        },
      }),
    });
  };
  caption("A", 1000);
  caption("A real product", 1200);
  assert.equal(state.entries.length, 2);
  state = projectHistory(state, {
    type: "edit",
    at: 1300,
    value: (current) => ({
      ...current,
      story: {
        ...current.story!,
        scenes: [
          current.story!.scenes[1],
          current.story!.scenes[0],
          current.story!.scenes[2],
        ],
      },
    }),
  });
  state = projectHistory(state, { type: "undo" });
  assert.equal(
    state.entries[state.index].story!.scenes[0].caption,
    "A real product",
  );
  state = projectHistory(state, { type: "undo" });
  assert.deepEqual(state.entries[state.index], original);
  caption("Typing immediately before applying", 2000);
  state = projectHistory(state, {
    type: "edit",
    value: original,
    at: 2050,
    atomic: true,
  });
  state = projectHistory(state, { type: "undo" });
  assert.equal(
    state.entries[state.index].story!.scenes[0].caption,
    "Typing immediately before applying",
  );
});

test("ZIP output has correct checksums, central records and safe archive filenames", () => {
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
  const files = [
    { name: "square-original.mp4", data: Buffer.from("test MP4") },
    { name: "manifest.json", data: Buffer.from('{"version":1}') },
  ];
  const zip = zipFiles(files);
  let offset = 0;
  for (const file of files) {
    assert.equal(zip.readUInt32LE(offset), 0x04034b50);
    const length = zip.readUInt16LE(offset + 26);
    assert.equal(
      zip.subarray(offset + 30, offset + 30 + length).toString(),
      file.name,
    );
    assert.equal(zip.readUInt32LE(offset + 14), crc32(file.data));
    assert.deepEqual(
      zip.subarray(
        offset + 30 + length,
        offset + 30 + length + file.data.length,
      ),
      file.data,
    );
    offset += 30 + length + file.data.length;
  }
  assert.equal(zip.readUInt32LE(offset), 0x02014b50);
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
  assert.equal(zip.readUInt16LE(zip.length - 14), 2);
  for (const name of ["../secret", "/absolute", "C:\\file", "a/b.mp4"])
    assert.throws(() => zipFiles([{ name, data: Buffer.alloc(0) }]));
  assert.throws(
    () => zipFiles(Array.from({ length: 0x10000 }, () => files[0])),
    /too many files/,
  );
  assert.throws(
    () => zipFiles([{ name: "bad-data.mp4", data: "not a buffer" as never }]),
    /too large/,
  );
});

test("website capture rejects local, mapped, reserved, credentialed and non-web targets", () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.4",
    "169.254.169.254",
    "192.168.1.1",
    "172.16.2.2",
    "100.100.1.1",
    "::1",
    "::ffff:127.0.0.1",
    "fe80::1",
    "fd00::1",
    "203.0.113.5",
  ])
    assert.equal(isPublicAddress(address), false, address);
  for (const address of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])
    assert.equal(isPublicAddress(address), true, address);
  for (const url of [
    "http://localhost",
    "http://127.1",
    "http://2130706433",
    "http://0x7f000001",
    "http://[::ffff:127.0.0.1]",
    "http://metadata.local",
    "file:///C:/private",
    "https://user:pass@example.com",
    "https://example.com:8443",
  ])
    assert.throws(() => publicWebUrl(url), url);
  assert.equal(
    publicWebUrl("https://example.com/path#section").toString(),
    "https://example.com/path",
  );
});
