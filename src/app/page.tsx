import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Check, Plus } from "lucide-react";
import { Brand } from "../components/Brand";
import { BrandMark } from "../components/BrandMark";
import { LaunchScroll } from "../components/LaunchScroll";
import { LaunchCampaign } from "../components/LaunchCampaign";
import { LaunchWorkflow } from "../components/LaunchWorkflow";
import { PlanCards } from "../components/PlanCards";
import { stripeConfigured } from "../server/stripe";
import { cloudConfigured } from "../server/supabase";
import {
  LandingMotion,
  ProductStory,
  LandingGallery,
} from "../components/LandingMotion";
import styles from "./home.module.css";

const questions = [
  [
    "What can I make with DemoPop?",
    "A short reveal or a 15-, 30-, or 60-second product story. Start with your website, screenshots, or MP4 clips, build up to six scenes, and add your captions and branding. Choose the included soundtrack or export without music.",
  ],
  [
    "What’s in a launch package?",
    "Nine MP4 videos: three opening hooks, each in landscape (16:9), vertical (9:16), and square (1:1). Your ZIP also includes a thumbnail. You can edit each hook before exporting or export a single video instead.",
  ],
  [
    "Do I need an account to try it?",
    "You can edit and preview your own media in the studio without an account. Sign in to capture a website, save projects, and use two free single-video exports each calendar month. No card is required, and exports have no watermark. Choose a paid launch package or Studio for nine-video campaigns and more revisions. Browser drafts and local recipes stay on your device.",
  ],
  [
    "Can I update a video without rebuilding it?",
    "Yes. Replace a screenshot or clip while keeping its caption, framing, and timing. Save a launch recipe to reuse your story and brand for the next update. You can undo applying a recipe.",
  ],
  [
    "How do client reviews work?",
    "Create a branded link for a completed export. Your client can leave timestamped comments and approve that exact version without signing up. You control downloads and can revoke the link. Links expire after 14 days.",
  ],
  [
    "Are the videos on this page real exports?",
    "Yes. The opening film uses captures of DemoPop itself. The Orbit campaign is a fictional sample product rendered as a real nine-video package. These web previews are compressed; exported videos retain full 1080p dimensions at 30 fps.",
  ],
];

