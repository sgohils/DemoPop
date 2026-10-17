"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Upload,
  RotateCcw,
  Download,
  Check,
  Loader2,
  ChevronDown,
  ImagePlus,
  X,
  Save,
  Film,
  AlertCircle,
} from "lucide-react";
import { Brand } from "./Brand";
import { Preview } from "./Preview";
import {
  sampleProject,
  sampleMedia,
  projectSchema,
  defaultCrop,
  MAX_UPLOAD,
  type ProjectInput,
  type VideoProps,
  type Media,
} from "../shared/project";
type Job = {
  id: string;
  status: "queued" | "rendering" | "completed" | "failed";
  progress: number;
  attempt_count: number;
  error: string | null;
};
async function api(url: string, method = "GET", body?: unknown) {
  const r = await fetch(`/api/${url}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Please retry.");
  return data;
}
export function Editor({
  initialId,
  configured,
}: {
  initialId: string;
  configured: boolean;
}) {
  const [project, setProject] = useState<ProjectInput>(sampleProject);
  const [media, setMedia] = useState(sampleMedia());
  const [id, setId] = useState(initialId === "new" ? null : initialId);
  const [saved, setSaved] = useState(
    initialId === "new" ? "" : JSON.stringify(sampleProject),
  );
  const [loading, setLoading] = useState(initialId !== "new");
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false),
    [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  const [mobile, setMobile] = useState<"preview" | "settings">("preview");
  const [cropOpen, setCropOpen] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null),
    [jobError, setJobError] = useState("");
  const [jobPanel, setJobPanel] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const objectUrls = useRef<string[]>([]);
  const modalRef = useRef<HTMLElement>(null);
  const dirty = JSON.stringify(project) !== saved;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (!jobPanel) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = modalRef.current;
    dialog?.querySelector<HTMLButtonElement>("button")?.focus();
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setJobPanel(false);
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      const items = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "button:not(:disabled),a[href],input:not(:disabled)",
        ),
      );
      const first = items[0],
        last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => {
      window.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [jobPanel]);
  useEffect(() => {
    if (initialId === "new") return;
    api(`projects/${initialId}`)
      .then((data) => {
        setProject(data.project);
        setMedia(data.media);
        setSaved(JSON.stringify(data.project));
        if (data.job) setJob(data.job);
      })
      .catch((e) => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, [initialId]);
  useEffect(() => {
    const urls = objectUrls.current;
    const warn = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const nav = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a[href]");
      if (
        target &&
        dirtyRef.current &&
        !target.hasAttribute("download") &&
        target.getAttribute("href")?.startsWith("/") &&
        !window.confirm("You have unsaved edits. Leave this project?")
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", nav, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", nav, true);
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);
  useEffect(() => {
    if (!job || !["queued", "rendering"].includes(job.status)) return;
    let live = true;
    const poll = async () => {
      try {
        const data = await api(`jobs/${job.id}`);
        if (live) {
          setJob(data.job);
          setJobError("");
        }
      } catch (e) {
        if (live)
          setJobError(
            `Progress is temporarily unavailable. ${(e as Error).message}`,
          );
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 2000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [job?.id, job?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!configured) return;
    const timer = setInterval(
      () => {
        for (const [key, asset] of [
          ["before", project.before],
          ["after", project.after],
          ["logo", project.logo],
        ] as const) {
          if (asset && !asset.startsWith("sample-"))
            api(`assets/${asset}`)
              .then((value) => setMedia((m) => ({ ...m, [key]: value })))
              .catch(() => {});
        }
      },
      50 * 60 * 1000,
    );
    return () => clearInterval(timer);
  }, [configured, project.before, project.after, project.logo]);
  function update<K extends keyof ProjectInput>(
    key: K,
    value: ProjectInput[K],
  ) {
    setProject((p) => ({ ...p, [key]: value }));
    setNotice("");
  }
  function validated() {
    const result = projectSchema.safeParse(project);
    if (!result.success)
      throw new Error(
        result.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      );
    return result.data;
  }
  async function save() {
    setSaving(true);
    setError("");
    try {
      const p = validated();
      if (id) await api(`projects/${id}`, "PUT", p);
      else {
        const data = await api("projects", "POST", p);
        setId(data.id);
        window.history.replaceState(null, "", `/editor/${data.id}`);
      }
      setProject((current) =>
        JSON.stringify(current) === JSON.stringify(project) ? p : current,
      );
      setSaved(JSON.stringify(p));
      setNotice("Project saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function startExport() {
    setExporting(true);
    setError("");
    try {
      const p = validated();
      let projectId = id;
      if (!projectId) {
        const data = await api("projects", "POST", p);
        projectId = data.id;
        setId(projectId);
        window.history.replaceState(null, "", `/editor/${projectId}`);
      }
      const data = await api("exports", "POST", { projectId, project: p });
      setProject((current) =>
        JSON.stringify(current) === JSON.stringify(project) ? p : current,
      );
      setSaved(JSON.stringify(p));
      const current = await api(`jobs/${data.id}`);
      setJob(current.job);
      setJobPanel(true);
      setNotice("Export started. Later edits apply to your next export.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  async function upload(
    key: "before" | "after" | "logo",
    file: File | undefined,
  ) {
    if (!file) return;
    setUploading(key);
    setError("");
    try {
      if (file.size > MAX_UPLOAD)
        throw new Error("Choose an image smaller than 10 MB.");
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
        throw new Error("Choose a PNG, JPEG, or WebP image.");
      let next: Media, assetId: string;
      if (configured) {
        const r = await fetch("/api/assets", {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: file,
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        next = data.media;
        assetId = data.id;
      } else {
        const bitmap = await createImageBitmap(file);
        if (
          bitmap.width * bitmap.height > 40_000_000 ||
          bitmap.width < 64 ||
          bitmap.height < 64
        ) {
          bitmap.close();
          throw new Error(
            "Use a still image of at least 64 × 64 pixels and at most 40 megapixels.",
          );
        }
        const src = URL.createObjectURL(file);
        objectUrls.current.push(src);
        next = { src, width: bitmap.width, height: bitmap.height };
        bitmap.close();
        assetId = crypto.randomUUID();
        setNotice(
          "Local preview only. Configure Supabase to upload, save, and export this image.",
        );
      }
      setMedia((m) => ({ ...m, [key]: next }));
      setProject((p) => ({
        ...p,
        [key]: assetId,
        ...(key !== "logo" ? { [`${key}Crop`]: { ...defaultCrop } } : {}),
      }));
    } catch (e) {
      setError(
        (e as Error).message ||
          "This image could not be opened. Try a different file.",
      );
    } finally {
      setUploading(null);
    }
  }
  async function retry() {
    if (!job) return;
    setJobError("");
    setExporting(true);
    try {
      await api(`jobs/${job.id}/retry`, "POST");
      setJob((j) =>
        j ? { ...j, status: "queued", progress: 0, error: null } : null,
      );
    } catch (e) {
      setJobError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  async function download() {
    if (!job) return;
    setDownloading(true);
    setJobError("");
    try {
      const data = await api(`jobs/${job.id}/download`);
      const a = document.createElement("a");
      a.href = data.url;
      a.download = "demopop-redesign.mp4";
      a.click();
    } catch (e) {
      setJobError((e as Error).message);
    } finally {
      setDownloading(false);
    }
  }
  const activeJob = job && ["queued", "rendering"].includes(job.status);
  function field(
    key: "name" | "opening" | "highlight1" | "highlight2" | "url",
    label: string,
    max: number,
    multiline = false,
  ) {
    return (
      <label className="field">
        <span>
          {label}
          <small>
            {project[key].length}/{max}
          </small>
        </span>
        {multiline ? (
          <textarea
            rows={3}
            value={project[key]}
            maxLength={max}
            onChange={(e) => update(key, e.target.value)}
          />
        ) : (
          <input
            value={project[key]}
            maxLength={max}
            onChange={(e) => update(key, e.target.value)}
          />
        )}
      </label>
    );
  }
  function assetCard(key: "before" | "after") {
    const asset = media[key];
    const cropKey = key === "before" ? "beforeCrop" : "afterCrop";
    const crop = project[cropKey];
    return (
      <div className="asset-card">
        <div className="asset-card-top">
          <span className={`asset-pill ${key}`}>
            {key === "before" ? "Before" : "After"}
          </span>
          <span className="muted">
            {key === "before" ? "The starting point" : "The transformation"}
          </span>
        </div>
        <label className="upload-area">
          <img
            src={asset.src}
            alt={`${key} website screenshot`}
            style={{ objectPosition: `${crop.x * 100}% ${crop.y * 100}%` }}
          />
          <span className="upload-overlay">
            {uploading === key ? (
              <Loader2 className="spin" size={19} />
            ) : (
              <Upload size={17} />
            )}
            <span>
              {uploading === key ? "Uploading…" : "Replace screenshot"}
            </span>
          </span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={!!uploading}
            onChange={(e) => {
              void upload(key, e.target.files?.[0]);
              e.target.value = "";
            }}
            aria-label={`Upload ${key} screenshot`}
          />
        </label>
        <button
          className="crop-toggle"
          aria-expanded={cropOpen === key}
          onClick={() => setCropOpen(cropOpen === key ? null : key)}
        >
          Position & zoom{" "}
          <ChevronDown
            size={14}
            style={{
              transform: cropOpen === key ? "rotate(180deg)" : undefined,
            }}
          />
        </button>
        {cropOpen === key && (
          <div className="crop-controls">
            {(["x", "y", "zoom"] as const).map((axis) => (
              <label key={axis}>
                <span>
                  {axis === "x"
                    ? "Horizontal"
                    : axis === "y"
                      ? "Vertical"
                      : "Zoom"}
                  <small>
                    {axis === "zoom"
                      ? `${Math.round(crop[axis] * 100)}%`
                      : `${Math.round(crop[axis] * 100)}%`}
                  </small>
                </span>
                <input
                  type="range"
                  min={axis === "zoom" ? 1 : 0}
                  max={axis === "zoom" ? 2 : 1}
                  step="0.01"
                  value={crop[axis]}
                  onChange={(e) =>
                    update(cropKey, { ...crop, [axis]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
            <button
              className="text-link"
              onClick={() => update(cropKey, { ...defaultCrop })}
            >
              <RotateCcw size={12} /> Reset position
            </button>
          </div>
        )}
      </div>
    );
  }
  if (loading)
    return (
      <main className="loading-page" role="status">
        <Loader2 className="spin" /> Opening your project…
      </main>
    );
  if (loadError)
    return (
      <main className="loading-page">
        <AlertCircle />
        <p role="alert">{loadError}</p>
        <Link href="/projects">Back to projects</Link>
      </main>
    );
  return (
    <div className="editor">
      <header className="editor-header">
        <Brand />
        <span className="header-divider" />
        <Link className="back-projects" href="/projects">
          <ArrowLeft size={15} />
          <span>Projects</span>
        </Link>
        <div className="editor-title">
          <span>{project.name || "Untitled project"}</span>
          <small role="status">
            {saving ? (
              <>
                <Loader2 size={11} className="spin" /> Saving…
              </>
            ) : dirty ? (
              <>
                <span className="unsaved-dot" />
                {id ? "Unsaved changes" : "Not saved"}
              </>
            ) : (
              <>
                <Check size={12} /> Saved
              </>
            )}
          </small>
        </div>
        <div className="header-actions">
          <button
            className="button secondary small"
            disabled={
              !configured || saving || exporting || !!uploading || !dirty
            }
            title={
              !configured ? "Configure Supabase to save projects" : undefined
            }
            onClick={save}
          >
            <Save size={15} />
            <span>Save</span>
          </button>
          <button
            className="button primary small"
            disabled={
              !configured || saving || exporting || !!uploading || !!activeJob
            }
            title={
              !configured
                ? "Cloud export requires Supabase and a running worker"
                : undefined
            }
            onClick={startExport}
          >
            {exporting ? (
              <Loader2 className="spin" size={16} />
            ) : (
              <Download size={16} />
            )}
            <span>{activeJob ? "Export in progress" : "Export video"}</span>
          </button>
        </div>
      </header>
      <div className="mobile-tabs">
        <button
          aria-pressed={mobile === "preview"}
          onClick={() => setMobile("preview")}
        >
          Preview
        </button>
        <button
          aria-pressed={mobile === "settings"}
          onClick={() => setMobile("settings")}
        >
          Settings
        </button>
      </div>
      <div className="editor-body">
        <aside
          className={`settings-panel ${mobile === "settings" ? "mobile-visible" : ""}`}
        >
          <div className="panel-heading">
            <div className="eyebrow">MAKE IT YOURS</div>
            <h1>The details</h1>
            <p>A few small inputs. A big reveal.</p>
          </div>
          <section className="settings-section">
            <h2>
              <span>01</span> Your screenshots
            </h2>
            <p className="section-hint">PNG, JPEG or WebP · up to 10 MB each</p>
            <div className="assets-grid">
              {assetCard("before")}
              {assetCard("after")}
            </div>
          </section>
          <section className="settings-section">
            <h2>
              <span>02</span> Tell the story
            </h2>
            {field("name", "Project name", 60)}
            {field("opening", "Opening caption", 70, true)}
            {field("highlight1", "First highlight", 48)}
            {field("highlight2", "Second highlight", 48)}
          </section>
          <section className="settings-section">
            <h2>
              <span>03</span> Make your mark
            </h2>
            <label className="field">
              <span>Brand color</span>
              <div className="color-field">
                <input
                  type="color"
                  aria-label="Choose brand color"
                  value={project.color}
                  onChange={(e) => update("color", e.target.value)}
                />
                <span>{project.color.toUpperCase()}</span>
                <span className="color-preview">Aa</span>
              </div>
            </label>
            <div className="field">
              <span>
                Logo <small>Optional</small>
              </span>
              {media.logo ? (
                <div className="logo-preview">
                  <img src={media.logo.src} alt="Project logo" />
                  <button
                    aria-label="Remove logo"
                    onClick={() => {
                      update("logo", null);
                      setMedia((m) => ({ ...m, logo: null }));
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <label className="logo-upload">
                  <ImagePlus size={17} />
                  {uploading === "logo" ? "Uploading…" : "Add your logo"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    aria-label="Upload optional logo"
                    disabled={!!uploading}
                    onChange={(e) => {
                      void upload("logo", e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
            {field("url", "Closing URL text", 80)}
            <p className="section-hint">Shown as text in your video.</p>
          </section>
          <div className="sidebar-end">
            <Film size={15} /> One template. All about your work.
          </div>
        </aside>
        <main
          className={`preview-panel ${mobile === "preview" ? "mobile-visible" : ""}`}
        >
          <div className="preview-heading">
            <div>
              <span className="eyebrow">THE REVEAL</span>
              <h2>A new perspective.</h2>
            </div>
            <span className="template-tag">
              <span className="blue-dot" /> Reveal / 01
            </span>
          </div>
          {!configured && (
            <div className="local-notice">
              <span className="local-tag">LOCAL PREVIEW</span>
              <span>
                Edit, upload locally, and play. Cloud saving and export need
                Supabase setup.
              </span>
              <Link href="/auth" aria-label="Account setup information">
                <ArrowUpRight size={15} />
              </Link>
            </div>
          )}
          {error && (
            <div className="error editor-message" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={15} />
              </button>
            </div>
          )}
          {notice && (
            <div className="success-message" role="status">
              {notice}
            </div>
          )}
          <div className="editor-stage">
            <div className="editor-stage-grid" />
            <Preview input={{ project, ...media } as VideoProps} />
          </div>
          <div className="preview-footer">
            <span>
              VERTICAL <span>·</span> 1080 × 1920 <span>·</span> 30 FPS
            </span>
            <span>15 seconds, made to make an impression.</span>
          </div>
          {job && (
            <button
              className={`job-summary ${job.status}`}
              onClick={() => setJobPanel(true)}
            >
              {activeJob ? (
                <Loader2 size={16} className="spin" />
              ) : job.status === "completed" ? (
                <Check size={16} />
              ) : (
                <AlertCircle size={16} />
              )}
              <span>
                {job.status === "queued"
                  ? "Waiting for a render worker"
                  : job.status === "rendering"
                    ? `Rendering · ${Math.floor(job.progress * 100)}%`
                    : job.status === "completed"
                      ? "Your video is ready to download"
                      : "Export failed — view details"}
              </span>
              <ArrowUpRight size={16} />
            </button>
          )}
          {!configured && (
            <p className="local-render-tip">
              Render the original sample locally:{" "}
              <code>npm run render:sample</code>
            </p>
          )}
        </main>
      </div>
      {jobPanel && job && (
        <div className="modal-backdrop" onClick={() => setJobPanel(false)}>
          <section
            ref={modalRef}
            className="export-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setJobPanel(false)}
              aria-label="Close export status"
            >
              <X size={20} />
            </button>
            <div className="eyebrow">YOUR BIG REVEAL</div>
            <h2 id="export-title">
              {job.status === "completed"
                ? "Ready for the spotlight."
                : job.status === "failed"
                  ? "Let’s try that again."
                  : job.status === "queued"
                    ? "You’re in the queue."
                    : "Making it move."}
            </h2>
            <p>
              {job.status === "queued"
                ? "Waiting for an available worker. You can keep editing."
                : job.status === "rendering"
                  ? "Rendering your 15-second MP4 in the background."
                  : job.status === "completed"
                    ? "1080 × 1920 · 30 fps · H.264 MP4"
                    : job.error}
            </p>
            {activeJob && (
              <>
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-label="Render progress"
                  aria-valuenow={Math.floor(job.progress * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div style={{ width: `${job.progress * 100}%` }} />
                </div>
                <p className="progress-copy">
                  {job.status === "queued"
                    ? "Queued — no rendering progress yet"
                    : `${Math.floor(job.progress * 100)}% rendered`}
                  <span>Attempt {job.attempt_count}/3</span>
                </p>
              </>
            )}
            {jobError && (
              <p className="error" role="alert">
                {jobError}
              </p>
            )}
            {job.status === "completed" && (
              <button
                className="button primary"
                onClick={download}
                disabled={downloading}
              >
                <Download size={17} />
                {downloading ? "Preparing download…" : "Download MP4"}
              </button>
            )}
            {job.status === "failed" && job.attempt_count < 3 && (
              <button
                className="button primary"
                disabled={exporting}
                onClick={retry}
              >
                <RotateCcw size={16} />
                {exporting ? "Retrying…" : "Retry this export"}
              </button>
            )}
            <p className="export-footnote">
              This export uses the settings captured when you started it. Retry
              uses that same snapshot.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
