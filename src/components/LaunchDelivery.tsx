"use client";
import { useEffect, useState } from "react";
import { Package, Link2, Copy, Loader2, X } from "lucide-react";
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
}: {
  project: ProjectInput;
  projectId: string | null;
  authorized: boolean;
  busy: boolean;
  revision: string;
  onHooks: (hooks: string[]) => void;
  onExport: () => void;
}) {
  const [jobs, setJobs] = useState<HistoryJob[]>([]),
    [jobId, setJobId] = useState(""),
    [agency, setAgency] = useState(project.client || project.name),
    [download, setDownload] = useState(true),
    [reviews, setReviews] = useState<Review[]>([]),
    [working, setWorking] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [reload, setReload] = useState(0),
    [reviewOpen, setReviewOpen] = useState(false);
  useEffect(() => {
    let live = true;
    setReviews([]);
    setJobs([]);
    if (!authorized || !projectId || !reviewOpen) return;
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
          setJobs(
            exports.jobs.filter(
              (job: HistoryJob) =>
                job.status === "completed" && !job.output_expired_at,
            ),
          );
          setReviews(links.reviews);
        }
      })
      .catch((error) => {
        if (live) setError(error.message);
      });
    return () => {
      live = false;
    };
  }, [authorized, projectId, revision, reload, reviewOpen]);
  const hooks = launchHooks(project);
  async function createLink() {
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/projects/${projectId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: jobId || jobs[0]?.id,
          agencyName: agency,
          allowDownload: download,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setReload((value) => value + 1);
      setNotice(
        "Review link created. Copy it below to share with your client.",
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setWorking(false);
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
          <input
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
        {!jobs.length && (
          <p className="section-hint">
            Finish an export to create its review link.
          </p>
        )}
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
          {reviews
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
                      setWorking(true);
                      setError("");
                      try {
                        const response = await fetch(
                          `/api/reviews/${review.id}`,
                          { method: "DELETE" },
                        );
                        const body = await response.json();
                        if (!response.ok) throw new Error(body.error);
                        setReload((value) => value + 1);
                        setNotice("Review link revoked.");
                      } catch (error) {
                        setError((error as Error).message);
                      } finally {
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
