import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("billing summaries read monthly free usage without Stripe and keep paid balances and portal access separate", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "tests/fixtures/free-tier-summary.ts",
    ],
    { encoding: "utf8", timeout: 30000, windowsHide: true },
  );
  assert.equal(
    result.status,
    0,
    `${result.stdout}\n${result.stderr}\n${result.error || ""}`,
  );
});
