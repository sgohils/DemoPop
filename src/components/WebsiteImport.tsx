"use client";
import { useState } from "react";
import { Globe, Loader2, ArrowRight, X } from "lucide-react";
import type { WebsiteImport as ImportResult } from "../server/website-import";

function readImportResult(value: unknown): ImportResult {
  if (!value || typeof value !== "object")
    throw new Error(
      "The website capture returned an unreadable result. Please retry.",
    );

  const result = value as Partial<ImportResult>;
  const validCaptures =
    Array.isArray(result.captures) &&
    result.captures.length === 3 &&
    result.captures.every(
      (capture) =>
        capture &&
        typeof capture.name === "string" &&
        typeof capture.caption === "string" &&
        typeof capture.image === "string" &&
        /^data:image\/png;base64,[a-z\d+/]+=*$/i.test(capture.image),
    );

  if (
    typeof result.url !== "string" ||
    typeof result.name !== "string" ||
    typeof result.opening !== "string" ||
    typeof result.color !== "string" ||
    !/^#[\da-f]{6}$/i.test(result.color) ||
    (result.font !== "dm-sans" && result.font !== "manrope") ||
    typeof result.cta !== "string" ||
    (result.description !== undefined &&
      typeof result.description !== "string") ||
    (result.sections !== undefined && !Array.isArray(result.sections)) ||
    !validCaptures ||
    (result.logo !== null && typeof result.logo !== "string")
  )
    throw new Error(
      "The website capture returned incomplete screenshots. Please retry the capture.",
    );

  return result as ImportResult;
}

export function WebsiteImport({
  onApply,
  disabled,
}: {
  onApply: (result: ImportResult) => Promise<void>;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false),
    [url, setUrl] = useState(""),
    [busy, setBusy] = useState(false),
    [applying, setApplying] = useState(false),
    [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  async function capture() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/website-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const body: unknown = await response.json();
      if (!response.ok)
        throw new Error(
          body &&
            typeof body === "object" &&
            "error" in body &&
            typeof body.error === "string"
            ? body.error
            : "Website import could not finish.",
        );
      setResult(readImportResult(body));
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Website import could not finish. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="website-import kit-panel">
      <button
        type="button"
        className="kit-panel-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Globe size={15} />
        <span>Start from a website</span>
        <span>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="kit-panel-body">
          <p className="section-hint">
            Capture desktop, a feature detail, and mobile. Review the suggested
            branding and words before applying them.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void capture();
            }}
          >
            <label className="field">
              <span>Website URL</span>
              <input
                type="url"
                required
                maxLength={2048}
                placeholder="https://your-product.com"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                disabled={busy || applying}
              />
            </label>
            <button
              className="button secondary small"
              disabled={busy || applying || disabled}
            >
              {busy ? (
                <Loader2 size={14} className="spin" />
              ) : (
                <Globe size={14} />
              )}{" "}
              {busy ? "Capturing website…" : "Capture website"}
            </button>
          </form>
          {busy && (
            <p className="section-hint" role="status">
              Opening the public page and preparing three screenshots. This can
              take up to 35 seconds.
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {result && (
            <div className="import-draft">
              <div className="import-captures">
                {result.captures.map((capture, index) => (
                  <div key={index}>
                    <img src={capture.image} alt={capture.name} />
                    <small>{capture.name}</small>
                  </div>
                ))}
              </div>
              <label className="field">
                <span>Imported project name</span>
                <input
                  maxLength={60}
                  value={result.name}
                  onChange={(event) =>
                    setResult({ ...result, name: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Suggested opening</span>
                <textarea
                  rows={2}
                  maxLength={70}
                  value={result.opening}
                  onChange={(event) =>
                    setResult({ ...result, opening: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Imported brand color</span>
                <input
                  type="color"
                  value={result.color}
                  onChange={(event) =>
                    setResult({ ...result, color: event.target.value })
                  }
                />
              </label>
              {result.captures.map((capture, index) => (
                <label className="field" key={index}>
                  <span>Suggested scene {index + 1} caption</span>
                  <input
                    maxLength={70}
                    value={capture.caption}
                    onChange={(event) =>
                      setResult({
                        ...result,
                        captures: result.captures.map((item, position) =>
                          index === position
                            ? { ...item, caption: event.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                </label>
              ))}
              <p className="section-hint">
                Creates a 30-second Product story. Your current edit remains
                available through Undo.
              </p>
              <div className="kit-actions">
                <button
                  className="button primary small"
                  disabled={
                    applying ||
                    disabled ||
                    !result.name.trim() ||
                    !result.opening.trim() ||
                    result.captures.some((capture) => !capture.caption.trim())
                  }
                  onClick={async () => {
                    setApplying(true);
                    setError("");
                    try {
                      await onApply(result);
                      setResult(null);
                      setOpen(false);
                    } catch (error) {
                      setError(
                        error instanceof Error
                          ? error.message
                          : "This draft could not be applied. Please retry.",
                      );
                    } finally {
                      setApplying(false);
                    }
                  }}
                >
                  {applying ? (
                    <Loader2 className="spin" size={14} />
                  ) : (
                    <ArrowRight size={14} />
                  )}{" "}
                  {applying ? "Preparing your story…" : "Use this draft"}
                </button>
                <button
                  className="text-link"
                  disabled={applying}
                  onClick={() => setResult(null)}
                >
                  <X size={13} /> Discard capture
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
