"use client";
import { useReducer, useCallback, type SetStateAction } from "react";
import type { ProjectInput } from "../shared/project";
import { createHistory, projectHistory } from "./project-history";

export function useProjectHistory(initial: ProjectInput) {
  const [history, dispatch] = useReducer(
    projectHistory,
    initial,
    createHistory,
  );
  const project = history.entries[history.index];
  const setProject = useCallback((value: SetStateAction<ProjectInput>) => {
    // Resolve functional updates against the latest queued state in the reducer.
    dispatch({ type: "edit", value, at: Date.now() });
  }, []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  const reset = useCallback(
    (value: ProjectInput) => dispatch({ type: "reset", value }),
    [],
  );
  return {
    project,
    setProject,
    previous: history.entries[history.index - 1],
    next: history.entries[history.index + 1],
    undo,
    redo,
    reset,
  };
}
