import Link from "next/link";
import { Brand } from "../../components/Brand";
import { BillingAccount } from "../../components/BillingAccount";
import styles from "../commercial.module.css";
import {
  safeBillingProject,
  safeCheckoutSession,
  pricingPath,
} from "../../shared/billing-context";
export const metadata = {
  title: "Billing — DemoPop",
  robots: { index: false, follow: false },
};
export default async function Billing({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; project?: string }>;
}) {
  const query = await searchParams;
  const sessionId = safeCheckoutSession(query.session_id);
  const projectId = safeBillingProject(query.project);
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Brand />
        <nav aria-label="Main navigation">
          <Link href="/projects">Your projects</Link>
          <Link href={pricingPath({ projectId })}>Pricing</Link>
        </nav>
      </header>
      <main className={styles.main}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>YOUR LAUNCH WORKSPACE</p>
          <h1>
            Good work.
            <br />
            <span>Clear accounts.</span>
          </h1>
        </div>
        <BillingAccount sessionId={sessionId} projectId={projectId} />
      </main>
    </div>
  );
}
