"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight, Check, Loader2 } from "lucide-react";
import { OFFERS, type Offer } from "../shared/billing";
import { billingPath, pricingPath } from "../shared/billing-context";
import styles from "./plans.module.css";

export function PlanCards({
  available,
  selected,
  projectId,
}: {
  available: boolean;
  selected?: string;
  projectId?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Offer | null>(null);
  const [error, setError] = useState("");
  async function buy(offer: Offer) {
    setBusy(offer);
    setError("");
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offer, ...(projectId ? { projectId } : {}) }),
      });
      const body = await response.json();
      if (response.status === 401) {
        router.push(
          `/auth?next=${encodeURIComponent(pricingPath({ plan: offer, projectId }))}`,
        );
        return;
      }
      if (!response.ok)
        throw new Error(
          body.error || "Checkout could not be opened. Please retry.",
        );
      const url = new URL(body.url);
      if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com")
        throw new Error("Checkout could not be opened. Please retry.");
      window.location.assign(url.href);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Checkout could not be opened. Please retry.",
      );
      setBusy(null);
    }
  }
  return (
    <div className={styles.plans}>
      {!available && (
        <p className={styles.notice}>
          Paid exports are not available yet. Try the studio with your own media
          for free.
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error} <Link href={billingPath({ projectId })}>View billing</Link>
        </p>
      )}
      <div className={styles.grid}>
        {(Object.keys(OFFERS) as Offer[]).map((offer) => {
          const plan = OFFERS[offer];
          return (
            <article
              key={offer}
              className={`${styles.card} ${offer === "studio" ? styles.studio : ""}`}
              data-selected={selected === offer}
            >
              <div className={styles.cardTop}>
                <span>
                  {offer === "studio"
                    ? "FOR YOUR NEXT FIVE CLIENTS"
                    : "FOR ONE GREAT REVEAL"}
                </span>
                {offer === "studio" && (
                  <span className={styles.badge}>REPEAT CLIENT WORK</span>
                )}
              </div>
              <h3>{plan.name}</h3>
              <p className={styles.price}>
                ${plan.dollars}
                <span>{plan.recurring ? "/ month" : "one time"}</span>
              </p>
              <p className={styles.description}>
                {offer === "studio"
                  ? "Keep every client launch moving, from the first cut to approval."
                  : "A complete launch campaign for one website or product."}
              </p>
              <ul>
                {[
                  offer === "studio"
                    ? "5 new project packages each billing month"
                    : "1 project package; activate when you need it",
                  "3 editable hooks × 3 formats: 9 MP4s",
                  "30 days to revise each activated project",
                  "Up to 10 exports per project; failed attempts excluded",
                  "Brand kits, recipes & client folders",
                  "Branded review links, comments & approval",
                ].map((feature) => (
                  <li key={feature}>
                    <Check size={15} aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
              {available ? (
                <button
                  className={styles.buy}
                  disabled={busy !== null}
                  onClick={() => void buy(offer)}
                >
                  {busy === offer ? (
                    <>
                      <Loader2 size={17} className="spin" /> Opening checkout…
                    </>
                  ) : (
                    <>
                      {offer === "studio"
                        ? "Start Studio"
                        : "Get a launch package"}
                      <ArrowUpRight size={17} />
                    </>
                  )}
                </button>
              ) : (
                <Link
                  className={styles.buy}
                  href={projectId ? `/editor/${projectId}` : "/editor/new"}
                >
                  Try the free preview <ArrowUpRight size={17} />
                </Link>
              )}
              <p className={styles.fine}>
                {offer === "studio"
                  ? "Renews monthly. Unused monthly packages expire. Cancel future renewals in Billing."
                  : "No subscription. Your unused package does not expire."}
              </p>
            </article>
          );
        })}
      </div>
      <p className={styles.terms}>
        Prices in USD. Each export is one MP4 or a complete nine-video ZIP. The
        same project keeps its access when you revise it. Review links last 14
        days.{" "}
        <Link href="/pricing#details">
          See how packages work <ArrowUpRight size={12} />
        </Link>
      </p>
    </div>
  );
}
