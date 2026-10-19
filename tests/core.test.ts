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
test("highlight framing accepts legacy automatic shots and validates custom source crops", () => {
  const legacy = projectSchema.parse(sampleProject);
  assert.equal(legacy.highlight1Crop, undefined);
  assert.equal(legacy.highlight2Crop, undefined);
  const automatic = projectSchema.parse({
    ...legacy,
    highlight1Crop: null,
    highlight2Crop: null,
  });
  assert.equal(automatic.highlight1Crop, null);
  assert.equal(automatic.highlight2Crop, null);
  const custom = {
    ...legacy,
    highlight1Crop: { x: 0, y: 1, zoom: 1 },
    highlight2Crop: { x: 1, y: 0, zoom: 2 },
  };
  assert.deepEqual(projectSchema.parse(custom), custom);
  for (const key of ["highlight1Crop", "highlight2Crop"] as const)
    for (const invalid of [
      { x: -0.01, y: 0, zoom: 1 },
      { x: 0, y: 1.01, zoom: 1 },
      { x: 0, y: 0, zoom: 0.99 },
      { x: 0, y: 0, zoom: 2.01 },
      { x: 0, y: 0 },
      { x: 0, y: 0, zoom: 1, src: "https://example.com/image.png" },
      "https://example.com/image.png",
    ])
      assert.equal(
        projectSchema.safeParse({ ...legacy, [key]: invalid }).success,
        false,
        `${key} must validate the whole crop`,
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

test("uploaded UI details and translucent logo edges retain their exact pixels", async () => {
  const width = 160,
    height = 120;
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      // One-pixel colored lines expose chroma bleeding from a lossy conversion.
      pixels[offset] = x % 3 === 0 ? 255 : 32;
      pixels[offset + 1] = x % 3 === 1 ? 255 : 48;
      pixels[offset + 2] = y % 2 === 0 ? 255 : 64;
      pixels[offset + 3] = x < width / 3 ? 0 : x < (width * 2) / 3 ? 96 : 255;
    }
  const input = await sharp(pixels, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
  const normalized = await normalizeImage(input);
  assert.equal(normalized.width, width);
  assert.equal(normalized.height, height);
  assert.ok(
    (await sharp(normalized.data).ensureAlpha().raw().toBuffer()).equals(
      pixels,
    ),
    "normalization must not soften fine UI lines or change translucent colors",
  );
});

test("image preparation applies camera orientation before reporting dimensions", async () => {
  const input = await sharp({
    create: { width: 160, height: 96, channels: 3, background: "#365ddb" },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: 40,
            height: 96,
            channels: 3,
            background: "#f24530",
          },
        })
          .png()
          .toBuffer(),
        left: 0,
        top: 0,
      },
    ])
    .withMetadata({ orientation: 6 })
    .png()
    .toBuffer();
  const normalized = await normalizeImage(input);
  assert.equal(normalized.width, 96);
  assert.equal(normalized.height, 160);
  assert.ok(
    (await sharp(normalized.data).ensureAlpha().raw().toBuffer()).equals(
      await sharp(input).rotate().ensureAlpha().raw().toBuffer(),
    ),
    "orientation must rotate the pixels as well as the reported dimensions",
  );
  assert.equal(
    (await sharp(normalized.data).metadata()).orientation,
    undefined,
  );
});

test("dense photos fit private input storage without reducing their dimensions", async () => {
  const width = 2560,
    height = 2600;
  const pixels = Buffer.allocUnsafe(width * height * 3);
  let seed = 739;
  for (let index = 0; index < pixels.length; index++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    pixels[index] = seed & 255;
  }
  const input = await sharp(pixels, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 80 })
    .toBuffer();
  assert.ok(input.length < 10 * 1024 * 1024, "fixture is a valid upload");
  const normalized = await normalizeImage(input);
  assert.equal(normalized.width, width);
  assert.equal(normalized.height, height);
  assert.ok(
    normalized.data.length <= 15 * 1024 * 1024,
    "a prepared image must fit the existing private bucket limit",
  );
  const decoded = await sharp(normalized.data).raw().toBuffer();
  assert.equal(decoded.length, pixels.length);
  assert.equal(
    decoded.equals(await sharp(input).raw().toBuffer()),
    false,
    "this dense fixture must exercise the bounded lossy fallback",
  );
});
