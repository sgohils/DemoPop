"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Package, Link2, Copy, Loader2, X, Play } from "lucide-react";
import { launchHooks } from "../shared/launch-kit";
import type { ProjectInput } from "../shared/project";
import type { HistoryJob } from "./ExportHistory";
type Review = {
  id: string;
  url: string;
  agency_name: string;
  status: string;
  approved_by: string | null;
  expires_at: string;
  revoked_at: string | null;
  review_comments: {
    id: string;
    author: string;
    body: string;
    seconds: number;
  }[];
};
export function LaunchDelivery({
  project,
  projectId,
  authorized,
  busy,
  revision,
  onHooks,
  onExport,
  onPreview,
}: {
  project: ProjectInput;
  projectId: string | null;
  authorized: boolean;
  busy: boolean;
  revision: string;
  onHooks: (hooks: string[]) => void;
  onExport: () => void;
  onPreview: () => void;
}) {
  const [jobs, setJobs] = useState<HistoryJob[]>([]),
    [jobId, setJobId] = useState(""),
    [agency, setAgency] = useState(project.client || project.name),
    [download, setDownload] = useState(true),
    [reviews, setReviews] = useState<Review[]>([]),
    [reviewLoading, setReviewLoading] = useState(false),
    [reviewLoadError, setReviewLoadError] = useState(""),
    [working, setWorking] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [reload, setReload] = useState(0),
    [reviewOpen, setReviewOpen] = useState(false);
  const reviewScope = `${projectId ?? ""}:${authorized}:${reviewOpen}`;
  const activeReviewScope = useRef(reviewScope);
  useLayoutEffect(() => {
    activeReviewScope.current = reviewScope;
    setWorking(false);
    setError("");
    setNotice("");
  }, [reviewScope]);
  useEffect(() => {
    let live = true;
    setReviews([]);
    setJobs([]);
    setJobId("");
    setReviewLoadError("");
    if (!authorized || !projectId || !reviewOpen) return;
    setReviewLoading(true);
    void Promise.all(
      [
        fetch(`/api/projects/${projectId}/exports`, { cache: "no-store" }),
        fetch(`/api/projects/${projectId}/reviews`, { cache: "no-store" }),
      ].map(async (response) => {
        const body = await (await response).json();
        if (body.error) throw new Error(body.error);
        return body;
      }),
    )
      .then(([exports, links]) => {
        if (live) {
          const availableJobs = exports.jobs.filter(
            (job: HistoryJob) =>
              job.status === "completed" && !job.output_expired_at,
          );
          setJobs(availableJobs);
          setJobId((current) =>
            availableJobs.some((job: HistoryJob) => job.id === current)
              ? current
              : (availableJobs[0]?.id ?? ""),
          );
          setReviews(links.reviews);
        }
      })
      .catch((error) => {
        if (live) setReviewLoadError(error.message);
      })
      .finally(() => {
        if (live) setReviewLoading(false);
      });
    return () => {
      live = false;
    };
  }, [authorized, projectId, revision, reload, reviewOpen]);
  const hooks = launchHooks(project);
  async function createLink() {
    const requestScope = reviewScope;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/projects/${projectId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: jobs.some((job) => job.id === jobId)
            ? jobId
            : jobs[0]?.id,
          agencyName: agency,
          allowDownload: download,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      if (activeReviewScope.current !== requestScope) return;
      setReload((value) => value + 1);
      setNotice(
        "Review link created. Copy it below to share with your client.",
      );
    } catch (error) {
      if (activeReviewScope.current === requestScope)
        setError((error as Error).message);
    } finally {
      if (activeReviewScope.current === requestScope) setWorking(false);
    }
  }
  return (
    <div className="launch-delivery">
      <div className="package-summary">
        <Package size={21} />
        <div>
          <strong>One edit. A complete launch.</strong>
          <p>
            9 MP4s · 3 hooks × 3 formats
            <br />
            Landscape, vertical, square + thumbnail and manifest.
          </p>
        </div>
      </div>
      {hooks.map((hook, index) => (
        <label className="field" key={index}>
          <span>
            Package hook {index + 1}
            <small>{hook.length}/70</small>
          </span>
          <textarea
            rows={2}
            maxLength={70}
            value={hook}
            onChange={(event) =>
              onHooks(
                hooks.map((value, position) =>
                  position === index ? event.target.value : value,
                ),
              )
            }
          />
        </label>
      ))}
      <button
        type="button"
        className="button secondary small package-preview-action"
        onClick={onPreview}
      >
        <Play size={14} /> Preview 9 versions
      </button>
      <button
        className="button primary small"
        disabled={!authorized || busy || hooks.some((hook) => !hook.trim())}
        onClick={onExport}
      >
        <Package size={14} /> Export launch package
      </button>
      <p className="section-hint">
        A ZIP containing every format and opening. Packages use 9 of your daily
        render allowance.{" "}
        {authorized
          ? "Edits after export apply to your next package."
          : "Connect your account and export worker to download a package."}
      </p>
      <hr />
      <details
        className="review-management"
        onToggle={(event) => setReviewOpen(event.currentTarget.open)}
      >
        <summary>Client review & approval</summary>
        <p className="section-hint">
          A branded review page for a completed export. Clients can leave
          timestamped feedback and approve that exact version. Links expire
          after 14 days.
        </p>
        <label className="field">
          <span>Review brand name</span>
          <input
            maxLength={60}
            value={agency}
            onChange={(event) => setAgency(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Version to review</span>
          <select
            value={jobId || jobs[0]?.id || ""}
            onChange={(event) => setJobId(event.target.value)}
            disabled={!jobs.length}
          >
            <option value="" disabled>
              Select an available export
            </option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.output_kind === "launch-pack" ? "Launch package" : "Video"}{" "}
                ·{" "}
                {job.created_at
                  ? new Date(job.created_at).toLocaleString()
                  : job.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        <label className="kit-checkbox">
          <input
            type="checkbox"
            checked={download}
            onChange={(event) => setDownload(event.target.checked)}
          />{" "}
          Allow download of this video or package
        </label>
        <button
          className="button secondary small"
          disabled={
            !authorized ||
            !projectId ||
            !jobs.length ||
            !agency.trim() ||
            working
          }
          onClick={() => void createLink()}
        >
          {working ? (
            <Loader2 size={14} className="spin" />
          ) : (
            <Link2 size={14} />
          )}{" "}
          Create review link
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="section-hint">
            {notice}
          </p>
        )}
        <div className="review-links">
          {reviewLoading ? (
            <p className="section-hint" role="status">
              <Loader2 size={14} className="spin" aria-hidden="true" />
              Loading completed exports and review links…
            </p>
          ) : reviewLoadError ? (
            <div role="alert">
              <p className="error">
                Could not load review links: {reviewLoadError}
              </p>
              <button
                type="button"
                className="button secondary small"
                onClick={() => setReload((value) => value + 1)}
              >
                <Link2 size={14} /> Try again
              </button>
            </div>
          ) : !authorized || !projectId ? (
            <p className="section-hint" role="status">
              Sign in and save this project to manage client review links.
            </p>
          ) : jobs.length === 0 ? (
            <p className="section-hint" role="status">
              Complete an export before creating a client review link.
            </p>
          ) : reviews.every((review) => review.revoked_at) ? (
            <p className="section-hint" role="status">
              No active review links yet. Create one for a completed export
              above.
            </p>
          ) : null}
          {!reviewLoading && !reviewLoadError && reviews
            .filter((review) => !review.revoked_at)
            .map((review) => (
              <article key={review.id}>
                <div className="review-link-heading">
                  <strong>{review.status.replace(/_/g, " ")}</strong>
                  <small>
                    {review.approved_by
                      ? `Approved by ${review.approved_by}`
                      : `Expires ${new Date(review.expires_at).toLocaleDateString()}`}
                  </small>
                </div>
                <input
                  aria-label={`Review link for ${review.agency_name}`}
                  readOnly
                  value={review.url}
                  onFocus={(event) => event.target.select()}
                />
                <div className="kit-actions">
                  <a
                    href={review.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-link"
                  >
                    Open review
                  </a>
                  <button
                    className="text-link"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(review.url);
                        setNotice("Review link copied.");
                      } catch {
                        setNotice("Select and copy the review link above.");
                      }
                    }}
                  >
                    <Copy size={12} /> Copy link
                  </button>
                  <button
                    className="text-link"
                    disabled={working}
                    onClick={async () => {
                      const requestScope = reviewScope;
                      setWorking(true);
                      setError("");
                      try {
                        const response = await fetch(
                          `/api/reviews/${review.id}`,
                          { method: "DELETE" },
                        );
                        const body = await response.json();
                        if (!response.ok) throw new Error(body.error);
                        if (activeReviewScope.current !== requestScope) return;
                        setReload((value) => value + 1);
                        setNotice("Review link revoked.");
                      } catch (error) {
                        if (activeReviewScope.current === requestScope)
                          setError((error as Error).message);
                      } finally {
                        if (activeReviewScope.current === requestScope)
                          setWorking(false);
                      }
                    }}
                  >
                    <X size={12} /> Revoke
                  </button>
                </div>
                {review.review_comments.map((comment) => (
                  <blockquote key={comment.id}>
                    <strong>
                      {comment.author} · {comment.seconds.toFixed(1)}s
                    </strong>
                    <p>{comment.body}</p>
                  </blockquote>
                ))}
              </article>
            ))}
        </div>
      </details>
    </div>
  );
}
