import type { ProjectInput } from "../shared/project";

export type ProjectHistory = {
  entries: ProjectInput[];
  index: number;
  group: string | null;
  editedAt: number;
};
export type HistoryAction =
  | {
      type: "edit";
      value: ProjectInput | ((current: ProjectInput) => ProjectInput);
      at: number;
      atomic?: boolean;
    }
  | { type: "undo" | "redo" }
  | { type: "reset"; value: ProjectInput };

export function createHistory(value: ProjectInput): ProjectHistory {
  return { entries: [value], index: 0, group: null, editedAt: 0 };
}

export function projectHistory(
  state: ProjectHistory,
  action: HistoryAction,
): ProjectHistory {
  if (action.type === "reset") return createHistory(action.value);
  if (action.type === "undo" || action.type === "redo") {
    const index = state.index + (action.type === "undo" ? -1 : 1);
    return index < 0 || index >= state.entries.length
      ? state
      : { ...state, index, group: null };
  }
  if (action.type !== "edit") return state;
  const current = state.entries[state.index];
  const value =
    typeof action.value === "function" ? action.value(current) : action.value;
  const keys = new Set([...Object.keys(current), ...Object.keys(value)]);
  const changed = ([...keys] as (keyof ProjectInput)[]).filter(
    (key) => JSON.stringify(current[key]) !== JSON.stringify(value[key]),
  );
  if (!changed.length) return state;
  let group: string | null =
    changed.length === 1 &&
    [
      "name",
      "opening",
      "highlight1",
      "highlight2",
      "url",
      "cta",
      "beforeCrop",
      "afterCrop",
      "highlight1Crop",
      "highlight2Crop",
      "client",
    ].includes(changed[0])
      ? changed[0]
      : null;
  if (
    changed.length === 1 &&
    changed[0] === "story" &&
    current.story &&
    value.story &&
    current.story.duration === value.story.duration &&
    current.story.scenes.map((scene) => scene.id).join() ===
      value.story.scenes.map((scene) => scene.id).join()
  ) {
    const edited = current.story.scenes
      .map((scene, index) =>
        JSON.stringify(scene) === JSON.stringify(value.story!.scenes[index])
          ? -1
          : index,
      )
      .filter((index) => index >= 0);
    if (edited.length === 1) {
      const index = edited[0],
        before = current.story.scenes[index],
        after = value.story.scenes[index];
      const fields = (Object.keys(before) as (keyof typeof before)[]).filter(
        (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
      );
      if (
        fields.length === 1 &&
        ["caption", "crop", "trimStart"].includes(fields[0])
      )
        group = `story:${before.id}:${fields[0]}`;
    }
  }
  if (
    changed.length === 1 &&
    changed[0] === "hooks" &&
    current.hooks &&
    value.hooks
  ) {
    const edited = current.hooks
      .map((hook, index) => (hook === value.hooks![index] ? -1 : index))
      .filter((index) => index >= 0);
    if (edited.length === 1) group = `hook:${edited[0]}`;
  }
  if (action.atomic) group = null;
  const merge =
    group !== null &&
    group === state.group &&
    action.at - state.editedAt < 750 &&
    state.index === state.entries.length - 1;
  const entries = state.entries.slice(0, state.index + (merge ? 0 : 1));
  entries.push(value);
  if (entries.length > 80) entries.shift();
  return { entries, index: entries.length - 1, group, editedAt: action.at };
}
