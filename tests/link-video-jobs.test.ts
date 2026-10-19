import test from "node:test";
import assert from "node:assert/strict";
import {
  createLinkVideoJobStore,
  LinkVideoError,
  videoByteRange,
} from "../src/server/link-video-jobs";

test("local link videos serialize work, use opaque IDs, and retain failures for polling", async () => {
  let time = 100;
  const jobs = createLinkVideoJobStore({ now: () => time, cooldown: 15 });
  const first = await jobs.reserve();
  assert.match(first.id, /^[a-f0-9]{64}$/);
  assert.equal(first.status, "queued");
  await assert.rejects(
    jobs.reserve(),
    (error: unknown) => error instanceof LinkVideoError && error.status === 429,
  );
  first.progress = 0.4;
  jobs.finish(first, "A public page is required.");
  assert.equal((await jobs.get(first.id))?.error, "A public page is required.");
  await assert.rejects(jobs.reserve(), /Wait a few seconds/);
  time += 20;
  const second = await jobs.reserve();
  assert.notEqual(second.id, first.id);
  jobs.finish(second);
  assert.equal((await jobs.get(second.id))?.progress, 1);
  assert.equal((await jobs.get(second.id))?.status, "completed");
  assert.equal(await jobs.get("../../video.mp4"), undefined);
});

test("local video retention is bounded, cleans evicted output, and keeps an active render", async () => {
  let time = 0;
  const dropped: string[] = [];
  const jobs = createLinkVideoJobStore({
    now: () => time,
    cooldown: 0,
    retention: 20,
    maxRetained: 2,
    onDrop: async (job) => {
      dropped.push(job.id);
    },
  });
  const first = await jobs.reserve();
  jobs.finish(first);
  const second = await jobs.reserve();
  jobs.finish(second);
  const third = await jobs.reserve();
  assert.deepEqual(dropped, [first.id]);
  time = 30;
  assert.equal(
    (await jobs.get(third.id))?.status,
    "queued",
    "active work is not evicted",
  );
  assert.deepEqual(dropped, [first.id, second.id]);
  jobs.finish(third);
  time = 49;
  assert.equal((await jobs.get(third.id))?.status, "completed");
  time = 50;
  assert.equal(await jobs.get(third.id), undefined);
  assert.deepEqual(dropped, [first.id, second.id, third.id]);
});

test("native video downloads support bounded ranges and reject malformed or multiple ranges", () => {
  assert.deepEqual(videoByteRange(null, 100), {
    start: 0,
    end: 99,
    partial: false,
  });
  assert.deepEqual(videoByteRange("bytes=2-7", 100), {
    start: 2,
    end: 7,
    partial: true,
  });
  assert.deepEqual(videoByteRange("bytes=92-", 100), {
    start: 92,
    end: 99,
    partial: true,
  });
  assert.deepEqual(videoByteRange("bytes=-8", 100), {
    start: 92,
    end: 99,
    partial: true,
  });
  assert.deepEqual(videoByteRange("bytes=95-999", 100), {
    start: 95,
    end: 99,
    partial: true,
  });
  for (const value of [
    "bytes=",
    "bytes=-",
    "bytes=-0",
    "bytes=100-",
    "bytes=8-2",
    "bytes=0-2,5-8",
    "bytes=9007199254740992-",
    "garbage",
  ])
    assert.equal(videoByteRange(value, 100), null, value);
});

test("concurrent local requests cannot both reserve while expired output cleanup yields", async () => {
  let release!: () => void;
  const cleanup = new Promise<void>((resolve) => {
    release = resolve;
  });
  const jobs = createLinkVideoJobStore({
    cooldown: 0,
    maxRetained: 1,
    onDrop: () => cleanup,
  });
  const previous = await jobs.reserve();
  jobs.finish(previous);
  const accepted = jobs.reserve();
  await assert.rejects(jobs.reserve(), /already being created/);
  release();
  const next = await accepted;
  assert.notEqual(next.id, previous.id);
  await assert.rejects(jobs.reserve(), /already being created/);
});
