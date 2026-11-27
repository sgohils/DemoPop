import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRenderConcurrency } from "../worker/render-config";

test("render concurrency falls back safely for invalid configuration", () => {
  for (const invalid of ["abc", "1.5", "0", "-1", "Infinity"]) {
    assert.equal(resolveRenderConcurrency(invalid, 8), 2, invalid);
  }
  assert.equal(resolveRenderConcurrency(undefined, 8), 2);
  assert.equal(resolveRenderConcurrency("", 8), 2);
});

test("render concurrency caps explicit values at the CPU limit", () => {
  assert.equal(resolveRenderConcurrency("4", 8), 4);
  assert.equal(resolveRenderConcurrency("24", 8), 8);
});

test("single CPU hosts use concurrency one, including explicit overrides", () => {
  assert.equal(resolveRenderConcurrency(undefined, 1), 1);
  assert.equal(resolveRenderConcurrency("2", 1), 1);
});
