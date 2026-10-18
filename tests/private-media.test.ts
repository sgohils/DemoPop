import { test } from "node:test";
import assert from "node:assert/strict";
import { createMediaRefresher } from "../src/shared/private-media";
import type { Media } from "../src/shared/project";

test("private media refresh reports failure, coalesces requests, and recovers on retry", async () => {
  let calls = 0,
    failures = 0,
    successes = 0;
  const applied: string[] = [];
  const refresher = createMediaRefresher({
    assets: { before: "private-before", after: "sample-after", logo: null },
    fetchMedia: async () => {
      calls++;
      if (calls === 1) throw new Error("temporarily unavailable");
      return { src: "renewed-private-input", width: 100, height: 100 };
    },
    onMedia: (slot) => applied.push(slot),
    onError: () => {
      failures++;
    },
    onSuccess: () => {
      successes++;
    },
  });
  const first = refresher.refresh();
  assert.equal(first, refresher.refresh());
  await first;
  assert.equal(failures, 1);
  assert.equal(successes, 0);
  await refresher.refresh();
  assert.equal(calls, 2);
  assert.equal(successes, 1);
  assert.deepEqual(applied, ["before"]);
  refresher.dispose();
});

test("replaced assets ignore stale responses even when the request ignores abort", async () => {
  let resolve!: (media: Media) => void;
  let signal!: AbortSignal;
  const applied: string[] = [];
  let errors = 0,
    successes = 0;
  const refresher = createMediaRefresher({
    assets: { before: "old-asset", after: "sample-after", logo: null },
    fetchMedia: async (_id, requestSignal) => {
      signal = requestSignal;
      return new Promise<Media>((done) => {
        resolve = done;
      });
    },
    onMedia: (slot) => applied.push(slot),
    onError: () => {
      errors++;
    },
    onSuccess: () => {
      successes++;
    },
  });
  const pending = refresher.refresh();
  refresher.dispose();
  assert.equal(signal.aborted, true);
  resolve({ src: "obsolete-private-input", width: 100, height: 100 });
  await pending;
  assert.deepEqual(applied, []);
  assert.equal(errors, 0);
  assert.equal(successes, 0);
});
