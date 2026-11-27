"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Loader2, RotateCw } from "lucide-react";
import type { BillingSummary } from "../shared/billing";
import {
  billingPath,
  pricingPath,
  safeBillingProject,
} from "../shared/billing-context";
import styles from "../app/commercial.module.css";
export function BillingAccount({
  sessionId,
  projectId,
}: {
  sessionId?: string;
  projectId?: string;
}) {
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState(
    sessionId ? "Confirming your purchase…" : "",
  );
  const [busy, setBusy] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [returnProjectId, setReturnProjectId] = useState(projectId);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setBusy(true);
      setError("");
      setPaymentConfirmed(false);
      setReturnProjectId(projectId);
      setMessage(sessionId ? "Confirming your purchase…" : "");
      try {
        const response = await fetch("/api/billing/status", {
          cache: "no-store",
          signal,
        });
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            body.error ||
              "Your billing details could not be loaded. Please try again.",
          );
        if (signal?.aborted) return;
        setSummary(body);
        if (sessionId && body.signedIn) {
          const confirmed = await fetch("/api/billing/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId }),
            signal,
          });
          const result = await confirmed.json();
          if (confirmed.status === 401)
            setSummary({ ...body, signedIn: false });
          if (!confirmed.ok)
            throw new Error(
              result.error || "Your purchase could not be confirmed yet.",
            );
          if (signal?.aborted) return;
          if (result.confirmed) {
            // The paid session's persisted return context takes precedence over
            // URL parameters, which are navigation hints and never proof of payment.
            setReturnProjectId(safeBillingProject(result.projectId));
            setPaymentConfirmed(true);
            setMessage("Payment confirmed. Your project packages are ready.");
            const refreshed = await fetch("/api/billing/status", {
              cache: "no-store",
              signal,
            });
            const next = await refreshed.json();
            if (!refreshed.ok)
              throw new Error(
                next.error ||
                  "Your export balance could not be refreshed. Please try again.",
              );
            if (!signal?.aborted) setSummary(next);
          } else
            setMessage(
              "Your payment is still being confirmed. Refresh in a moment; please do not purchase again.",
            );
        } else if (sessionId)
          setMessage(
            "Sign in to the account used at checkout to confirm your purchase.",
          );
      } catch (failure) {
        if (!signal?.aborted) {
          setError(
            failure instanceof Error
              ? failure.message
              : "Your billing details could not be loaded. Please try again.",
          );
          if (sessionId) setMessage("");
        }
      } finally {
        if (!signal?.aborted) setBusy(false);
      }
    },
    [sessionId, projectId],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, attempt]);
  async function manage() {
    setPortalBusy(true);
    setError("");
    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error ||
            "Your billing portal could not be opened. Please try again.",
        );
      const url = new URL(body.url);
      if (url.protocol !== "https:" || url.hostname !== "billing.stripe.com")
        throw new Error(
          "Your billing portal could not be opened. Please try again.",
        );
      window.location.assign(url.href);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Your billing portal could not be opened. Please try again.",
      );
      setPortalBusy(false);
    }
  }
  return (
    <>
      {message && (
        <p className={styles.message} role="status">
          {message}
        </p>
      )}
      {error && (
        <p className={`${styles.message} ${styles.error}`} role="alert">
          {error}
        </p>
      )}
      <div className={styles.accountActions}>
        <Link href={pricingPath({ projectId: returnProjectId })}>
          Compare plans <ArrowUpRight size={14} />
        </Link>
        <button
          className={styles.refresh}
          disabled={busy}
          onClick={() => setAttempt((n) => n + 1)}
        >
          {busy ? (
            <Loader2 size={15} className="spin" />
          ) : (
            <RotateCw size={15} />
          )}{" "}
          Refresh billing
        </button>
      </div>
      {!summary && busy && <p role="status">Loading your billing details…</p>}
      {summary && !summary.signedIn ? (
        <div className={styles.accountCard}>
          <h2>Your packages, in one place.</h2>
          <p>
            Sign in to use your free monthly exports, see your purchases, and
            manage Studio.
          </p>
          <Link
            href={`/auth?next=${encodeURIComponent(billingPath({ sessionId, projectId }))}`}
          >
            Sign in <ArrowUpRight size={14} />
          </Link>
        </div>
      ) : summary && !summary.enabled ? (
        <div className={styles.accountCard}>
          <h2>You’re using the free beta.</h2>
          <p>
            Paid plans are disabled for this workspace. You can edit, save, and
            export videos within the daily limit.
          </p>
          <Link href="/editor/new">
            Open the studio <ArrowUpRight size={14} />
          </Link>
        </div>
      ) : (
        summary && (
          <>
            {returnProjectId && (
              <section
                className={`${styles.accountCard} ${styles.returnProject}`}
                aria-label="Continue saved project"
              >
                <div>
                  <h2>
                    {paymentConfirmed
                      ? "Your next export is waiting."
                      : "Pick up your saved project."}
                  </h2>
                  <p>
                    {paymentConfirmed
                      ? "Your payment is confirmed. Open the project to review your edit and start its export."
                      : "Return to your edit at any time. Export access is checked when you start an export."}
                  </p>
                </div>
                <Link href={`/editor/${returnProjectId}`}>
                  {paymentConfirmed
                    ? "Continue to export"
                    : "Return to saved project"}{" "}
                  <ArrowUpRight size={16} />
                </Link>
              </section>
            )}
            <div className={styles.accountGrid}>
              {summary.free && (
                <section className={styles.accountCard} aria-label="Free plan">
                  <h2>Your free monthly exports</h2>
                  <div className={styles.balance}>
                    {summary.free.remaining}{" "}
                    <span>of {summary.free.limit}</span>
                  </div>
                  <p>
                    Single-video MP4 exports remaining. Full quality, no
                    watermark, and no card required. Queued exports count toward
                    your allowance; failed exports do not.
                  </p>
                  <p>
                    Resets{" "}
                    {new Date(summary.free.resetsAt).toLocaleDateString(
                      undefined,
                      {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        timeZone: "UTC",
                      },
                    )}{" "}
                    at 00:00 UTC. Unused free exports do not roll over.
                  </p>
                  <Link
                    href={
                      returnProjectId ? `/editor/${returnProjectId}` : "/create"
                    }
                  >
                    {summary.free.remaining
                      ? "Create your free video"
                      : "Keep editing your next video"}{" "}
                    <ArrowUpRight size={14} />
                  </Link>
                </section>
              )}
              <section className={styles.accountCard}>
                <h2>Your paid project packages</h2>
                <div className={styles.balance}>{summary.remaining}</div>
                <p>
                  Unused project{" "}
                  {summary.remaining === 1 ? "package" : "packages"}. A paid
                  package activates its 30-day revision window on the first paid
                  export.
                </p>
                <Link
                  href={
                    returnProjectId ? `/editor/${returnProjectId}` : "/create"
                  }
                >
                  Continue to your video <ArrowUpRight size={14} />
                </Link>
              </section>
              <section className={styles.accountCard}>
                <h2>
                  {summary.subscription
                    ? "Your Studio subscription"
                    : "Upgrade when you need more"}
                </h2>
                <p>
                  {summary.subscription
                    ? `${summary.subscription.status.replaceAll("_", " ")}${summary.subscription.cancelAtPeriodEnd ? " · ends after your current billing period" : ""}. Five new project packages are added after each successful monthly payment.`
                    : "Buy one project package for $29, or choose Studio at $79/month for five new project packages each month."}
                </p>
                {summary.canManageBilling !== false ? (
                  <button disabled={portalBusy} onClick={() => void manage()}>
                    {portalBusy && <Loader2 className="spin" size={14} />}Manage
                    billing & receipts <ArrowUpRight size={14} />
                  </button>
                ) : (
                  <Link href={pricingPath({ projectId: returnProjectId })}>
                    Upgrade for campaign packages <ArrowUpRight size={14} />
                  </Link>
                )}
              </section>
            </div>
            <section
              className={styles.details}
              aria-labelledby="active-projects"
            >
              <h2 id="active-projects">Projects in their revision window</h2>
              {!summary.projects.length && (
                <p>Projects appear here after their first paid export.</p>
              )}
              <ul className={styles.projectList}>
                {summary.projects.map((project, index) => (
                  <li key={`${project.id}:${index}`}>
                    <div>
                      <Link href={`/editor/${project.id}`}>{project.name}</Link>
                      <p>
                        {project.exportsUsed} of 10 exports used · revision
                        window ends{" "}
                        {new Date(project.expiresAt).toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric", year: "numeric" },
                        )}
                      </p>
                    </div>
                    <Link href={`/editor/${project.id}`}>
                      Open project <ArrowUpRight size={14} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )
      )}
    </>
  );
}
