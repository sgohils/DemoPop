"use client";
import { pricingPath } from "../shared/billing-context";
import { trackPreview } from "../client/metrics";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  projectSchema,
  type ProjectInput,
  type Media,
  type VideoProps,
} from "../shared/project";
import { VIDEO_GOALS } from "../shared/link-video";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  ExternalLink,
  Globe,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Brand } from "./Brand";
import { BrandMark } from "./BrandMark";
import styles from "./create-from-link.module.css";

const DraftPreview = dynamic(
  () => import("./Preview").then((module) => module.Preview),
  {
    ssr: false,
    loading: () => (
      <p className={styles.draftLoading} role="status">
        Opening your motion preview…
      </p>
    ),
  },
);
type WebsiteDraft = {
  projectId: string;
  project: ProjectInput;
  media: Omit<VideoProps, "project">;
};

type Format = "landscape" | "vertical" | "square";
type Status =
  "queued" | "capturing" | "preparing" | "rendering" | "completed" | "failed";
type Job = {
  id: string;
  mode?: "cloud" | "local";
  status: Status;
  progress: number;
  projectId?: string;
  videoUrl?: string;
  downloadUrl?: string;
  error?: string;
  outputFormat?: Format;
  outputDuration?: 15 | 30 | 60;
};
const storageKey = "demopop:create-from-link:v1";
const pendingStorageKey = "demopop:create-from-link:pending:v1";
function readSavedForm(
  storage: "sessionStorage" | "localStorage",
  key: string,
  lifetime: number,
) {
  try {
    const saved = JSON.parse(window[storage].getItem(key) || "null");
    const age = Date.now() - saved?.savedAt;
    if (
      saved &&
      age >= 0 &&
      age < lifetime &&
      typeof saved.url === "string" &&
      saved.url.length <= 2048 &&
      ["landscape", "vertical", "square"].includes(saved.format) &&
      [15, 30, 60].includes(saved.duration)
    )
      return saved;
  } catch {
    // Browser storage can be unavailable or contain an old draft shape.
  }
  return null;
}
const statuses: Status[] = [
  "queued",
  "capturing",
  "preparing",
  "rendering",
  "completed",
  "failed",
];
const steps = ["Capture your website", "Build your story", "Render your video"];
const active = (status?: Status) =>
  Boolean(status && status !== "completed" && status !== "failed");
