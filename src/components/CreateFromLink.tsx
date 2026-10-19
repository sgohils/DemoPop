"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  ExternalLink,
  Film,
  Globe,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Brand } from "./Brand";
import { BrandMark } from "./BrandMark";
import styles from "./create-from-link.module.css";

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
  };
}

export function CreateFromLink({ configured }: { configured: boolean }) {
  const [url, setUrl] = useState("");
  const [format, setFormat] = useState<Format>("landscape");
  const [duration, setDuration] = useState<15 | 30 | 60>(30);
  const [job, setJob] = useState<Job | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
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
  const busy = submitting || active(job?.status);
  const ready = job?.status === "completed" && Boolean(job.videoUrl);
  const jobId = job?.id;
  const isJobActive = active(job?.status);
  const outputFormat = job?.outputFormat ?? format;
  const outputDuration = job?.outputDuration ?? duration;
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
            savedAt: pending.savedAt,
          }
        : null);
    if (saved) {
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
    setHydrated(true);
    return () => {
      request.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          url,
          format,
          duration,
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
    job?.id,
    job?.outputFormat,
    job?.outputDuration,
    hydrated,
  ]);

  useEffect(() => {
    if (!jobId || !isJobActive) return;
    const id = jobId;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const response = await fetch(
          `/api/create-from-link/${encodeURIComponent(id)}`,
          {
            signal: controller.signal,
            cache: "no-store",
          },
        );
        const body = await response.json();
        if (cancelled) return;
        if (response.status === 401) setAuthRequired(true);
        if (response.status === 404 || response.status === 410) {
          setJob((previous) =>
            previous?.id === id
              ? {
                  ...previous,
                  status: "failed",
                  error:
                    body.error ||
                    "This video is no longer available. Generate it again to continue.",
                }
              : previous,
          );
          return;
        }
        if (!response.ok)
          throw new Error(
            body.error || "We could not check your video. Try checking again.",
          );
        const next = readJob(body, id);
        setJob((previous) =>
          previous?.id === id
            ? { ...previous, ...next, mode: next.mode ?? previous.mode }
            : previous,
        );
        setPollError("");
        if (active(next.status)) timer = setTimeout(poll, 1800);
      } catch (cause) {
        if (!cancelled && !controller.signal.aborted)
          setPollError(message(cause));
      }
    };
    void poll();
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
    // Continue polling through status changes without restarting in-flight requests.
  }, [jobId, isJobActive, pollAttempt]);

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    if (submitLock.current || busy || !url.trim()) return;
    submitLock.current = true;
    const current = ++generation.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setSubmitting(true);
    setError("");
    setSavedProjectId(null);
    setPollError("");
    setAuthRequired(false);
    setPlaybackError(false);
    setRefreshing(false);
    setJob(null);
    try {
      const response = await fetch("/api/create-from-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), format, duration }),
        signal: controller.signal,
      });
      const body = await response.json();
      if (current !== generation.current || controller.signal.aborted) return;
      if (response.status === 401) {
        setAuthRequired(true);
        try {
          localStorage.setItem(
            pendingStorageKey,
            JSON.stringify({ url, format, duration, savedAt: Date.now() }),
          );
        } catch {
          // Same-tab authentication can still restore the session draft.
        }
      }
      if (!response.ok) {
        if (
          typeof body.projectId === "string" &&
          /^[a-f0-9-]{36}$/i.test(body.projectId)
        )
          setSavedProjectId(body.projectId);
        throw new Error(
          body.error || "Your video could not be started. Please try again.",
        );
      }
      setJob({
        ...readJob(body),
        outputFormat: format,
        outputDuration: duration,
      });
      try {
        localStorage.removeItem(pendingStorageKey);
      } catch {
        // Clearing an optional handoff must not interrupt video creation.
      }
    } catch (cause) {
      if (current === generation.current && !controller.signal.aborted)
        setError(message(cause));
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
    <div className={styles.page}>
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
            One link becomes a complete launch video. We capture your product,
            pick up your branding, and put it all in motion.
          </p>
          <form className={styles.form} onSubmit={generate}>
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
                }}
                disabled={busy}
                aria-describedby="create-help"
              />
            </div>
            <p id="create-help" className={styles.hint}>
              Use a public website. No screenshots or editing needed.
            </p>
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
                Sign in to generate <ArrowRight size={18} />
              </Link>
            ) : (
              <button
                type="submit"
                className={`button primary ${styles.generate}`}
                disabled={busy || !hydrated || !url.trim()}
              >
                {busy ? (
                  <>
                    <Loader2 size={18} className={styles.spin} /> Creating your
                    video…
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />{" "}
                    {job?.status === "failed"
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
              ? "Sign in when prompted. Your video and editable project are saved to your account."
              : "Local videos expire after 45 minutes. Download your MP4 to keep it."}
          </p>
          <div className={styles.included}>
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
              <span className={styles.liveDot} /> DEMOPOP — YOUR LAUNCH FILM
            </span>
            <span>
              {outputDuration.toString().padStart(2, "0")} SEC /{" "}
              {outputFormat === "landscape"
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
              <div className={styles.previewArt} aria-hidden="true">
                <div className={styles.previewBrowser}>
                  <div>
                    <i />
                    <i />
                    <i />
                    <span>your next big thing</span>
                  </div>
                  <BrandMark />
                  <span>Made to stand out.</span>
                </div>
                <div className={styles.floatingLabel}>
                  <Film size={14} /> Website → launch film
                </div>
              </div>
              <div className={styles.emptyCopy}>
                <span>ONE LINK. THE WHOLE STORY.</span>
                <h2>
                  From live site
                  <br />
                  to launch night.
                </h2>
                <p>
                  Your captures, branding, and motion.
                  <br />
                  One finished video.
                </p>
              </div>
            </div>
          )}
          <div className={styles.outputFooter}>
            <span>CAPTURE. CREATE. CELEBRATE.</span>
            <BrandMark />
          </div>
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
