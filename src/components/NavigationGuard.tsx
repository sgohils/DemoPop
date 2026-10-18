"use client";
import { createContext, useContext, useEffect, useRef } from "react";

type Guard = { current: (() => boolean) | null };
const GuardContext = createContext<Guard>({ current: null });
const indexKey = "__demopopHistoryIndex";
const warning = "You have unsaved edits. Leave this project?";

export function useUnsavedChanges(dirty: boolean) {
  const guardRef = useContext(GuardContext);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    const predicate = () => dirtyRef.current;
    guardRef.current = predicate;
    return () => {
      if (guardRef.current === predicate) guardRef.current = null;
    };
  }, [guardRef]);
}

// Track genuine entries rather than adding dummy history entries. A cancelled
// traversal is restored before the App Router receives its popstate event.
export function NavigationGuard({ children }: { children: React.ReactNode }) {
  const guard = useRef<(() => boolean) | null>(null);
  useEffect(() => {
    const history = window.history;
    const originalPush = history.pushState;
    const originalReplace = history.replaceState;
    let index: number = history.state?.[indexKey] ?? 0;
    let restoring: number | null = null;
    let approvedUnload = false;
    originalReplace.call(history, { ...history.state, [indexKey]: index }, "");

    const push: History["pushState"] = function (state, unused, url) {
      // Next can retain a wrapper from React's development effect replay.
      // Read the actual entry so nested wrappers agree after Back/Forward.
      const nextIndex = (history.state?.[indexKey] ?? index) + 1;
      originalPush.call(
        history,
        { ...state, [indexKey]: nextIndex },
        unused,
        url,
      );
      index = nextIndex;
      approvedUnload = false;
    };
    const replace: History["replaceState"] = function (state, unused, url) {
      index = history.state?.[indexKey] ?? index;
      originalReplace.call(
        history,
        { ...state, [indexKey]: index },
        unused,
        url,
      );
    };
    history.pushState = push;
    history.replaceState = replace;

    const pop = (event: PopStateEvent) => {
      const destination = event.state?.[indexKey];
      if (typeof destination !== "number") return; // Cross-document: beforeunload handles it.
      if (restoring !== null) {
        event.stopImmediatePropagation();
        if (destination === restoring) {
          index = restoring;
          restoring = null;
        } else {
          history.go(restoring - destination);
        }
        return;
      }
      if (
        destination !== index &&
        guard.current?.() &&
        !window.confirm(warning)
      ) {
        event.stopImmediatePropagation();
        restoring = index;
        history.go(index - destination);
        return;
      }
      index = destination;
      approvedUnload = false;
    };
    const click = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (
        !link ||
        link.hasAttribute("download") ||
        (link.target && link.target !== "_self")
      )
        return;
      const target = new URL(link.href, location.href);
      if (
        target.origin === location.origin &&
        target.pathname === location.pathname &&
        target.search === location.search
      )
        return;
      if (guard.current?.()) {
        if (!window.confirm(warning)) {
          event.preventDefault();
          event.stopImmediatePropagation();
        } else {
          approvedUnload = true;
        }
      }
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (!approvedUnload && guard.current?.()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("popstate", pop, true);
    document.addEventListener("click", click, true);
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("popstate", pop, true);
      document.removeEventListener("click", click, true);
      window.removeEventListener("beforeunload", unload);
      if (history.pushState === push) history.pushState = originalPush;
      if (history.replaceState === replace)
        history.replaceState = originalReplace;
    };
  }, []);
  return (
    <GuardContext.Provider value={guard}>{children}</GuardContext.Provider>
  );
}
