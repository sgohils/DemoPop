import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Brand } from "../../components/Brand";
import { PlanCards } from "../../components/PlanCards";
import { stripeConfigured } from "../../server/stripe";
import { cloudConfigured } from "../../server/supabase";
import styles from "../commercial.module.css";
import { billingPath, safeBillingProject } from "../../shared/billing-context";
export const metadata = {
  title: "Pricing — DemoPop",
  description:
    "Start free with 2 full-resolution video exports each month, no watermark or credit card. Launch packages from $29 or Studio for $79/month.",
};
export default async function Pricing({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; canceled?: string; project?: string }>;
}) {
  const query = await searchParams;
  const projectId = safeBillingProject(query.project);
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Brand />
        <nav aria-label="Main navigation">
          <Link href="/">Back home</Link>
          <Link href={billingPath({ projectId })}>Billing</Link>
          <Link href={projectId ? `/editor/${projectId}` : "/create"}>
            {projectId ? "Back to your project" : "Start free"}{" "}
            <ArrowUpRight size={14} />
          </Link>
        </nav>
      </header>
      <main className={styles.main}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>
            START FREE. GO FURTHER WHEN YOU NEED TO.
          </p>
          <h1>
            Your next video.
            <br />
            <span>Free to begin.</span>
          </h1>
          <p>
            Turn websites and product screens into branded videos.
            <br />
            Start with two free exports a month. Upgrade for a complete launch
            campaign and more revisions.
          </p>
        </div>
        {query.canceled === "1" && (
          <p className={styles.message} role="status">
            Checkout was canceled. Your projects and edits are still here.
          </p>
        )}
        {projectId && (
          <p className={styles.message}>
            Your edits are saved. Check your available exports or choose a paid
            launch package, then return to your project.{" "}
            <Link href={`/editor/${projectId}`}>
              Back to your project <ArrowUpRight size={14} />
            </Link>
          </p>
        )}
        <PlanCards
          available={cloudConfigured() && stripeConfigured()}
          selected={query.plan}
          projectId={projectId}
        />
        <section
          id="details"
          className={styles.details}
          aria-labelledby="package-details"
        >
          <p className={styles.eyebrow}>THE DETAILS</p>
          <h2 id="package-details">Made for work that ships.</h2>
          <div>
            <h3>What is included in Free?</h3>
            <p>
              Every account includes two single-video MP4 exports per calendar
              month, in full resolution with no watermark. Use any available
              template, format, or video length and edit as much as you like.
              The allowance resets on the first of each month at 00:00 UTC;
              unused exports do not roll over. Sign in to export, with no credit
              card required. Nine-video campaign ZIPs require a paid launch
              package or Studio.
            </p>
          </div>
          <div>
            <h3>What does a paid package cover?</h3>
            <p>
              One saved project. Its first paid export starts a 30-day revision
              window, with up to ten exports across single videos and full
              nine-video packages. Change captions, replace screens, and export
              revisions during that window. Failed render jobs do not count
              toward the ten exports. Existing paid project access and unused
              paid packages are applied before your free monthly allowance.
            </p>
          </div>
          <div>
            <h3>How does Studio renew?</h3>
            <p>
              You receive five new project packages after each successful
              monthly payment. Unused monthly packages expire at the end of that
              billing period. Already activated projects retain their own 30-day
              revision window. Buy a one-time package whenever you need another
              project.
            </p>
          </div>
          <div>
            <h3>Can I preview before using an export?</h3>
            <p>
              Yes. Sign in to capture your website and review an editable motion
              preview for free. Refine the captions, format, and length without
              using an export. Your two monthly free exports cover individual
              MP4s; paid packages cover complete launch campaigns and more
              revisions. You can also try your own screenshots or clips in the
              studio without an account.
            </p>
            <Link href="/create">
              Preview your website video <ArrowUpRight size={14} />
            </Link>
          </div>
          <div>
            <h3>What happens if an export fails?</h3>
            <p>
              Retry the failed job from export history. Failed jobs do not use a
              free export or another project package. Retries follow the monthly
              and daily limits. Your edits stay saved if you need to create a
              new export.
            </p>
          </div>
          <div>
            <h3>How do I cancel or get a receipt?</h3>
            <p>
              Open Billing to manage future renewals, update payment details,
              and view receipts. Canceling Studio stops future renewals; your
              current access continues until its expiry date. One-time packages
              never renew.
            </p>
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <Brand />
        <p>Your client’s next great first impression.</p>
        <Link href="/create">
          Create from a website <ArrowUpRight size={14} />
        </Link>
      </footer>
    </div>
  );
}
