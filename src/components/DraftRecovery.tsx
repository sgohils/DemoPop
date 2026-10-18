"use client";
import { useEffect, useState } from "react";
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
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!key) return;
    let live = true;
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
        if (live)
          setError(
            "Browser draft storage is unavailable. Keep this tab open to preserve your edits.",
          );
      });
    return () => {
      live = false;
    };
  }, [key, attempt]);
  useEffect(() => {
    if (!key || ready !== key || candidate) return;
    let live = true;
    setMessage(dirty ? "Saving browser draft…" : "");
    const timer = setTimeout(() => {
      const action = dirty
        ? writeDraft({ key, project, assets, updatedAt: Date.now() })
        : removeDraft(key);
      action
        .then(() => {
          if (live) setMessage(dirty ? "Draft saved in this browser" : "");
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
  }, [key, ready, candidate, project, dirty, assets]);
  async function restore() {
    if (!candidate) return;
    setBusy(true);
    setError("");
    try {
      await onRestore(candidate);
      setCandidate(null);
      setMessage(
        scope === "local"
          ? "Draft restored on this device."
          : "Draft restored. Save to your account when ready.",
      );
    } catch {
      setError(
        "The draft could not be restored. Sign in if needed, then retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function discard() {
    if (!key) return;
    try {
      await removeDraft(key);
      setCandidate(null);
      setMessage("");
    } catch {
      setError("The draft could not be cleared. Please retry.");
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
            {busy ? "Restoring…" : "Restore draft"}
          </button>
          <button className="text-link" onClick={discard} disabled={busy}>
            Discard draft
          </button>
        </div>
      ) : (
        <span role="status">{message || "Drafts stay in this browser."}</span>
      )}
      {error && (
        <p className="error" role="alert">
          {error}{" "}
          <button
            className="text-link"
            onClick={() => {
              setError("");
              setAttempt((x) => x + 1);
            }}
          >
            Retry draft storage
          </button>
        </p>
      )}
    </div>
  );
}
