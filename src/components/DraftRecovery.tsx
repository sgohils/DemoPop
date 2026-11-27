"use client";
import { useEffect, useRef, useState } from "react";
import {
  readDraft,
  writeDraft,
  removeDraft,
  type Draft,
  type DraftAssets,
} from "../client/drafts";
import type { ProjectInput } from "../shared/project";

export function DraftRecovery({
  scope,
  projectId,
  project,
  dirty,
  assets,
  onRestore,
}: {
  scope: string | null;
  projectId: string | null;
  project: ProjectInput;
  dirty: boolean;
  assets: DraftAssets;
  onRestore: (draft: Draft) => Promise<void>;
}) {
  const key = scope ? `${scope}:${projectId || "new"}` : null;
  const [ready, setReady] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<Draft | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const actionInProgress = useRef(false);
  const actionId = useRef(0);
  const currentKey = useRef(key);
  currentKey.current = key;
  const [pendingAction, setPendingAction] = useState<
    "restore" | "discard" | "retry" | null
  >(null);
  const busy = pendingAction !== null;
  useEffect(() => {
    if (!key) return;
    let live = true;
    actionId.current += 1;
    actionInProgress.current = false;
    setPendingAction(null);
    setReady(null);
    setCandidate(null);
    setError("");
    setMessage("");
    readDraft(key)
      .then((value) => {
        if (live) {
          setCandidate(value);
          setReady(key);
        }
      })
      .catch(() => {
        if (live) {
          setError(
            "Browser draft storage is unavailable. Keep this tab open to preserve your edits.",
          );
        }
      });
    return () => {
      live = false;
    };
  }, [key]);
  useEffect(() => {
    if (!key || ready !== key || candidate || pendingAction) return;
    let live = true;
    if (dirty) setMessage("Saving browser draft…");
    const timer = setTimeout(() => {
      const action = dirty
        ? writeDraft({ key, project, assets, updatedAt: Date.now() })
        : removeDraft(key);
      action
        .then(() => {
          if (live && dirty) {
            setError("");
            setMessage("Draft saved in this browser");
          }
        })
        .catch(() => {
          if (live)
            setError(
              "This draft could not be stored. Keep this tab open or save to your account.",
            );
        });
    }, 650);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [key, ready, candidate, project, dirty, assets, pendingAction]);
  async function restore() {
    if (!candidate || actionInProgress.current) return;
    const actionKey = key;
    const id = ++actionId.current;
    actionInProgress.current = true;
    setPendingAction("restore");
    setError("");
    try {
      await onRestore(candidate);
      if (currentKey.current === actionKey && actionId.current === id) {
        setCandidate(null);
        setMessage(
          scope === "local"
            ? "Draft restored on this device."
            : "Draft restored. Save to your account when ready.",
        );
      }
    } catch {
      if (currentKey.current === actionKey && actionId.current === id)
        setError("The draft could not be restored. Sign in if needed, then retry.");
    } finally {
      if (currentKey.current === actionKey && actionId.current === id) {
        actionInProgress.current = false;
        setPendingAction(null);
      }
    }
  }
  async function discard() {
    if (!key || actionInProgress.current) return;
    const actionKey = key;
    const id = ++actionId.current;
    actionInProgress.current = true;
    setPendingAction("discard");
    setError("");
    setMessage("Discarding draft…");
    try {
      await removeDraft(actionKey);
      if (currentKey.current === actionKey && actionId.current === id) {
        setCandidate(null);
        setMessage("Draft discarded.");
      }
    } catch {
      if (currentKey.current === actionKey && actionId.current === id) {
        setMessage("");
        setError("The draft could not be cleared. Try discarding again.");
      }
    } finally {
      if (currentKey.current === actionKey && actionId.current === id) {
        actionInProgress.current = false;
        setPendingAction(null);
      }
    }
  }
  async function retry() {
    if (!key || actionInProgress.current) return;
    const actionKey = key;
    const id = ++actionId.current;
    actionInProgress.current = true;
    setPendingAction("retry");
    setMessage("");
    setError("");
    try {
      const value = await readDraft(actionKey);
      if (currentKey.current === actionKey && actionId.current === id) {
        setCandidate(value);
        setReady(actionKey);
        setMessage("");
      }
    } catch {
      if (currentKey.current === actionKey && actionId.current === id) {
        setMessage("");
        setError("Browser draft storage is unavailable. Keep this tab open to preserve your edits.");
      }
    } finally {
      if (currentKey.current === actionKey && actionId.current === id) {
        actionInProgress.current = false;
        setPendingAction(null);
      }
    }
  }
  if (!key) return null;
  return (
    <div className="draft-status">
      {candidate ? (
        <div className="draft-recovery">
          <span>
            A draft from {new Date(candidate.updatedAt).toLocaleString()} is
            available on this device.
          </span>
          <button
            className="button secondary small"
            onClick={restore}
            disabled={busy}
          >
            {pendingAction === "restore" ? "Restoring…" : "Restore draft"}
          </button>
          <button className="text-link" onClick={discard} disabled={busy}>
            {pendingAction === "discard" ? "Discarding…" : "Discard draft"}
          </button>
          {message && <span role="status">{message}</span>}
        </div>
      ) : (
        <span role="status">{message || "Drafts stay in this browser."}</span>
      )}
      {pendingAction === "retry" && (
        <span role="status">Checking browser draft storage…</span>
      )}
      {error && (
        <p className="error" role="alert">
          {error}{" "}
          <button
            className="text-link"
            disabled={busy}
            onClick={retry}
          >
            Retry draft storage
          </button>
        </p>
      )}
    </div>
  );
}
