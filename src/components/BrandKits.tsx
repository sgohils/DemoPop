"use client";
import { useEffect, useState } from "react";
import type { BrandKitInput, ProjectInput } from "../shared/project";
type Kit = BrandKitInput & { id: string };
export function BrandKits({
  project,
  authorized,
  onApply,
  onUnauthorized,
}: {
  project: ProjectInput;
  authorized: boolean;
  onApply: (kit: BrandKitInput) => Promise<void>;
  onUnauthorized: () => void;
}) {
  const [kits, setKits] = useState<Kit[]>([]),
    [selected, setSelected] = useState(""),
    [name, setName] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!authorized) return;
    let live = true;
    fetch("/api/brand-kits", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          onUnauthorized();
          throw new Error("Sign in to use your brand kits.");
        }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (live) setKits(data.kits);
      })
      .catch((failure) => {
        if (live) setError(failure.message);
      });
    return () => {
      live = false;
    };
  }, [authorized, revision]); // eslint-disable-line react-hooks/exhaustive-deps
  async function perform(action: "create" | "update" | "delete") {
    if (
      action === "delete" &&
      !window.confirm(
        "Delete this saved brand kit? Projects that already use it keep their settings.",
      )
    )
      return;
    setBusy(true);
    setError("");
    setMessage("");
    const body = {
      name: name.trim() || project.name,
      color: project.color,
      font: project.font,
      logo: project.logo,
      url: project.url,
    };
    try {
      const response = await fetch(
        `/api/brand-kits${action === "create" ? "" : `/${selected}`}`,
        {
          method:
            action === "delete"
              ? "DELETE"
              : action === "create"
                ? "POST"
                : "PUT",
          headers: { "Content-Type": "application/json" },
          body: action === "delete" ? undefined : JSON.stringify(body),
        },
      );
      const data = await response.json();
      if (response.status === 401) onUnauthorized();
      if (!response.ok) throw new Error(data.error);
      setSelected(action === "delete" ? "" : data.id);
      setRevision((x) => x + 1);
      setMessage(
        action === "delete" ? "Brand kit deleted." : "Brand kit saved.",
      );
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function apply(id: string) {
    const kit = kits.find((value) => value.id === id);
    setSelected(id);
    if (!kit) return;
    setName(kit.name);
    setBusy(true);
    setError("");
    try {
      await onApply(kit);
      setMessage(
        "Brand kit applied. Your captions and screenshots stay in place.",
      );
    } catch {
      setError(
        "The brand kit could not be applied. Check your account and retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="brand-kits">
      <label className="field">
        <span>Saved brand kit</span>
        <select
          value={selected}
          onChange={(event) => void apply(event.target.value)}
          disabled={!authorized || busy}
        >
          <option value="">Choose a brand kit</option>
          {kits.map((kit) => (
            <option key={kit.id} value={kit.id}>
              {kit.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Brand kit name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={project.name}
          maxLength={60}
          disabled={!authorized || busy}
        />
      </label>
      <div className="inline-actions">
        <button
          className="button secondary small"
          disabled={!authorized || busy}
          onClick={() => void perform("create")}
        >
          Save new brand kit
        </button>
        {selected && (
          <>
            <button
              className="text-link"
              disabled={busy}
              onClick={() => void perform("update")}
            >
              Update kit
            </button>
            <button
              className="text-link"
              disabled={busy}
              onClick={() => void perform("delete")}
            >
              Delete kit
            </button>
          </>
        )}
      </div>
      {!authorized && (
        <p className="section-hint">
          Sign in to save and reuse your colors, font, logo, and closing website
          address.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}{" "}
          <button
            className="text-link"
            onClick={() => {
              setError("");
              setRevision((x) => x + 1);
            }}
          >
            Retry brand kits
          </button>
        </p>
      )}
      {message && (
        <p role="status" className="section-hint">
          {message}
        </p>
      )}
    </div>
  );
}
