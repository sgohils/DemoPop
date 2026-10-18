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
  const changed = (Object.keys(current) as (keyof ProjectInput)[]).filter(
    (key) => JSON.stringify(current[key]) !== JSON.stringify(value[key]),
  );
  if (!changed.length) return state;
  const group =
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
    ].includes(changed[0])
      ? changed[0]
      : null;
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
