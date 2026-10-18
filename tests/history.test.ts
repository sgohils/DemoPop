import { test } from "node:test";
import assert from "node:assert/strict";
import { createHistory, projectHistory } from "../src/client/project-history";
import { sampleProject } from "../src/shared/project";

test("editor history groups typing, keeps separate changes, and branches safely after undo", () => {
  let state = createHistory(sampleProject);
  state = projectHistory(state, {
    type: "edit",
    value: { ...sampleProject, opening: "A" },
    at: 1000,
  });
  state = projectHistory(state, {
    type: "edit",
    value: (current) => ({ ...current, opening: "A better reveal" }),
    at: 1200,
  });
  assert.equal(state.entries.length, 2);
  state = projectHistory(state, {
    type: "edit",
    value: (current) => ({ ...current, format: "landscape" }),
    at: 1300,
  });
  state = projectHistory(state, { type: "undo" });
  assert.equal(state.entries[state.index].format, "vertical");
  assert.equal(state.entries[state.index].opening, "A better reveal");
  state = projectHistory(state, { type: "undo" });
  assert.deepEqual(state.entries[state.index], sampleProject);
  state = projectHistory(state, { type: "redo" });
  state = projectHistory(state, {
    type: "edit",
    value: (current) => ({ ...current, opening: "A different direction" }),
    at: 1400,
  });
  assert.equal(state.index, state.entries.length - 1);
  assert.equal(state.entries[state.index - 1].opening, "A better reveal");
  assert.strictEqual(projectHistory(state, { type: "redo" }), state);
  state = projectHistory(state, { type: "reset", value: sampleProject });
  assert.equal(state.entries.length, 1);
  assert.strictEqual(projectHistory(state, { type: "undo" }), state);
});

test("history resolves queued functional edits and bounds retained snapshots", () => {
  let state = createHistory(sampleProject);
  for (let count = 0; count < 100; count++) {
    state = projectHistory(state, {
      type: "edit",
      value: (current) => ({ ...current, name: `${current.name}!` }),
      at: count * 1000,
    });
  }
  assert.equal(state.entries.length, 80);
  assert.equal(
    state.entries[state.index].name,
    sampleProject.name + "!".repeat(100),
  );
  const unchanged = projectHistory(state, {
    type: "edit",
    value: (current) => current,
    at: 200000,
  });
  assert.strictEqual(unchanged, state);
});