function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Try again.";
}
function safeMediaUrl(value: unknown) {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === "https:" || url.origin === window.location.origin
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
function isMedia(value: unknown): value is Media {
  if (!value || typeof value !== "object") return false;
  const media = value as Partial<Media>;
  return (
    typeof media.src === "string" &&
    media.src.trim().length > 0 &&
    typeof media.width === "number" &&
    Number.isFinite(media.width) &&
    media.width > 0 &&
    typeof media.height === "number" &&
    Number.isFinite(media.height) &&
    media.height > 0 &&
    (media.kind === undefined || media.kind === "video") &&
    (media.duration === undefined || Number.isFinite(media.duration))
  );
}
async function readResponseObject(response: Response, message: string) {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(message);
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new Error(message);
  return body as Record<string, unknown>;
}
function readJob(body: Record<string, unknown>, id?: string): Job {
  if (
    !statuses.includes(body.status as Status) ||
    (typeof body.id !== "string" && !id)
  )
    throw new Error("We could not read the video status. Please try again.");
  return {
    id: typeof body.id === "string" ? body.id : id!,
    mode:
      body.mode === "cloud" || body.mode === "local" ? body.mode : undefined,
    status: body.status as Status,
    progress:
      typeof body.progress === "number" && Number.isFinite(body.progress)
        ? Math.min(1, Math.max(0, body.progress))
        : 0,
    projectId:
      typeof body.projectId === "string" &&
      /^[a-f0-9-]{36}$/i.test(body.projectId)
        ? body.projectId
        : undefined,
    videoUrl: safeMediaUrl(body.videoUrl),
    downloadUrl: safeMediaUrl(body.downloadUrl),
    error: typeof body.error === "string" ? body.error : undefined,
    ...(["landscape", "vertical", "square"].includes(
      body.outputFormat as string,
    )
      ? { outputFormat: body.outputFormat as Format }
      : {}),
    ...([15, 30, 60].includes(body.outputDuration as number)
      ? { outputDuration: body.outputDuration as 15 | 30 | 60 }
      : {}),
  };
}

export function CreateFromLink({
  configured,
  billingRequired = true,
}: {
  configured: boolean;
  billingRequired?: boolean;
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [format, setFormat] = useState<Format>("landscape");
  const [duration, setDuration] = useState<15 | 30 | 60>(30);
  const [goal, setGoal] = useState<"website" | "feature" | "redesign">(
    "website",
  );
  const [draft, setDraft] = useState<WebsiteDraft | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState("");
  const [draftAttempt, setDraftAttempt] = useState(0);
  const [mobileView, setMobileView] = useState<"story" | "preview">("preview");
  const [restoreDraft, setRestoreDraft] = useState<{
    id: string;
    project?: ProjectInput;
  } | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [needsPlan, setNeedsPlan] = useState(false);
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);
  const [pollError, setPollError] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [pollAttempt, setPollAttempt] = useState(0);
  const [playbackError, setPlaybackError] = useState(false);
  const [videoReload, setVideoReload] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const submitLock = useRef(false);
  const busy = submitting || saving || draftLoading || active(job?.status);
  const ready = job?.status === "completed" && Boolean(job.videoUrl);
  const jobId = job?.id;
  const isJobActive = active(job?.status);
  const outputFormat = job?.outputFormat ?? format;
  const outputDuration = job?.outputDuration ?? duration;
  const previewProject = draft
    ? {
        ...draft.project,
        format,
        story: draft.project.story
          ? { ...draft.project.story, duration }
          : undefined,
      }
    : null;
  const recoveryProjectId =
    savedProjectId ?? (job?.status === "failed" ? job.projectId : undefined);
  const stage =
    submitting || job?.status === "capturing"
      ? 0
      : job?.status === "preparing"
        ? 1
        : job?.status === "rendering"
          ? 2
          : -1;

  useEffect(() => {
    const session = readSavedForm(
      "sessionStorage",
      storageKey,
      24 * 60 * 60 * 1000,
    );
    const pending = !session
      ? readSavedForm("localStorage", pendingStorageKey, 60 * 60 * 1000)
      : null;
    // Only the per-tab session can restore a job. The shared authentication
    // handoff contains form fields, never a local output token or job ID.
    const saved =
      session ??
      (pending
        ? {
            url: pending.url,
            format: pending.format,
            duration: pending.duration,
            goal: pending.goal,
            savedAt: pending.savedAt,
          }
        : null);
    if (saved) {
      if (["website", "feature", "redesign"].includes(saved.goal))
        setGoal(saved.goal);
      if (typeof saved.url === "string") setUrl(saved.url.slice(0, 2048));
      if (["landscape", "vertical", "square"].includes(saved.format))
        setFormat(saved.format);
      if ([15, 30, 60].includes(saved.duration)) setDuration(saved.duration);
      if (typeof saved.id === "string" && /^[a-f0-9-]{36,64}$/i.test(saved.id))
        setJob({
          id: saved.id,
          status: "queued",
          progress: 0,
          outputFormat: ["landscape", "vertical", "square"].includes(
            saved.outputFormat,
          )
            ? saved.outputFormat
            : ["landscape", "vertical", "square"].includes(saved.format)
              ? saved.format
              : "landscape",
          outputDuration: [15, 30, 60].includes(saved.outputDuration)
            ? saved.outputDuration
            : [15, 30, 60].includes(saved.duration)
              ? saved.duration
              : 30,
        });
    }
    if (
      configured &&
      saved &&
      typeof saved.draftId === "string" &&
      /^[a-f0-9-]{36}$/i.test(saved.draftId)
    ) {
      const project = projectSchema.safeParse(saved.draftProject);
      setRestoreDraft({
        id: saved.draftId,
        ...(project.success ? { project: project.data } : {}),
      });
    }
    setHydrated(true);
    return () => {
      request.current?.abort();
    };
  }, [configured]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          url,
          format,
          duration,
          goal,
          draftId: draft?.projectId ?? restoreDraft?.id,
          draftProject: draft?.project ?? restoreDraft?.project,
          id: job?.id,
          outputFormat: job?.outputFormat,
          outputDuration: job?.outputDuration,
          savedAt: Date.now(),
        }),
      );
    } catch {
      // Storage is optional; the current page can still finish the video.
    }
  }, [
    url,
    format,
    duration,
    goal,
    draft,
    restoreDraft,
    job?.id,
    job?.outputFormat,
    job?.outputDuration,
    hydrated,
  ]);

  async function readDraft(id: string, signal?: AbortSignal) {
    const response = await fetch(`/api/projects/${id}`, {
      cache: "no-store",
      signal,
    });
    if (response.status === 401 && !signal?.aborted) setAuthRequired(true);
    const body = await readResponseObject(
      response,
      "Your draft returned an unreadable response. Please retry.",
    );
    if (!response.ok)
      throw new Error(
        typeof body.error === "string"
          ? body.error
          : "Your draft could not be opened. Please retry.",
      );
    const project = projectSchema.parse(body.project);
    const media = body.media;
    if (!media || typeof media !== "object")
      throw new Error("The preview images could not be loaded. Please retry.");
    const mediaObject = media as Record<string, unknown>;
    if (!isMedia(mediaObject.before) || !isMedia(mediaObject.after))
      throw new Error("The preview images could not be loaded. Please retry.");
    if (!signal?.aborted) setAuthRequired(false);
    return {
      projectId: id,
      project,
      media: mediaObject as WebsiteDraft["media"],
    };
  }

  useEffect(() => {
    if (!restoreDraft) return;
    const controller = new AbortController();
    setDraftLoading(true);
    setDraftError("");
    void readDraft(restoreDraft.id, controller.signal)
      .then((loaded) => {
        if (!controller.signal.aborted) {
          setDraft({
            ...loaded,
            project: restoreDraft.project ?? loaded.project,
          });
          if (!restoreDraft.project) {
            setFormat(loaded.project.format);
            setDuration(loaded.project.story?.duration ?? 15);
          }
          setMobileView("preview");
          setDraftLoading(false);
          setRestoreDraft(null);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setDraftError(message(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setDraftLoading(false);
      });
    return () => controller.abort();
  }, [restoreDraft, draftAttempt]);

  function editDraft(update: (project: ProjectInput) => ProjectInput) {
    setDraft((current) =>
      current ? { ...current, project: update(current.project) } : null,
    );
    setJob(null);
    setNeedsPlan(false);
    setError("");
  }

  async function refreshDraftMedia() {
    if (!draft) return;
    const id = draft.projectId;
    setDraftError("");
    try {
      const loaded = await readDraft(id);
      setDraft((current) =>
        current?.projectId === id
          ? { ...current, media: loaded.media }
          : current,
      );
    } catch (cause) {
      setDraftError(message(cause));
    }
  }

  async function saveDraft(signal?: AbortSignal) {
    if (!draft || !previewProject) throw new Error("Open your preview first.");
    const parsed = projectSchema.safeParse(previewProject);
    if (!parsed.success)
      throw new Error(
        "Add an opening headline, a caption for each scene, and a call to action before continuing.",
      );
    const saved = await fetch(`/api/projects/${draft.projectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
      signal,
    });
    if (!saved.ok) {
      if (saved.status === 401) setAuthRequired(true);
      const failure = await saved.json();
      throw new Error(
        failure.error || "Your draft could not be saved. Please retry.",
      );
    }
    return parsed.data;
  }

  async function leaveDraft(destination: "studio" | "new") {
    if (!draft || busy || submitLock.current) return;
    submitLock.current = true;
    setSaving(true);
    setError("");
    try {
      await saveDraft();
      if (destination === "studio") {
        try {
          // Studio edits become the saved source of truth on return. Do not
          // overlay them with this page's earlier session copy.
          sessionStorage.setItem(
            storageKey,
            JSON.stringify({
              url,
              format,
              duration,
              goal,
              draftId: draft.projectId,
              savedAt: Date.now(),
            }),
          );
        } catch {
          /* browser storage is optional */
        }
        router.push(`/editor/${draft.projectId}`);
      } else {
        setDraft(null);
        setRestoreDraft(null);
        setJob(null);
        setUrl("");
        setNeedsPlan(false);
        setDraftError("");
        setSavedProjectId(null);
      }
    } catch (cause) {
      setError(message(cause));
      setMobileView("story");
    } finally {
      setSaving(false);
      submitLock.current = false;
    }
  }

  useEffect(() => {
    if (!jobId || !isJobActive) return;
    const id = jobId;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let requestTimeout: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const controller = new AbortController();
    const poll = async () => {
      try {
        timedOut = false;
        requestTimeout = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, 15_000);
        const response = await fetch(
          `/api/create-from-link/${encodeURIComponent(id)}`,
          {
            signal: controller.signal,
            cache: "no-store",
          },
        );
        if (cancelled) return;
        if (response.status === 401) setAuthRequired(true);
        const body = await readResponseObject(
          response,
          "The video status response was unreadable. Try checking again.",
        );
        if (cancelled) return;
        if (response.status === 404 || response.status === 410) {
          setJob((previous) =>
            previous?.id === id
              ? {
                  ...previous,
                  status: "failed",
                  error:
                    (typeof body.error === "string" && body.error) ||
                    "This video is no longer available. Generate it again to continue.",
                }
              : previous,
          );
          return;
        }
        if (!response.ok)
          throw new Error(
            typeof body.error === "string"
              ? body.error
              : "We could not check your video. Try checking again.",
          );
        const next = readJob(body, id);
        setAuthRequired(false);
        setJob((previous) =>
          previous?.id === id
            ? { ...previous, ...next, mode: next.mode ?? previous.mode }
            : previous,
        );
        setPollError("");
        if (active(next.status)) timer = setTimeout(poll, 1800);
      } catch (cause) {
        if (!cancelled)
          setPollError(
            timedOut
              ? "Checking your video took too long. Try again to reconnect."
              : message(cause),
          );
      } finally {
        clearTimeout(requestTimeout);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
      clearTimeout(requestTimeout);
    };
    // Continue polling through status changes without restarting in-flight requests.
  }, [jobId, isJobActive, pollAttempt]);

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    if (submitLock.current || busy || restoreDraft || !url.trim()) return;
    submitLock.current = true;
    const current = ++generation.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setSubmitting(true);
    setError("");
    setNeedsPlan(false);
    setSavedProjectId(null);
    setPollError("");
    setAuthRequired(false);
    setPlaybackError(false);
    setRefreshing(false);
    setJob(null);
    try {
      let response: Response;
      if (draft && previewProject) {
        const project = await saveDraft(controller.signal);
        response = await fetch("/api/exports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: draft.projectId,
            project,
            outputKind: "video",
          }),
          signal: controller.signal,
        });
      } else
        response = await fetch("/api/create-from-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: url.trim(),
            format,
            duration,
            ...(goal !== "website" ? { goal } : {}),
            ...(configured ? { previewOnly: true } : {}),
          }),
          signal: controller.signal,
        });
      if (current !== generation.current || controller.signal.aborted) return;
      if (response.status === 402) setNeedsPlan(true);
      if (response.status === 401) {
        setAuthRequired(true);
        try {
          localStorage.setItem(
            pendingStorageKey,
            JSON.stringify({
              url,
              format,
              duration,
              goal,
              savedAt: Date.now(),
            }),
          );
        } catch {
          // Same-tab authentication can still restore the session draft.
        }
      }
      const body = await readResponseObject(
        response,
        "The video service returned an unreadable response. Please try again.",
      );
      if (current !== generation.current || controller.signal.aborted) return;
      if (!response.ok) {
        if (
          typeof body.projectId === "string" &&
          /^[a-f0-9-]{36}$/i.test(body.projectId)
        )
          setSavedProjectId(body.projectId);
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Your video could not be started. Please try again.",
        );
      }
      if (
        body.status === "draft" &&
        typeof body.projectId === "string" &&
        /^[a-f0-9-]{36}$/i.test(body.projectId)
      ) {
        const pending = { id: body.projectId };
        // Save the project reference before loading media; neither a reload nor
        // a temporary image error should start a second website capture.
        try {
          sessionStorage.setItem(
            storageKey,
            JSON.stringify({
              url,
              format,
              duration,
              goal,
              draftId: pending.id,
              savedAt: Date.now(),
            }),
          );
        } catch {
          /* optional storage */
        }
        setRestoreDraft(pending);
        try {
          localStorage.removeItem(pendingStorageKey);
        } catch {
          /* optional storage */
        }
        return;
      }
      setJob({
        ...readJob(draft ? { ...body, status: "queued" } : body),
        ...(draft
          ? {
              mode: "cloud" as const,
              status: "queued" as const,
              projectId: draft.projectId,
              progress: 0,
            }
          : {}),
        outputFormat: format,
        outputDuration: duration,
      });
      setMobileView("preview");
      try {
        localStorage.removeItem(pendingStorageKey);
      } catch {
        // Clearing an optional handoff must not interrupt video creation.
      }
    } catch (cause) {
      if (current === generation.current && !controller.signal.aborted) {
        setError(message(cause));
        setMobileView("story");
      }
    } finally {
      if (current === generation.current && !controller.signal.aborted)
        setSubmitting(false);
      submitLock.current = false;
    }
  }

  async function refreshVideo() {
    if (!job || refreshing) return;
    const current = generation.current;
    const id = job.id;
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setRefreshing(true);
    try {
      const response = await fetch(
        `/api/create-from-link/${encodeURIComponent(id)}`,
        {
          signal: controller.signal,
          cache: "no-store",
        },
      );
      const body = await response.json();
      if (current !== generation.current || controller.signal.aborted) return;
      if (response.status === 404 || response.status === 410) {
        setJob((previous) =>
          previous?.id === id
            ? {
                ...previous,
                status: "failed",
                videoUrl: undefined,
                downloadUrl: undefined,
                error:
                  body.error ||
                  "This video is no longer available. Generate it again to continue.",
                projectId:
                  typeof body.projectId === "string" &&
                  /^[a-f0-9-]{36}$/i.test(body.projectId)
                    ? body.projectId
                    : previous.projectId,
              }
            : previous,
        );
        setPlaybackError(false);
        setError("");
        return;
      }
      if (!response.ok)
        throw new Error(body.error || "We could not refresh your video.");
      setJob((previous) =>
        previous?.id === id ? { ...previous, ...readJob(body, id) } : previous,
      );
      setVideoReload((value) => value + 1);
      setPlaybackError(false);
      setError("");
    } catch (cause) {
      if (current === generation.current && !controller.signal.aborted)
        setError(message(cause));
    } finally {
      if (current === generation.current && !controller.signal.aborted)
        setRefreshing(false);
    }
  }

  return (
    <div
      className={styles.page}
      data-has-draft={Boolean(draft)}
      data-view={mobileView}
    >
      <header className={`site-header ${styles.header}`}>
        <Brand />
        <nav className={styles.headerNav} aria-label="Creation navigation">
          <Link href="/editor/new" className="text-link">
            Try the studio <ArrowRight size={15} />
          </Link>
          <Link href="/" className={`text-link ${styles.backHome}`}>
            <ArrowLeft size={15} /> Back home
          </Link>
        </nav>
      </header>
      {draft && (
        <nav className={styles.mobileTabs} aria-label="Draft workspace">
          <button
            type="button"
            aria-pressed={mobileView === "story"}
            onClick={() => setMobileView("story")}
          >
            Edit story
          </button>
          <button
            type="button"
            aria-pressed={mobileView === "preview"}
            onClick={() => setMobileView("preview")}
          >
            Motion preview
          </button>
        </nav>
      )}
      <main className={styles.main}>
        <section className={styles.intro} aria-labelledby="create-title">
          <div className={styles.eyebrow}>
            <span /> CREATE FROM LINK
          </div>
          <h1 id="create-title">
            Your website.
            <br />A little <em>louder.</em>
          </h1>
          <p className={styles.description}>
            Start with your real website.{" "}
            {configured
              ? "Review the motion, refine the story, then export when it feels right."
              : "Choose a direction and turn it into a branded launch film."}
          </p>
          <ol className={styles.journey} aria-label="Video creation steps">
            {["Your website", "Review the story", "Export & deliver"].map(
              (step, index) => (
                <li
                  key={step}
                  aria-current={
                    (ready ? 2 : draft ? 1 : 0) === index ? "step" : undefined
                  }
                >
                  <span>{index + 1}</span>
                  {step}
                </li>
              ),
            )}
          </ol>
          <form
            id="website-video-form"
            className={styles.form}
            onSubmit={generate}
          >
            <label htmlFor="create-website">Your website link</label>
            <div className={styles.urlField}>
              <Globe size={19} aria-hidden="true" />
              <input
                id="create-website"
                name="url"
                type="text"
                inputMode="url"
                autoComplete="url"
                required
                maxLength={2048}
                placeholder="your-product.com"
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  setAuthRequired(false);
                  setDraft(null);
                  setRestoreDraft(null);
                  setDraftError("");
                }}
                disabled={busy || Boolean(draft) || Boolean(restoreDraft)}
                aria-describedby="create-help"
              />
            </div>
            <p id="create-help" className={styles.hint}>
              {configured
                ? "Free personalized preview with an account. A package activates only when you export."
                : "Use a public website. Or try your own screenshots in the studio."}
            </p>
            {!draft && (
              <fieldset className={styles.goals} disabled={busy}>
                <legend>What are you sharing?</legend>
                <div>
                  {VIDEO_GOALS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={goal === item.id}
                      onClick={() => setGoal(item.id)}
                    >
                      <strong>{item.name}</strong>
                      <span>{item.description}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            {draft && (
              <fieldset className={styles.storyFields} disabled={busy}>
                <legend>Your story. Your words.</legend>
                <p>
                  Changes appear in the motion preview. Fine-tune shots in the
                  studio.
                </p>
                <label>
                  Opening headline
                  <textarea
                    rows={2}
                    maxLength={70}
                    value={draft.project.opening}
                    onChange={(event) =>
                      editDraft((p) => ({ ...p, opening: event.target.value }))
                    }
                  />
                </label>
                {draft.project.story?.scenes.map((scene, index) => (
                  <label key={scene.id}>
                    Scene {index + 1}
                    <textarea
                      rows={2}
                      maxLength={70}
                      value={scene.caption}
                      onChange={(event) =>
                        editDraft((p) => ({
                          ...p,
                          story: {
                            ...p.story!,
                            scenes: p.story!.scenes.map((s) =>
                              s.id === scene.id
                                ? { ...s, caption: event.target.value }
                                : s,
                            ),
                          },
                        }))
                      }
                    />
                  </label>
                ))}
                <div className={styles.storyRow}>
                  <label>
                    Call to action
                    <input
                      maxLength={36}
                      value={draft.project.cta}
                      onChange={(event) =>
                        editDraft((p) => ({ ...p, cta: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Client folder <span>(optional)</span>
                    <input
                      maxLength={60}
                      value={draft.project.client || ""}
                      placeholder="e.g. North Studio"
                      onChange={(event) =>
                        editDraft((p) => ({ ...p, client: event.target.value }))
                      }
                    />
                  </label>
                </div>
              </fieldset>
            )}
            <details className={styles.options}>
              <summary>
                <span>Video options</span>
                <span>
                  {duration}s ·{" "}
                  {format === "landscape"
                    ? "16:9"
                    : format === "vertical"
                      ? "9:16"
                      : "1:1"}
                  <ChevronDown size={14} />
                </span>
              </summary>
              <div className={styles.optionFields}>
                <label>
                  Format
                  <select
                    aria-label="Video format"
                    value={format}
                    disabled={busy}
                    onChange={(event) =>
                      setFormat(event.target.value as Format)
                    }
                  >
                    <option value="landscape">Landscape · 16:9</option>
                    <option value="vertical">Vertical · 9:16</option>
                    <option value="square">Square · 1:1</option>
                  </select>
                </label>
                <label>
                  Length
                  <select
                    aria-label="Video length"
                    value={duration}
                    disabled={busy}
                    onChange={(event) =>
                      setDuration(Number(event.target.value) as 15 | 30 | 60)
                    }
                  >
                    <option value={15}>15 seconds</option>
                    <option value={30}>30 seconds</option>
                    <option value={60}>60 seconds</option>
                  </select>
                </label>
              </div>
            </details>
            {authRequired ? (
              <Link
                className={`button primary ${styles.generate}`}
                href="/auth?next=%2Fcreate"
              >
                {configured || draft
                  ? "Sign in to preview"
                  : "Sign in to generate"}{" "}
                <ArrowRight size={18} />
              </Link>
            ) : (
              <button
                type="submit"
                className={`button primary ${styles.generate}`}
                disabled={
                  busy || !hydrated || !url.trim() || Boolean(restoreDraft)
                }
              >
                {busy ? (
                  <>
                    <Loader2 size={18} className={styles.spin} />{" "}
                    {saving
                      ? "Saving your draft…"
                      : configured && !draft
                        ? "Preparing your preview…"
                        : "Creating your video…"}
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />{" "}
                    {draft
                      ? "Export MP4"
                      : configured
                        ? "Preview your video"
                        : job?.status === "failed"
                          ? "Try again"
                          : ready
                            ? "Generate another video"
                            : "Generate video"}
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            )}
            {(error || job?.status === "failed") && (
              <p className={styles.error} role="alert">
                {error ||
                  job?.error ||
                  "Your video could not finish. Please try again."}
                {needsPlan && draft && (
                  <>
                    {" "}
                    Your reviewed draft is saved.{" "}
                    <Link href={pricingPath({ projectId: draft.projectId })}>
                      Choose a package to export →
                    </Link>
                  </>
                )}
                {recoveryProjectId && (
                  <>
                    {" "}
                    <Link href={`/editor/${recoveryProjectId}`}>
                      Open saved project <ArrowRight size={12} />
                    </Link>
                  </>
                )}
              </p>
            )}
          </form>
          <p className={styles.footnote}>
            {configured
              ? billingRequired
                ? ready
                  ? "Edit and export revisions within this project's 30-day package window. Each new website starts a separate project."
                  : "Preview first, pay when you export. The same project includes a 30-day revision window after activation."
                : "Sign in when prompted. Your video and editable project are saved to your account."
              : "Local videos expire after 45 minutes. Download your MP4 to keep it."}
          </p>
          <div className={styles.included}>
            {needsPlan && (
              <Link
                href={pricingPath({
                  projectId: draft?.projectId ?? recoveryProjectId,
                })}
              >
                Choose a launch package →
              </Link>
            )}
            <span>
              <Check size={14} /> Real website captures
            </span>
            <span>
              <Check size={14} /> Brand colors & music
            </span>
            <span>
              <Check size={14} /> Ready-to-share MP4
            </span>
          </div>
        </section>
        <section className={styles.output} aria-label="Generated video">
          <div className={styles.outputBar}>
            <span>
              <span className={styles.liveDot} />{" "}
              {draft && !job
                ? "YOUR EDITABLE DRAFT"
                : job
                  ? "DEMOPOP — YOUR LAUNCH FILM"
                  : "ORBIT / REAL SAMPLE EXPORT"}
            </span>
            <span>
              {(draft || job ? outputDuration : 15).toString().padStart(2, "0")}{" "}
              SEC /{" "}
              {(!draft && !job) || outputFormat === "landscape"
                ? "16:9"
                : outputFormat === "vertical"
                  ? "9:16"
                  : "1:1"}
            </span>
          </div>
          {ready ? (
            <>
              <div className={styles.videoFrame} data-format={outputFormat}>
                <video
                  key={`${job!.videoUrl}:${videoReload}`}
                  src={job!.videoUrl}
                  controls
                  preload="metadata"
                  playsInline
                  aria-label="Your generated launch video"
                  onError={() => setPlaybackError(true)}
                  onLoadedData={() => {
                    if (job?.mode === "cloud" && job.projectId)
                      trackPreview(job.projectId);
                  }}
                />
              </div>
              <div className={styles.result}>
                <div>
                  <div className={styles.resultLabel}>
                    <Check size={15} /> YOUR VIDEO IS READY
                  </div>
                  <h2>Go make some noise.</h2>
                  <p>Your finished launch film, ready to share.</p>
                </div>
                <div className={styles.resultActions}>
                  {job!.downloadUrl && (
                    <a
                      className={`button primary ${styles.download}`}
                      href={job!.downloadUrl}
                      download="demopop-launch.mp4"
                    >
                      <Download size={16} /> Download MP4
                    </a>
                  )}
                  {job!.projectId && (
                    <Link
                      className={styles.editLink}
                      href={`/editor/${job!.projectId}`}
                    >
                      Edit your video <ExternalLink size={14} />
                    </Link>
                  )}
                </div>
              </div>
              {playbackError && (
                <div className={styles.playbackError} role="alert">
                  Your playback link may have expired.{" "}
                  <button
                    onClick={() => void refreshVideo()}
                    disabled={refreshing}
                  >
                    {refreshing ? "Refreshing…" : "Refresh video"}
                  </button>
                </div>
              )}
            </>
          ) : draft &&
            previewProject &&
            !submitting &&
            !draftLoading &&
            !isJobActive ? (
            <div className={styles.draftOutput}>
              <DraftPreview
                input={{ project: previewProject, ...draft.media }}
                onRetry={() => void refreshDraftMedia()}
                onReady={() => trackPreview(draft.projectId)}
              />
              <div className={styles.draftSummary}>
                <span>PRIVATE PREVIEW · NOT AN EXPORT</span>
                <h2>Make it yours before it goes out.</h2>
                <p>
                  Review the words and framing. Your package starts when you
                  export, with the same captured screens.
                </p>
                <button
                  type="button"
                  onClick={() => void leaveDraft("studio")}
                  disabled={busy}
                >
                  Open the full studio <ExternalLink size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => void leaveDraft("new")}
                  disabled={busy}
                >
                  Save & start another website <ArrowRight size={14} />
                </button>
                <button
                  type="submit"
                  form="website-video-form"
                  className={`button primary ${styles.mobileExport}`}
                  disabled={busy}
                >
                  Export MP4 <ArrowRight size={16} />
                </button>
              </div>
            </div>
          ) : job?.status === "completed" ? (
            <div className={styles.working}>
              <div className={styles.status}>
                <h2>Your video is ready.</h2>
                <p>
                  We could not load the playback link. Refresh the result to
                  open your finished video.
                </p>
              </div>
              <div className={styles.connectionError}>
                <button
                  className="button secondary small"
                  disabled={refreshing}
                  onClick={() => void refreshVideo()}
                >
                  {refreshing ? "Refreshing…" : "Refresh video"}
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          ) : busy ? (
            <div className={styles.working}>
              <div className={styles.workingMark}>
                <BrandMark />
                <span />
              </div>
              <div className={styles.status} role="status" aria-live="polite">
                <h2>
                  {pollError
                    ? "Let’s reconnect to your video."
                    : submitting || job?.status === "capturing"
                      ? "Getting to know your website."
                      : job?.status === "preparing"
                        ? "Giving your story a little rhythm."
                        : job?.status === "rendering"
                          ? "Putting it all in motion."
                          : "Your video is in the queue."}
                </h2>
                <p>
                  {pollError
                    ? "We lost the status connection. Check again to pick up where you left off."
                    : submitting || job?.status === "capturing"
                      ? "Capturing your pages, colors, and product details."
                      : job?.status === "preparing"
                        ? "Arranging your captures, titles, and soundtrack."
                        : job?.status === "rendering"
                          ? "Rendering the finished MP4. Keep this page open."
                          : "Waiting for rendering to begin. This can take a few minutes."}
                </p>
              </div>
              <ol className={styles.steps}>
                {steps.map((step, index) => (
                  <li
                    key={step}
                    data-state={
                      stage > index
                        ? "done"
                        : stage === index
                          ? "active"
                          : "pending"
                    }
                  >
                    <span>
                      {stage > index ? <Check size={13} /> : index + 1}
                    </span>
                    {step}
                    {stage === index && (
                      <Loader2 size={13} className={styles.spin} />
                    )}
                  </li>
                ))}
              </ol>
              {job?.status === "rendering" && !pollError && (
                <div className={styles.renderProgress}>
                  <progress
                    aria-label="Video creation progress"
                    max={1}
                    value={job.progress}
                  />
                  <span>{Math.floor(job.progress * 100)}% complete</span>
                </div>
              )}
              {pollError && (
                <div className={styles.connectionError}>
                  <p role="alert">{pollError}</p>
                  <button
                    className="button secondary small"
                    onClick={() => {
                      setPollError("");
                      setPollAttempt((value) => value + 1);
                    }}
                  >
                    Check video status <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.empty}>
              <video
                className={styles.sampleVideo}
                src="/films/campaign/landscape-original.mp4"
                poster="/films/campaign/landscape-original.webp"
                controls
                preload="none"
                playsInline
                aria-label="Orbit sample launch video"
              />
              <div className={styles.emptyCopy}>
                <span>REAL SCREENS. REAL OUTPUT.</span>
                <h2>This is the kind of launch you can make.</h2>
                <p>
                  Orbit is a fictional sample product. Play the actual export,
                  then start with your own website.
                </p>
              </div>
            </div>
          )}
          <div className={styles.outputFooter}>
            <span>CAPTURE. CREATE. CELEBRATE.</span>
            <BrandMark />
          </div>
          {draftError && (
            <div className={styles.previewRecovery} role="alert">
              <p>{draftError}</p>
              <button
                type="button"
                onClick={() =>
                  restoreDraft
                    ? setDraftAttempt((value) => value + 1)
                    : void refreshDraftMedia()
                }
              >
                Retry opening preview
              </button>
              {restoreDraft && (
                <>
                  <Link href={`/editor/${restoreDraft.id}`}>
                    Open saved draft in studio
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setRestoreDraft(null);
                      setDraftError("");
                      setJob(null);
                      setUrl("");
                    }}
                  >
                    Start with another website
                  </button>
                </>
              )}
            </div>
          )}
        </section>
      </main>
      <footer className={styles.footer}>
        <span>A big first impression starts with a small link.</span>
        <Link href="/editor/new">
          Prefer to make it your own? Open the studio <ArrowRight size={13} />
        </Link>
      </footer>
    </div>
  );
}
