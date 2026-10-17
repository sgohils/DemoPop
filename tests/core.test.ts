import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  projectSchema,
  sampleProject,
  coverGeometry,
} from "../src/shared/project";
import { normalizeImage } from "../src/server/images";
import { owned, safeStoragePath } from "../src/server/access";
test("project schema rejects remote paths, extra owner fields, overlong captions and invalid crop values", () => {
  for (const change of [
    { before: "https://evil.example/image.png" },
    { after: "C:/private.png" },
    { owner_id: "attacker" },
    { opening: "x".repeat(71) },
    { color: "red" },
    { afterCrop: { x: 2, y: 0, zoom: 1 } },
    { url: "" },
  ])
    assert.equal(
      projectSchema.safeParse({ ...sampleProject, ...change }).success,
      false,
    );
  assert.equal(
    projectSchema.safeParse({
      ...sampleProject,
      name: "n".repeat(60),
      url: "u".repeat(80),
      opening: "o".repeat(70),
    }).success,
    true,
  );
});
test("cover crop never exposes empty pixels with tall or unequal sources", () => {
  for (const media of [
    { width: 800, height: 12000 },
    { width: 4000, height: 100 },
    { width: 1440, height: 2000 },
  ])
    for (const x of [0, 0.5, 1])
      for (const y of [0, 0.5, 1])
        for (const zoom of [1, 2]) {
          const g = coverGeometry(media, { x, y, zoom }, 936, 1050, 1.045);
          assert.ok(g.left <= 0 && g.top <= 0);
          assert.ok(g.left + g.width >= 936 - 0.001);
          assert.ok(g.top + g.height >= 1050 - 0.001);
        }
});
test("ownership and storage path checks deny cross-account and traversal access", () => {
  assert.throws(() => owned({ owner_id: "alice" }, "bob"));
  assert.throws(() => owned(null, "alice"));
  assert.equal(owned({ owner_id: "alice" }, "alice").owner_id, "alice");
  for (const p of [
    "bob/file.webp",
    "alice/../file",
    "alice\\file",
    "https://example.com/file",
  ])
    assert.equal(safeStoragePath("alice", p), false);
  assert.equal(safeStoragePath("alice", "alice/asset.webp"), true);
});
test("server validates decoded images, not extension or MIME", async () => {
  await assert.rejects(
    () => normalizeImage(Buffer.from("<svg>not a png</svg>")),
    /Only real/,
  );
  await assert.rejects(
    () =>
      normalizeImage(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2])),
    /decoded/,
  );
  await assert.rejects(
    () => normalizeImage(Buffer.alloc(10 * 1024 * 1024 + 1)),
    /10 MB/,
  );
  for (const format of ["png", "jpeg", "webp"] as const) {
    const input = await sharp({
      create: { width: 160, height: 120, channels: 3, background: "#365ddb" },
    })
      [format]()
      .toBuffer();
    const normalized = await normalizeImage(input);
    assert.equal(normalized.width, 160);
    assert.equal((await sharp(normalized.data).metadata()).format, "webp");
  }
  const tall = await sharp({
    create: { width: 100, height: 13000, channels: 3, background: "#abc" },
  })
    .png()
    .toBuffer();
  assert.equal((await normalizeImage(tall)).height, 12000);
});
