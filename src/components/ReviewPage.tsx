"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { readableTextColor } from "../shared/video-style";
import {
  Check,
  MessageSquare,
  Download,
  RefreshCw,
  Loader2,
} from "lucide-react";
import "./review.css";
type ReviewData = {
  agencyName: string;
  name: string;
  color: string;
  status: string;
  approvedBy: string | null;
  approvedAt: string | null;
  expiresAt: string;
  duration: number;
  playbackUrl: string;
  downloadUrl: string | null;
  outputKind: string;
  comments: {
    id: string;
    author: string;
    body: string;
    seconds: number;
    created_at: string;
  }[];
};
export function ReviewPage({ token }: { token: string }) {
  const [data, setData] = useState<ReviewData | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0),
    [author, setAuthor] = useState(""),
    [body, setBody] = useState(""),
    [seconds, setSeconds] = useState(0),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const video = useRef<HTMLVideoElement>(null),
    resume = useRef(0),
    manualTimestamp = useRef(false);
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    setError("");
    void fetch(`/api/reviews/${token}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) {
          if (live && [404, 410].includes(response.status)) setData(null);
          throw new Error(body.error);
        }
        if (live) {
          if (video.current && video.current.readyState >= 1)
            resume.current = video.current.currentTime;
          setData(body);
        }
      })
      .catch((error) => {
        if (live) setError(error.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    const timer = setInterval(() => setRevision((value) => value + 1), 240000);
    return () => {
      live = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [token, revision]);
  async function submit(approve: boolean) {
    if (!data) return;
    video.current?.pause();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/reviews/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author: author.trim(),
          body: approve ? "" : body.trim(),
          seconds: Math.min(seconds, data.duration),
          approve,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setBody("");
      setNotice(
        approve
          ? "You approved this exported version."
          : "Your feedback was added to this version.",
      );
      setRevision((value) => value + 1);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="review-page"
      style={
        {
          "--review-accent": data?.color || "#365DDB",
          "--review-accent-ink": readableTextColor(data?.color || "#365DDB"),
        } as CSSProperties
      }
    >
      <header>
        <strong>{data?.agencyName || "Video review"}</strong>
        <span>CLIENT REVIEW</span>
      </header>
      <main>
        {loading && (
          <div className="review-loading" role="status">
            <Loader2 className="spin" size={20} /> Opening your review…
          </div>
        )}
        {error && (
          <div className="review-error" role="alert">
            <p>{error}</p>
            <button
              onClick={() => {
                setLoading(true);
                setRevision((value) => value + 1);
              }}
            >
              <RefreshCw size={15} /> Retry
            </button>
          </div>
        )}
        {data && (
          <>
            <div className="review-title">
              <div>
                <p>PREPARED BY {data.agencyName.toUpperCase()}</p>
                <h1>{data.name}</h1>
                <span>
                  This page shows the exported version sent for review.
                </span>
              </div>
              <span className={`review-status ${data.status}`}>
                {data.status === "approved" ? (
                  <Check size={15} />
                ) : (
                  <MessageSquare size={15} />
                )}{" "}
                {data.status.replace(/_/g, " ")}
              </span>
            </div>
            <div className="review-layout">
              <section className="review-player-section">
                <video
                  ref={video}
                  src={data.playbackUrl}
                  controls
                  controlsList={data.downloadUrl ? undefined : "nodownload"}
                  playsInline
                  preload="metadata"
                  onLoadedMetadata={() => {
                    if (video.current)
                      video.current.currentTime = resume.current;
                  }}
                  onTimeUpdate={(event) => {
                    if (!manualTimestamp.current)
                      setSeconds(event.currentTarget.currentTime);
                  }}
                  onPlay={() => {
                    manualTimestamp.current = false;
                  }}
                  onPointerDown={() => {
                    manualTimestamp.current = false;
                  }}
                  onKeyDown={() => {
                    manualTimestamp.current = false;
                  }}
                  onError={() =>
                    setError(
                      "Video access could not load. Retry to refresh access.",
                    )
                  }
                />
                <div className="review-player-footer">
                  <span>
                    {data.duration}s ·{" "}
                    {data.outputKind === "launch-pack"
                      ? "Landscape package preview"
                      : "Exported video"}
                  </span>
                  {data.downloadUrl && (
                    <a href={data.downloadUrl} download>
                      <Download size={15} /> Download{" "}
                      {data.outputKind === "launch-pack"
                        ? "launch package"
                        : "video"}
                    </a>
                  )}
                </div>
                {data.status === "approved" && (
                  <div className="review-approved">
                    <Check size={18} />
                    <p>
                      Approved by <strong>{data.approvedBy}</strong>
                      {data.approvedAt
                        ? ` on ${new Date(data.approvedAt).toLocaleDateString()}`
                        : ""}
                      .
                    </p>
                  </div>
                )}
              </section>
              <aside className="review-feedback">
                <h2>Feedback on this version</h2>
                <p>
                  Pause at a moment to attach your comment to that timestamp.
                </p>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submit(false);
                  }}
                >
                  <label>
                    Your name
                    <input
                      required
                      maxLength={80}
                      value={author}
                      onChange={(event) => setAuthor(event.target.value)}
                      onFocus={() => video.current?.pause()}
                    />
                  </label>
                  <label>
                    Comment
                    <textarea
                      required
                      maxLength={2000}
                      rows={4}
                      value={body}
                      onChange={(event) => setBody(event.target.value)}
                      onFocus={() => video.current?.pause()}
                      placeholder="What would you like to change?"
                    />
                  </label>
                  <label className="review-timestamp">
                    At second
                    <input
                      type="number"
                      min={0}
                      max={data.duration}
                      step={0.1}
                      value={Number(seconds.toFixed(1))}
                      onFocus={() => video.current?.pause()}
                      onChange={(event) => {
                        const time = Math.max(
                          0,
                          Math.min(data.duration, Number(event.target.value)),
                        );
                        manualTimestamp.current = true;
                        resume.current = time;
                        setSeconds(time);
                        if (video.current && video.current.readyState >= 1)
                          video.current.currentTime = time;
                      }}
                    />
                  </label>
                  <button
                    className="review-primary"
                    disabled={busy || !author.trim() || !body.trim()}
                  >
                    <MessageSquare size={15} /> Add timestamped comment
                  </button>
                </form>
                <button
                  className="review-approve-button"
                  disabled={
                    busy || !author.trim() || data.status === "approved"
                  }
                  onClick={() => void submit(true)}
                >
                  <Check size={15} /> Approve this version
                </button>
                {!author.trim() && (
                  <small>Enter your name to comment or approve.</small>
                )}
                {notice && (
                  <p role="status" className="review-notice">
                    {notice}
                  </p>
                )}
                <div className="review-comments">
                  {data.comments.length ? (
                    data.comments.map((comment) => (
                      <article key={comment.id}>
                        <div>
                          <strong>{comment.author}</strong>
                          <button
                            onClick={() => {
                              if (video.current) {
                                manualTimestamp.current = false;
                                video.current.pause();
                                video.current.currentTime = comment.seconds;
                              }
                            }}
                          >
                            {comment.seconds.toFixed(1)}s ↗
                          </button>
                        </div>
                        <p>{comment.body}</p>
                        <small>
                          {new Date(comment.created_at).toLocaleString()}
                        </small>
                      </article>
                    ))
                  ) : (
                    <p>No comments yet.</p>
                  )}
                </div>
              </aside>
            </div>
            <p className="review-expiry">
              Review access expires{" "}
              {new Date(data.expiresAt).toLocaleDateString()}.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