export default function Home() {
  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#product">
        Skip to the product
      </a>
      <header className={styles.header}>
        <Brand />
        <nav aria-label="Main navigation">
          <a href="#campaign" className={styles.navSection}>
            Launch package
          </a>
          <a href="#product" className={styles.navSection}>
            How it works
          </a>
          <a href="#studio" className={styles.navSection}>
            For client work
          </a>
          <Link href="/pricing">Pricing</Link>
          <Link href="/projects" className={styles.projectLink}>
            Your projects
          </Link>
          <Link href="/editor/new" className={styles.navCta}>
            Try the studio <ArrowUpRight size={15} />
          </Link>
        </nav>
      </header>
      <main>
        <LaunchScroll />
        <LandingMotion>
          <div
            className={styles.marquee}
            aria-label="Made for product launches, website reveals, portfolio drops, and new features"
          >
            <div className={styles.marqueeTrack} aria-hidden="true">
              {[0, 1].map((copy) => (
                <div key={copy}>
                  PRODUCT LAUNCHES <i /> WEBSITE REVEALS <i /> PORTFOLIO DROPS{" "}
                  <i /> NEW FEATURES <i />
                </div>
              ))}
            </div>
          </div>

          <section
            id="campaign"
            className={styles.campaignSection}
            aria-labelledby="campaign-heading"
          >
            <div className={styles.sectionTopline} data-reveal>
              <p className={styles.eyebrow}>
                <span /> BUILT FOR THE WHOLE LAUNCH
              </p>
              <span className={styles.indexLabel}>01 / THE LAUNCH PACKAGE</span>
            </div>
            <div className={styles.campaignHeading} data-reveal>
              <h2 id="campaign-heading">
                Make it once.
                <br />
                <em>Launch it nine ways.</em>
              </h2>
              <p>
                Three opening hooks. Three formats. One download.
                <br />
                Give every channel a considered first impression.
              </p>
            </div>
            <div data-reveal="media">
              <LaunchCampaign />
            </div>
          </section>

          <section
            id="product"
            className={styles.productSection}
            aria-labelledby="product-heading"
          >
            <div className={styles.sectionTopline} data-reveal>
              <p className={styles.eyebrow}>
                <span /> YOUR PRODUCT IS THE STARTING POINT
              </p>
              <span className={styles.indexLabel}>02 / HOW IT WORKS</span>
            </div>
            <div className={styles.productLead} data-reveal>
              <h2 id="product-heading">
                A story with substance.
                <br />
                <span>Made from your product.</span>
              </h2>
              <div>
                <ArrowDownRight size={44} strokeWidth={1} />
                <div className={styles.productCopy}>
                  <p>
                    Start with a website link, or bring your screenshots and
                    clips. Shape your product story at 15, 30, or 60 seconds.
                  </p>
                  <Link href="/create" className={styles.productImport}>
                    Create from a link <ArrowUpRight size={15} />
                  </Link>
                </div>
              </div>
            </div>
            <ProductStory />
            <div className={styles.proofLine} data-reveal>
              <span>
                <Check size={14} /> Your actual product
              </span>
              <span>
                <Check size={14} /> 3–6 editable scenes
              </span>
              <span>
                <Check size={14} /> Live motion preview
              </span>
            </div>
          </section>

          <section
            id="styles"
            className={styles.gallerySection}
            aria-labelledby="styles-heading"
          >
            <div className={styles.sectionTopline} data-reveal>
              <p className={styles.eyebrow}>
                <span /> GOOD TASTE. BUILT IN.
              </p>
              <span className={styles.indexLabel}>03 / FIND YOUR MOTION</span>
            </div>
            <div className={styles.galleryHeading} data-reveal>
              <h2 id="styles-heading">
                One product.
                <br />
                <em>A different kind of entrance.</em>
              </h2>
              <p>
                Bold launch. Clean reveal. Quiet confidence.
                <br />
                Preview each style. Find your direction.
              </p>
            </div>
            <LandingGallery />
          </section>

          <section
            id="studio"
            className={styles.studioSection}
            aria-labelledby="studio-heading"
          >
            <div className={styles.sectionTopline} data-reveal>
              <p className={styles.eyebrow}>
                <span /> YOUR NEXT CLIENT STARTS FURTHER AHEAD
              </p>
              <span className={styles.indexLabel}>04 / KEEP YOUR MOMENTUM</span>
            </div>
            <div className={styles.studioHeading} data-reveal>
              <h2 id="studio-heading">
                The next launch
                <br />
                <span>starts a little further ahead.</span>
              </h2>
              <p>
                Reuse your branding and story for the next client.
                <br />
                Close the loop with your client.
              </p>
            </div>
            <div data-reveal="media">
              <LaunchWorkflow />
            </div>
          </section>

          <section
            id="pricing"
            className={styles.pricingSection}
            aria-labelledby="pricing-heading"
          >
            <div className={styles.sectionTopline}>
              <p className={styles.eyebrow}>
                <span /> START FREE. UPGRADE WHEN YOU NEED MORE.
              </p>
              <span className={styles.indexLabel}>05 / PRICING</span>
            </div>
            <div className={styles.campaignHeading}>
              <h2 id="pricing-heading">
                Start with Free.
                <br />
                <em>Upgrade for more.</em>
              </h2>
              <p>
                Two free single-video exports every month.
                <br />
                Upgrade for campaign packages and more revisions.
              </p>
            </div>
            <div className={styles.pricingInner}>
              <PlanCards available={cloudConfigured() && stripeConfigured()} />
            </div>
          </section>

          <section
            className={styles.faqSection}
            aria-labelledby="questions-heading"
          >
            <div data-reveal>
              <p className={styles.eyebrow}>
                <span /> A FEW GOOD QUESTIONS
              </p>
              <h2 id="questions-heading">
                The details,
                <br />
                <span>without the fine print.</span>
              </h2>
              <Link href="/auth" className={styles.quietLink}>
                Sign in to your studio <ArrowUpRight size={16} />
              </Link>
            </div>
            <div className={styles.questions} data-reveal>
              {questions.map(([question, answer]) => (
                <details key={question}>
                  <summary>
                    {question}
                    <Plus size={18} />
                  </summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </section>

          <section
            className={styles.finalSection}
            aria-labelledby="final-heading"
            data-animate
          >
            <div className={styles.finalOrb} aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <div className={styles.finalContent} data-reveal>
              <p className={styles.eyebrow}>YOUR NEXT LAUNCH STARTS HERE</p>
              <h2 id="final-heading">
                Make a little
                <br />
                <em>noise.</em>
                <span>↗</span>
              </h2>
              <div className={styles.finalActions}>
                <Link href="/editor/new" className={styles.primaryCta}>
                  Create your first launch <ArrowUpRight size={19} />
                </Link>
                <p>
                  Your screenshots. Your clips. Your brand.
                  <br />
                  No account needed to preview.
                </p>
              </div>
            </div>
            <div className={styles.finalMeta}>
              <span>YOUR PRODUCT. YOUR STORY.</span>
              <span>ONE PRODUCT. A WHOLE LAUNCH.</span>
            </div>
          </section>
        </LandingMotion>
      </main>
      <footer className={styles.footer}>
        <div className={styles.footerTop}>
          <Brand />
          <p>For the work worth showing.</p>
          <div>
            <Link href="/projects">Your projects</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/billing">Billing</Link>
            <Link href="/auth">
              Sign in <ArrowUpRight size={13} />
            </Link>
            <a href="#campaign">See the launch package ↑</a>
          </div>
        </div>
        <div className={styles.footerWord} aria-hidden="true">
          DemoPop
          <BrandMark />
        </div>
        <div className={styles.footerBottom}>
          <span>INDEPENDENT PRODUCT. CONSIDERED MOTION.</span>
          <span>MADE WITH DEMOPOP.</span>
        </div>
      </footer>
    </div>
  );
}
