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
  Undo2,
  Redo2,
  ArrowLeftRight,
} from "lucide-react";
import "./editor.css";
import { Brand } from "./Brand";
import { Preview } from "./Preview";
import { EditorSignIn } from "./EditorSignIn";
import { useUnsavedChanges } from "./NavigationGuard";
import { createMediaRefresher } from "../shared/private-media";
import { BrandKits } from "./BrandKits";
import { DraftRecovery } from "./DraftRecovery";
import { ExportHistory, type HistoryJob } from "./ExportHistory";
import { removeDraft, type Draft, type DraftAssets } from "../client/drafts";
import { useProjectHistory } from "../client/use-project-history";
import { BrandColor } from "./BrandColor";
import { MotionControls } from "./MotionControls";
import {
  sampleProject,
  sampleMedia,
  sampleAsset,
  SAMPLE_ASSETS,
  newProject,
  projectSchema,
  defaultCrop,
  MAX_UPLOAD,
  type ProjectInput,
  type VideoProps,
  type Media,
  type BrandKitInput,
  TEMPLATES,
  FONTS,
  videoSettings,
} from "../shared/project";
import { videoScenes } from "../shared/scenes";
type Job = HistoryJob;
class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function api(
  url: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
) {
  const r = await fetch(`/api/${url}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal,
  });
  const data = await r.json();
  if (!r.ok) throw new ApiError(data.error || "Please retry.", r.status);
  return data;
}
export function Editor({
  initialId,
  configured,
  initialStyle,
}: {
  initialId: string;
  configured: boolean;
  initialStyle?: {
    template?: ProjectInput["template"];
    format?: ProjectInput["format"];
  };
}) {
  const initialProject = useRef(
    initialId === "new" ? newProject(initialStyle) : sampleProject,
  ).current;
  const history = useProjectHistory(initialProject);
  const { project, setProject, reset: resetProject } = history;
  const [media, setMedia] = useState(() => ({
    before: sampleAsset(initialProject.before)!,
    after: sampleAsset(initialProject.after)!,
    logo: null as Media | null,
  }));
  const assetCatalog = useRef(
    new Map<string, Media>(
      Object.keys(SAMPLE_ASSETS).map((asset) => [asset, sampleAsset(asset)!]),
    ),
  );
  const [focusFrame, setFocusFrame] = useState<{
    frame: number;
    request: number;
  }>();
  const [dragging, setDragging] = useState<string | null>(null);
  const [id, setId] = useState(initialId === "new" ? null : initialId);
  const [saved, setSaved] = useState(
    initialId === "new" ? "" : JSON.stringify(sampleProject),
  );
  const [loading, setLoading] = useState(initialId !== "new");
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [localAssets, setLocalAssets] = useState<DraftAssets>({});
  const [saving, setSaving] = useState(false),
    [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [authenticated, setAuthenticated] = useState<boolean | null>(
    configured ? null : false,
  );
  const [refreshError, setRefreshError] = useState("");
  const refreshMedia = useRef<() => Promise<void>>(async () => {});
  const sessionVersion = useRef(0);
  const authEpoch = useRef(0);
  const authenticatedRef = useRef(authenticated);
  authenticatedRef.current = authenticated;
  const [mediaVersion, setMediaVersion] = useState(0);
  const loadedId = useRef<string | null>(null);
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
  const draftDirty =
    dirty &&
    (!!id || JSON.stringify(project) !== JSON.stringify(initialProject));
  const dimensions = videoSettings(project);
  const draftScope = configured ? userId : "local";
  const projectRef = useRef(project);
  projectRef.current = project;
  useEffect(() => {
    assetCatalog.current.set(project.before, media.before);
    assetCatalog.current.set(project.after, media.after);
    if (project.logo && media.logo)
      assetCatalog.current.set(project.logo, media.logo);
  }, [project.before, project.after, project.logo, media]);
  function moveHistory(direction: "undo" | "redo") {
    const target = direction === "undo" ? history.previous : history.next;
    if (!target || uploading || saving || exporting) return;
    setMedia({
      before: assetCatalog.current.get(target.before) || media.before,
      after: assetCatalog.current.get(target.after) || media.after,
      logo: target.logo ? assetCatalog.current.get(target.logo) || null : null,
    });
    history[direction]();
    setNotice("");
  }
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.closest(
          "input,textarea,select,[contenteditable='true'],[role='dialog']",
        )
      )
        return;
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "z"
      ) {
        event.preventDefault();
        moveHistory(event.shiftKey ? "redo" : "undo");
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });
  function showScene(name: string) {
    const frame =
      videoScenes(project.template).find((scene) => scene.name === name)
        ?.preview || 0;
    setFocusFrame((value) => ({ frame, request: (value?.request || 0) + 1 }));
  }
  useUnsavedChanges(!loading && !loadError && draftDirty);
  function handleAuthFailure(failure: unknown, epoch: number) {
    if (
      epoch === authEpoch.current &&
      failure instanceof ApiError &&
      failure.status === 401
    ) {
      sessionVersion.current++;
      setAuthenticated(false);
      setJobPanel(false);
    }
  }
  function reportFailure(failure: unknown, epoch = authEpoch.current) {
    if (epoch !== authEpoch.current) return;
    handleAuthFailure(failure, epoch);
    setError((failure as Error).message);
  }
  function signedIn() {
    sessionVersion.current++;
    authEpoch.current++;
    setAuthenticated(true);
    setMediaVersion((version) => version + 1);
    setLoadAttempt((attempt) => attempt + 1);
    setError("");
    setNotice(
      "Signed in. Your edits are still here; save or export when ready.",
    );
    void api("session")
      .then((identity) => setUserId(identity.userId || null))
      .catch(() => {});
  }
  useEffect(() => {
    if (!configured) return;
    let live = true;
    const checkSession = async () => {
      const version = ++sessionVersion.current;
      try {
        const identity = await api("session");
        if (live && version === sessionVersion.current) {
          setUserId(identity.userId || null);
          if (authenticatedRef.current !== true) {
            authEpoch.current++;
            setMediaVersion((value) => value + 1);
            setLoadAttempt((attempt) => attempt + 1);
          }
          setAuthenticated(true);
        }
      } catch (failure) {
        if (live && version === sessionVersion.current) {
          setAuthenticated(false);
          if (!(failure instanceof ApiError && failure.status === 401))
            setError(
              "Account status is temporarily unavailable. Sign in or try again.",
            );
        }
      }
    };
    const visible = () => {
      if (document.visibilityState === "visible") void checkSession();
    };
    void checkSession();
    window.addEventListener("focus", checkSession);
    document.addEventListener("visibilitychange", visible);
    return () => {
      live = false;
      window.removeEventListener("focus", checkSession);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [configured]);
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
    if (initialId === "new" || loadedId.current === initialId) return;
    setLoading(true);
    setLoadError("");
    const epoch = authEpoch.current;
    let live = true;
    const controller = new AbortController();
    api(`projects/${initialId}`, "GET", undefined, controller.signal)
      .then((data) => {
        if (!live) return;
        loadedId.current = initialId;
        setId(initialId);
        resetProject(data.project);
        setMedia(data.media);
        setSaved(JSON.stringify(data.project));
        if (data.job) setJob(data.job);
      })
      .catch((e) => {
        if (live) {
          handleAuthFailure(e, epoch);
          setLoadError(e.message);
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [initialId, loadAttempt, resetProject]);
  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);
  useEffect(() => {
    if (!job || !["queued", "rendering"].includes(job.status)) return;
    let live = true;
    const poll = async () => {
      const epoch = authEpoch.current;
      try {
        const data = await api(`jobs/${job.id}`);
        if (live) {
          setJob(data.job);
          setJobError("");
        }
      } catch (e) {
        if (live) {
          handleAuthFailure(e, epoch);
          setJobError(
            `Progress is temporarily unavailable. ${(e as Error).message}`,
          );
        }
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
    const epoch = authEpoch.current;
    const refresher = createMediaRefresher({
      assets: {
        before: project.before,
        after: project.after,
        logo: project.logo,
      },
      fetchMedia: (asset, signal) =>
        api(`assets/${asset}`, "GET", undefined, signal),
      onMedia: (key, asset, value) => {
        if (projectRef.current[key] === asset)
          setMedia((m) => ({ ...m, [key]: value }));
      },
      onError: (failure) => {
        if (epoch !== authEpoch.current) return;
        if (failure instanceof ApiError && failure.status === 401) {
          sessionVersion.current++;
          setAuthenticated(false);
        }
        setRefreshError(
          "Image access could not be refreshed. Your edits are still here. Sign in if needed, then retry.",
        );
      },
      onSuccess: () => setRefreshError(""),
    });
    refreshMedia.current = () => refresher.refresh();
    const refresh = () => {
      void refresher.refresh();
    };
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const timer = setInterval(refresh, 50 * 60 * 1000);
    if (mediaVersion > 0) refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      refresher.dispose();
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [configured, project.before, project.after, project.logo, mediaVersion]);
  async function restoreDraft(draft: Draft) {
    try {
      const restored = sampleMedia();
      for (const key of ["before", "after", "logo"] as const) {
        const asset = draft.project[key];
        if (!asset) {
          if (key === "logo") restored.logo = null;
          continue;
        }
        const local = draft.assets[asset];
        if (local) {
          if (!(local.blob instanceof Blob) || local.blob.size > MAX_UPLOAD)
            throw new Error("Draft image is invalid.");
          const bitmap = await createImageBitmap(local.blob);
          if (
            bitmap.width < 64 ||
            bitmap.height < 64 ||
            bitmap.width * bitmap.height > 40_000_000
          ) {
            bitmap.close();
            throw new Error("Draft image is invalid.");
          }
          const src = URL.createObjectURL(local.blob);
          objectUrls.current.push(src);
          restored[key] = { src, width: bitmap.width, height: bitmap.height };
          bitmap.close();
        } else if (sampleAsset(asset)) restored[key] = sampleAsset(asset)!;
        else if (configured) restored[key] = await api(`assets/${asset}`);
        else throw new Error("Draft image is unavailable.");
      }
      setLocalAssets(draft.assets);
      setMedia(restored);
      setProject(draft.project);
      setNotice("Browser draft restored.");
    } catch (failure) {
      reportFailure(failure);
      throw failure;
    }
  }
  async function applyBrand(kit: BrandKitInput) {
    try {
      const logo = kit.logo ? await api(`assets/${kit.logo}`) : null;
      setMedia((value) => ({ ...value, logo }));
      setProject((value) => ({
        ...value,
        color: kit.color,
        font: kit.font,
        logo: kit.logo,
        url: kit.url || value.url,
      }));
    } catch (failure) {
      reportFailure(failure);
      throw failure;
    }
  }
  async function clearStoredDraft(previousId: string | null) {
    if (draftScope)
      await removeDraft(`${draftScope}:${previousId || "new"}`).catch(() => {});
  }
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
    const epoch = authEpoch.current;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const p = validated();
      if (id) await api(`projects/${id}`, "PUT", p);
      else {
        const data = await api("projects", "POST", p);
        setId(data.id);
        loadedId.current = data.id;
        window.history.replaceState(
          window.history.state,
          "",
          `/editor/${data.id}`,
        );
      }
      setProject((current) =>
        JSON.stringify(current) === JSON.stringify(project) ? p : current,
      );
      setSaved(JSON.stringify(p));
      await clearStoredDraft(id);
      setNotice("Project saved.");
    } catch (e) {
      reportFailure(e, epoch);
    } finally {
      setSaving(false);
    }
  }
  async function startExport() {
    const epoch = authEpoch.current;
    setExporting(true);
    setError("");
    setNotice("");
    try {
      const p = validated();
      let projectId = id;
      if (!projectId) {
        const data = await api("projects", "POST", p);
        projectId = data.id;
        setId(projectId);
        loadedId.current = projectId;
        window.history.replaceState(
          window.history.state,
          "",
          `/editor/${projectId}`,
        );
      }
      const data = await api("exports", "POST", { projectId, project: p });
      setProject((current) =>
        JSON.stringify(current) === JSON.stringify(project) ? p : current,
      );
      setSaved(JSON.stringify(p));
      await clearStoredDraft(id);
      const current = await api(`jobs/${data.id}`);
      setJob(current.job);
      setJobPanel(true);
      setNotice(
        data.reused
          ? "Showing the existing export with its earlier captured settings. Your submitted settings are saved for your next export."
          : "Export started. Later edits apply to your next export.",
      );
    } catch (e) {
      reportFailure(e, epoch);
    } finally {
      setExporting(false);
    }
  }
  async function upload(
    key: "before" | "after" | "logo",
    file: File | undefined,
  ) {
    if (!file) return;
    const epoch = authEpoch.current;
    setUploading(key);
    setError("");
    setNotice("");
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
        if (!r.ok)
          throw new ApiError(
            data.error || "Upload could not finish.",
            r.status,
          );
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
        setLocalAssets((value) => ({
          ...value,
          [assetId]: { blob: file, width: next.width, height: next.height },
        }));
        setNotice(
          "Local preview only. This image stays in your browser draft.",
        );
      }
      setMedia((m) => ({ ...m, [key]: next }));
      setProject((p) => ({
        ...p,
        [key]: assetId,
        ...(key !== "logo" ? { [`${key}Crop`]: { ...defaultCrop } } : {}),
      }));
    } catch (e) {
      reportFailure(e, epoch);
    } finally {
      setUploading(null);
    }
  }
  async function retry() {
    if (!job) return;
    const epoch = authEpoch.current;
    setJobError("");
    setExporting(true);
    try {
      await api(`jobs/${job.id}/retry`, "POST");
      setJob((j) =>
        j ? { ...j, status: "queued", progress: 0, error: null } : null,
      );
    } catch (e) {
      handleAuthFailure(e, epoch);
      setJobError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  async function download() {
    if (!job) return;
    const epoch = authEpoch.current;
    setDownloading(true);
    setJobError("");
    try {
      const data = await api(`jobs/${job.id}/download`);
      const a = document.createElement("a");
      a.href = data.url;
      a.download = "demopop-redesign.mp4";
      a.click();
    } catch (e) {
      handleAuthFailure(e, epoch);
      setJobError((e as Error).message);
    } finally {
      setDownloading(false);
    }
  }
  const activeJob = job && ["queued", "rendering"].includes(job.status);
  function field(
    key: "name" | "opening" | "highlight1" | "highlight2" | "url" | "cta",
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
            onFocus={() => showScene("Opening")}
          />
        ) : (
          <input
            value={project[key]}
            maxLength={max}
            onChange={(e) => update(key, e.target.value)}
            onFocus={() => {
              if (key !== "name")
                showScene(
                  key === "highlight1"
                    ? "Highlight 01"
                    : key === "highlight2"
                      ? "Highlight 02"
                      : "Closing",
                );
            }}
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
        <label
          className={`upload-area ${dragging === key ? "is-dragging" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            if (!uploading) setDragging(key);
          }}
          onDragLeave={() => setDragging(null)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(null);
            if (!uploading) void upload(key, event.dataTransfer.files[0]);
          }}
        >
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
        <span className="asset-dimensions">
          {asset.width} × {asset.height}
        </span>
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
        {configured && authenticated === false && (
          <EditorSignIn onSignedIn={signedIn} />
        )}
        <button
          className="button secondary"
          onClick={() => setLoadAttempt((attempt) => attempt + 1)}
        >
          Retry opening project
        </button>
        <Link href="/projects">Back to projects</Link>
      </main>
    );
  return (
    <div className="editor studio-editor">
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
          <div className="history-controls" aria-label="Edit history">
            <button
              aria-label="Undo"
              title="Undo (Ctrl/⌘ Z)"
              disabled={!history.previous || !!uploading || saving || exporting}
              onClick={() => moveHistory("undo")}
            >
              <Undo2 size={17} />
            </button>
            <button
              aria-label="Redo"
              title="Redo (Ctrl/⌘ Shift Z)"
              disabled={!history.next || !!uploading || saving || exporting}
              onClick={() => moveHistory("redo")}
            >
              <Redo2 size={17} />
            </button>
          </div>
          <button
            className="button secondary small"
            disabled={
              !configured ||
              authenticated !== true ||
              saving ||
              exporting ||
              !!uploading ||
              !dirty
            }
            title={
              !configured
                ? "Cloud saving is not connected in this workspace"
                : undefined
            }
            onClick={save}
          >
            <Save size={15} />
            <span>Save</span>
          </button>
          <button
            className="button primary small"
            disabled={
              !configured ||
              authenticated !== true ||
              saving ||
              exporting ||
              !!uploading ||
              !!activeJob
            }
            title={
              !configured
                ? "MP4 export is not connected in this workspace"
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
      <div className="editor-feedback" aria-label="Editor feedback">
        <DraftRecovery
          scope={draftScope}
          projectId={id}
          project={project}
          assets={localAssets}
          dirty={draftDirty}
          onRestore={restoreDraft}
        />
        {configured && authenticated === null && (
          <p className="notice" role="status">
            Checking your account…
          </p>
        )}
        {configured && authenticated === false && (
          <EditorSignIn onSignedIn={signedIn} />
        )}
        {error && (
          <div
            className="error editor-message"
            role="alert"
            data-testid="editor-error"
          >
            <span>{error}</span>
            <button onClick={() => setError("")} aria-label="Dismiss error">
              <X size={15} />
            </button>
          </div>
        )}
        {refreshError && (
          <div className="error editor-message" role="alert">
            <span>{refreshError}</span>
            <button
              className="text-link"
              onClick={() => void refreshMedia.current()}
            >
              Retry image access
            </button>
          </div>
        )}
        {uploading && (
          <p className="notice" role="status">
            Uploading{" "}
            {uploading === "logo" ? "logo" : `${uploading} screenshot`}…
          </p>
        )}
        {notice && (
          <div className="success-message" role="status">
            {notice}
          </div>
        )}
      </div>
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
        <button
          className="tab-edit"
          aria-label="Undo"
          disabled={!history.previous || !!uploading || saving || exporting}
          onClick={() => moveHistory("undo")}
        >
          <Undo2 size={17} />
        </button>
        <button
          className="tab-edit"
          aria-label="Redo"
          disabled={!history.next || !!uploading || saving || exporting}
          onClick={() => moveHistory("redo")}
        >
          <Redo2 size={17} />
        </button>
      </div>
      <div className="editor-body">
        <aside
          className={`settings-panel ${mobile === "settings" ? "mobile-visible" : ""}`}
        >
          <div className="panel-heading">
            <div className="eyebrow">YOUR REVEAL STUDIO</div>
            <h1>The details</h1>
            <p>Start with a style. Make it unmistakably yours.</p>
          </div>
          <nav className="inspector-nav" aria-label="Editor sections">
            {[
              ["motion-settings", "Style"],
              ["media-settings", "Screenshots"],
              ["story-settings", "Story"],
              ["brand-settings", "Brand"],
            ].map(([section, label]) => (
              <button
                key={section}
                onClick={() =>
                  document.getElementById(section)?.scrollIntoView({
                    block: "start",
                    behavior: window.matchMedia(
                      "(prefers-reduced-motion: reduce)",
                    ).matches
                      ? "instant"
                      : "smooth",
                  })
                }
              >
                {label}
              </button>
            ))}
          </nav>
          <section className="settings-section" id="motion-settings">
            <h2>
              <span>01</span> Motion & format
            </h2>
            <MotionControls project={project} onChange={update} />
            {project.template === "launch" && (
              <div className="launch-settings">
                <div className="launch-story-badge">
                  15s LAUNCH CUT <span>HOOK → PROOF → ACTION</span>
                </div>
                <label className="field">
                  <span>Soundtrack</span>
                  <select
                    value={project.sound}
                    onChange={(event) =>
                      update(
                        "sound",
                        event.target.value as ProjectInput["sound"],
                      )
                    }
                  >
                    <option value="pulse">Launch pulse · original synth</option>
                    <option value="off">Silent</option>
                  </select>
                </label>
                <p className="section-hint">
                  Bass, risers, and ticks synced to the edit. Included in your
                  exported MP4.
                </p>
              </div>
            )}
          </section>
          <section className="settings-section" id="media-settings">
            <h2>
              <span>02</span> Your screenshots
            </h2>
            <p className="section-hint">PNG, JPEG or WebP · up to 10 MB each</p>
            <div className="assets-grid">
              {assetCard("before")}
              {assetCard("after")}
            </div>
            <button
              className="swap-screenshots text-link"
              disabled={!!uploading}
              onClick={() => {
                setProject((current) => ({
                  ...current,
                  before: current.after,
                  after: current.before,
                  beforeCrop: current.afterCrop,
                  afterCrop: current.beforeCrop,
                }));
                setMedia((current) => ({
                  ...current,
                  before: current.after,
                  after: current.before,
                }));
              }}
            >
              <ArrowLeftRight size={14} /> Swap screenshots
            </button>
          </section>
          <section className="settings-section" id="story-settings">
            <h2>
              <span>03</span> Tell the story
            </h2>
            {field("name", "Project name", 60)}
            {field("opening", "Opening caption", 70, true)}
            {project.template === "launch" && (
              <p className="section-hint launch-copy-hint">
                The first 1.8 seconds: one bold idea. Give people a reason to
                keep watching.
              </p>
            )}
            {project.template === "launch" && (
              <div
                className="launch-hook-angles"
                aria-label="Opening hook angles"
              >
                <span>Try an opening angle</span>
                <div>
                  {[
                    [
                      "Product",
                      `Meet ${project.name.trim() || "what’s next"}.`,
                    ],
                    ["Benefit", project.highlight1],
                    ["Curiosity", "What comes after\n“what if”?"],
                  ].map(([name, copy]) => (
                    <button
                      key={name}
                      className="text-link"
                      onClick={() => {
                        update("opening", copy);
                        showScene("Opening");
                      }}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {field("highlight1", "First highlight", 48)}
            {field("highlight2", "Second highlight", 48)}
            {project.template === "launch" &&
              field("cta", "Closing call to action", 36)}
            <p className="section-hint story-hint">
              Select a caption to preview its moment in the video.
            </p>
          </section>
          <section className="settings-section" id="brand-settings">
            <h2>
              <span>04</span> Make your mark
            </h2>
            <BrandColor
              value={project.color}
              onChange={(color) => update("color", color)}
            />
            <label className="field">
              <span>Video font</span>
              <select
                value={project.font}
                onChange={(event) =>
                  update("font", event.target.value as ProjectInput["font"])
                }
              >
                {Object.entries(FONTS).map(([key, font]) => (
                  <option key={key} value={key}>
                    {font.name}
                  </option>
                ))}
              </select>
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
          <section className="settings-section">
            <h2>
              <span>05</span> Reuse your brand
            </h2>
            <BrandKits
              project={project}
              authorized={authenticated === true}
              onApply={applyBrand}
              onUnauthorized={() => {
                setAuthenticated(false);
                sessionVersion.current++;
              }}
            />
          </section>
          <div className="sidebar-end">
            <Film size={15} /> Four styles. Your next big reveal.
          </div>
        </aside>
        <main
          className={`preview-panel ${mobile === "preview" ? "mobile-visible" : ""}`}
        >
          <div className="preview-heading">
            <div>
              <span className="eyebrow">LIVE PREVIEW</span>
              <h2>Your work, in motion.</h2>
            </div>
            <span className="template-tag">
              <span className="blue-dot" />{" "}
              {
                TEMPLATES.find((template) => template.id === project.template)
                  ?.name
              }
            </span>
          </div>
          {!configured && (
            <div className="local-notice">
              <span className="local-tag">PREVIEW MODE</span>
              <span>
                Drafts stay on this device. Cloud saving and MP4 export aren’t
                connected.
              </span>
              <Link href="/auth" aria-label="Account setup information">
                <ArrowUpRight size={15} />
              </Link>
            </div>
          )}
          <div className="editor-stage">
            <div className="editor-stage-grid" />
            <Preview
              input={{ project, ...media } as VideoProps}
              onRetry={() => void refreshMedia.current()}
              scenes
              focusFrame={focusFrame}
            />
          </div>
          <div className="preview-footer">
            <span>
              {project.format.toUpperCase()} <span>·</span> {dimensions.width} ×{" "}
              {dimensions.height} <span>·</span> 30 FPS
            </span>
            <span>
              <kbd>Space</kbd> Play / pause
            </span>
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
                    : job.output_expired_at
                      ? "This export has expired — create a new export"
                      : job.status === "completed"
                        ? "Your video is ready to download"
                        : "Export failed — view details"}
              </span>
              <ArrowUpRight size={16} />
            </button>
          )}
          {id && authenticated === true && (
            <ExportHistory
              projectId={id}
              revision={`${job?.id || ""}/${job?.status || ""}`}
              active={!!activeJob}
              onRetried={(retried) => {
                setJob(retried);
                setJobPanel(true);
              }}
              onUnauthorized={() => {
                setAuthenticated(false);
                sessionVersion.current++;
              }}
            />
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
              {job.output_expired_at
                ? "This export has expired."
                : job.status === "completed"
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
                  : job.output_expired_at
                    ? "Create a new export to render your current project settings."
                    : job.status === "completed"
                      ? `${job.format === "landscape" ? "1920 × 1080" : "1080 × 1920"} · 30 fps · H.264 MP4`
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
            {job.status === "completed" && !job.output_expired_at && (
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
