"use client";
import { useEffect, useState } from "react";
import { TEMPLATES } from "../shared/project";
export type HistoryJob = {
  id: string;
  status: "queued" | "rendering" | "completed" | "failed";
  progress: number;
  attempt_count: number;
  error: string | null;
  created_at?: string;
  format?: string;
  template?: string;
  output_expired_at?: string | null;
};
export function ExportHistory({
  projectId,
  revision,
  active,
  onRetried,
  onUnauthorized,
}: {
  projectId: string;
  revision: string;
  active: boolean;
  onRetried: (job: HistoryJob) => void;
  onUnauthorized: () => void;
}) {
  const [jobs, setJobs] = useState<HistoryJob[]>([]),
    [more, setMore] = useState(false),
    [offset, setOffset] = useState(0);
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState<string | null>(null),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    fetch(`/api/projects/${projectId}/exports?offset=${offset}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const body = await response.json();
        if (response.status === 401) onUnauthorized();
        if (!response.ok) throw new Error(body.error);
        if (live) {
          setJobs((existing) =>
            offset === 0
              ? body.jobs
              : [
                  ...existing,
                  ...body.jobs.filter(
                    (job: HistoryJob) =>
                      !existing.some((old) => old.id === job.id),
                  ),
                ],
          );
          setMore(body.hasMore);
        }
      })
      .catch((failure) => {
        if (live) setError(failure.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [projectId, revision, offset, attempt]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setOffset(0);
  }, [revision, projectId]);
  async function action(job: HistoryJob, retry = false) {
    setBusy(job.id);
    setError("");
    try {
      const response = await fetch(
        `/api/jobs/${job.id}/${retry ? "retry" : "download"}`,
        { method: retry ? "POST" : "GET", cache: "no-store" },
      );
      const body = await response.json();
      if (response.status === 401) onUnauthorized();
      if (!response.ok) throw new Error(body.error);
      if (retry) {
        onRetried({ ...job, status: "queued", progress: 0, error: null });
        setAttempt((x) => x + 1);
      } else {
        const link = document.createElement("a");
        link.href = body.url;
        link.download = "demopop-redesign.mp4";
        link.click();
      }
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="export-history" aria-labelledby="export-history-title">
      <div className="history-heading">
        <h2 id="export-history-title">Export history</h2>
        <button
          className="text-link"
          onClick={() => {
            setOffset(0);
            setAttempt((x) => x + 1);
          }}
          disabled={loading}
        >
          Refresh history
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!jobs.length && !loading && !error && (
        <p className="section-hint">Your exported versions will appear here.</p>
      )}
      <ul>
        {jobs.map((job) => (
          <li key={job.id} className="history-row">
            <div>
              <strong>
                {job.output_expired_at
                  ? "Expired"
                  : job.status.charAt(0).toUpperCase() + job.status.slice(1)}
              </strong>
              <p>
                {job.created_at
                  ? new Date(job.created_at).toLocaleString()
                  : "Recent export"}{" "}
                · {job.format === "landscape" ? "Landscape" : "Vertical"} ·{" "}
                {TEMPLATES.find((t) => t.id === job.template)?.name ||
                  "Classic Reveal"}
              </p>
              {job.status === "failed" && <p>{job.error}</p>}
            </div>
            {job.status === "completed" && !job.output_expired_at && (
              <button
                className="button secondary small"
                disabled={busy === job.id}
                onClick={() => void action(job)}
              >
                Download MP4
              </button>
            )}
            {job.status === "failed" && job.attempt_count < 3 && (
              <button
                className="text-link"
                disabled={active || busy === job.id}
                onClick={() => void action(job, true)}
              >
                Retry export
              </button>
            )}
          </li>
        ))}
      </ul>
      {loading && <p role="status">Loading export history…</p>}
      {more && (
        <button
          className="button secondary small"
          disabled={loading}
          onClick={() => setOffset((x) => x + 20)}
        >
          Load older exports
        </button>
      )}
    </section>
  );
}
