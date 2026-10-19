import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  buildLinkVideo,
  linkVideoCopy,
  linkVideoRequestSchema,
} from "../src/shared/link-video";
import { projectAssetIds, videoSettings } from "../src/shared/project";
import { safeAuthNext } from "../src/shared/auth-next";
import type { WebsiteImport } from "../src/server/website-import";

test("a link creates a complete branded story with actual website content and all media references", () => {
  const source: WebsiteImport = {
    url: "https://product.example/features?utm_source=launch",
    name: "Product",
    opening: "A clearer way to work.",
    color: "#456ABC",
    font: "dm-sans",
    cta: "Try Product",
    captures: [
      { name: "Desktop", caption: "A clearer way to work.", image: "first" },
      {
        name: "Feature",
        caption: "One place for every project.",
        image: "second",
      },
      { name: "Mobile", caption: "Your projects on the move.", image: "third" },
    ],
    logo: "logo",
  };
  const assets = {
    captures: [randomUUID(), randomUUID(), randomUUID()],
    logo: randomUUID(),
  };
  const original = structuredClone(source);
  const project = buildLinkVideo(source, {}, assets);
  assert.equal(project.template, "launch");
  assert.equal(project.format, "landscape");
  assert.equal(project.sound, "pulse");
  assert.equal(project.story?.duration, 30);
  assert.equal(project.story?.scenes.length, 3);
  assert.equal(project.story?.scenes[0].caption, "Meet Product.");
  assert.equal(project.story?.scenes[1].caption, source.captures[1].caption);
  assert.equal(project.color, source.color);
  assert.equal(project.url, "product.example");
  assert.equal(project.sourceUrl, source.url);
  assert.deepEqual(
    new Set(projectAssetIds(project)),
    new Set([...assets.captures, assets.logo]),
  );
  assert.equal(videoSettings(project).durationInFrames, 900);
  assert.deepEqual(source, original);
  const portrait = buildLinkVideo(
    source,
    { format: "vertical", duration: 15 },
    assets,
  );
  assert.equal(videoSettings(portrait).height, 1920);
  assert.equal(videoSettings(portrait).durationInFrames, 450);
  assert.throws(() =>
    buildLinkVideo(
      source,
      {},
      { captures: assets.captures.slice(0, 2), logo: null },
    ),
  );
});

test("link requests accept bare domains but reject unsafe schemes, credentials and unsupported settings", () => {
  assert.deepEqual(
    linkVideoRequestSchema.parse({ url: " product.example/pricing " }),
    {
      url: "https://product.example/pricing",
      format: "landscape",
      duration: 30,
    },
  );
  for (const body of [
    { url: "javascript:alert(1)" },
    { url: "file:///private" },
    { url: "https://user:pass@product.example" },
    { url: "https://product.example", duration: 25 },
    { url: "https://product.example", format: "4:3" },
    { url: "https://product.example", owner_id: randomUUID() },
  ]) {
    assert.equal(linkVideoRequestSchema.safeParse(body).success, false);
  }
  assert.equal(
    linkVideoCopy("One clear sentence to open a product launch.", 20),
    "One clear sentence…",
  );
  assert.ok(linkVideoCopy("👩🏽‍💻".repeat(20), 70).length <= 70);
  assert.ok(!linkVideoCopy("👩🏽‍💻".repeat(20), 70).endsWith("\u200d…"));
  assert.equal(safeAuthNext("/create"), "/create");
  for (const target of [
    undefined,
    "//evil.example",
    "https://evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
  ])
    assert.equal(safeAuthNext(target), "/projects");
});
