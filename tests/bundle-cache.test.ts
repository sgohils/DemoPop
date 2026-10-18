import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createBundleCache } from "../worker/bundle-cache";

test("failed bundles clean partial output and a later job rebuilds and reuses success", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "demopop-cache-test-"));
  const unrelated = path.join(root, ".render-bundle-user-file");
  const failure = new Error("Injected initial bundler failure");
  let builds = 0;
  const cache = createBundleCache(async (directory) => {
    builds++;
    await writeFile(path.join(directory, "partial.txt"), "application output");
    if (builds === 1) throw failure;
    return directory;
  }, root);
  try {
    await writeFile(unrelated, "preserve this file");
    const first = cache.get();
    assert.equal(cache.get(), first, "concurrent jobs share one build");
    await assert.rejects(first, (error) => error === failure);
    assert.deepEqual(await readdir(root), [path.basename(unrelated)]);

    const successful = await cache.get();
    assert.equal(builds, 2);
    assert.equal(await cache.get(), successful);
    assert.equal(builds, 2, "a successful bundle stays cached");
    await cache.cleanup();
    assert.deepEqual(await readdir(root), [path.basename(unrelated)]);
    assert.equal(await readFile(unrelated, "utf8"), "preserve this file");

    assert.notEqual(await cache.get(), successful);
    assert.equal(builds, 3, "cleanup allows a fresh build");
  } finally {
    await cache.cleanup();
    await rm(root, { recursive: true, force: true });
  }
});

test("cleanup waits for an in-flight bundle and a new request waits for cleanup", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "demopop-cache-test-"));
  let release: (() => void) | undefined;
  let builds = 0;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const cache = createBundleCache(async (directory) => {
    builds++;
    if (builds === 1) await blocked;
    await writeFile(path.join(directory, "finished.txt"), "done");
    return directory;
  }, root);
  try {
    const first = cache.get();
    const cleanup = cache.cleanup();
    const next = cache.get();
    release!();
    const firstDirectory = await first;
    await cleanup;
    const nextDirectory = await next;
    assert.notEqual(nextDirectory, firstDirectory);
    assert.deepEqual(await readdir(root), [path.basename(nextDirectory)]);
    assert.equal(builds, 2);
  } finally {
    release!();
    await cache.cleanup();
    await rm(root, { recursive: true, force: true });
  }
});
