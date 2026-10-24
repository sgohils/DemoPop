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
    "A $29 launch package or $79/month for five client projects. Branded videos, reusable recipes and client approvals.",
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
          <Link href={projectId ? `/editor/${projectId}` : "/editor/new"}>
            {projectId ? "Back to your project" : "Try the studio"}{" "}
            <ArrowUpRight size={14} />
          </Link>
        </nav>
      </header>
      <main className={styles.main}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>ONE CLIENT OR YOUR NEXT FIVE</p>
          <h1>
            A whole launch.
            <br />
            <span>A clear price.</span>
          </h1>
          <p>
            Turn client websites into branded video campaigns.
            <br />
            Keep the edit, collect approval, and get on with the next launch.
          </p>
        </div>
        {query.canceled === "1" && (
          <p className={styles.message} role="status">
            Checkout was canceled. Your projects and edits are still here.
          </p>
        )}
        {projectId && (
          <p className={styles.message}>
            Choose a package, then return to your saved project to export.{" "}
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
            <h3>What does a package cover?</h3>
            <p>
              One saved project. Its first export activates 30 days of access,
              with up to ten exports across single videos and full nine-video
              packages. Change captions, replace screens, and export revisions
              during that window. Failed render jobs do not count toward the ten
              exports.
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
            <h3>Can I try it before paying?</h3>
            <p>
              Yes. Sign in to capture your website and review an editable motion
              preview before paying. Refine the captions, format, and length;
              your first export activates a purchased package. You can also try
              your own screenshots or clips in the studio without an account.
            </p>
            <Link href="/create">
              Preview your website video <ArrowUpRight size={14} />
            </Link>
          </div>
          <div>
            <h3>What happens if an export fails?</h3>
            <p>
              Retry the failed job from export history. Failed jobs do not use
              another project package. Retries have a resource limit; if a
              project still fails, keep your saved edits and contact us through
              the support details on your receipt.
            </p>
          </div>
          <div>
            <h3>How do I cancel or get a receipt?</h3>
            <p>
              Open Billing to manage future renewals, update payment details,
              and view receipts. Canceling future renewals keeps your paid
              access through its stated expiry. One-time packages never renew.
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
