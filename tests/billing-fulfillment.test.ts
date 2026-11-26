import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
test("canonical Stripe fulfillment validates purchases before granting project access", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "tests/fixtures/billing-fulfillment.ts",
    ],
    { encoding: "utf8", timeout: 30000, windowsHide: true },
  );
  assert.equal(
    result.status,
    0,
    `${result.stdout}\n${result.stderr}\n${result.error || ""}`,
  );
});
