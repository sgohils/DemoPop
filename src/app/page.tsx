import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowDownRight, ArrowUpRight, Check, Plus } from "lucide-react";
import { Brand } from "../components/Brand";
import { LaunchScroll } from "../components/LaunchScroll";
import {
  LandingMotion,
  ProductStory,
  LandingGallery,
} from "../components/LandingMotion";
import styles from "./home.module.css";

const questions = [
  [
    "What can I make with DemoPop?",
    "A 15-second announcement film for a product launch, website redesign, portfolio update, or new feature. Bring two screenshots, write your hook and highlights, and choose the motion that fits your story.",
  ],
  [
    "Is the film at the top actually made with DemoPop?",
    "Yes. It uses the same Launch Film renderer, captions, product framing, and original soundtrack available in the editor. The product shots are captures of DemoPop itself.",
  ],
  [
    "Do I need an account to try it?",
    "You can open the editor, use your own screenshots, change the copy and styling, and preview your film without an account. Sign in to save projects, use saved brand kits, and export.",
  ],
  [
    "What do I get when I export?",
    "A 1080p H.264 MP4 at 30 frames per second. Choose portrait (9:16) or landscape (16:9). Launch Film includes an optional original soundtrack; you can also export it silently.",
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
          <a href="#product" className={styles.navSection}>
            The product
          </a>
          <a href="#styles" className={styles.navSection}>
            The possibilities
          </a>
          <Link href="/projects" className={styles.projectLink}>
            Your projects
          </Link>
          <Link href="/editor/new" className={styles.navCta}>
            Open studio <ArrowUpRight size={15} />
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
            id="product"
            className={styles.productSection}
            aria-labelledby="product-heading"
          >
            <div className={styles.sectionTopline} data-reveal>
              <p className={styles.eyebrow}>
                <span /> FROM BUILT TO SEEN
              </p>
              <span className={styles.indexLabel}>01 / THE PRODUCT</span>
            </div>
            <div className={styles.productLead} data-reveal>
              <h2 id="product-heading">
                The work is done.
                <br />
                <span>The entrance is everything.</span>
              </h2>
              <div>
                <ArrowDownRight size={44} strokeWidth={1} />
                <p>
                  That product you obsessed over deserves more than a screenshot
                  in a post. Give it a hook. A reveal. A reason to stop
                  scrolling.
                </p>
              </div>
            </div>
            <ProductStory />
            <div className={styles.proofLine} data-reveal>
              <span>
                <Check size={14} /> Real product screenshots
              </span>
              <span>
                <Check size={14} /> Motion you can preview
              </span>
              <span>
                <Check size={14} /> A film you can export
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
              <span className={styles.indexLabel}>02 / FIND YOUR MOTION</span>
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
                Try the actual renderer. Find your direction.
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
                <span /> SMALL DETAILS. BIG DIFFERENCE.
              </p>
              <span className={styles.indexLabel}>03 / INSIDE THE STUDIO</span>
            </div>
            <div className={styles.studioHeading} data-reveal>
              <h2 id="studio-heading">
                Looks like a launch team.
                <br />
                <span>Works like a small tool.</span>
              </h2>
              <p>
                The creative decisions are considered.
                <br />
                The controls stay in your hands.
              </p>
            </div>
            <div className={styles.capabilityGrid}>
              <article className={styles.capability} data-reveal data-animate>
                <div className={styles.typeVisual} aria-hidden="true">
                  <span className={styles.visualMicro}>
                    YOUR BRAND, IN MOTION
                  </span>
                  <div className={styles.typeWord}>
                    Aa<span>.</span>
                  </div>
                  <div className={styles.swatches}>
                    <i />
                    <i />
                    <i />
                    <span>DM Sans / Manrope</span>
                  </div>
                  <div className={styles.brandCursor}>
                    Your signature <ArrowUpRight size={13} />
                  </div>
                </div>
                <div className={styles.capabilityCopy}>
                  <span>01</span>
                  <h3>Recognizably yours.</h3>
                  <p>
                    Your color, font, logo, and closing action. Save a brand kit
                    and bring the same signature to your next launch.
                  </p>
                </div>
              </article>
              <article className={styles.capability} data-reveal data-animate>
                <div className={styles.timelineVisual} aria-hidden="true">
                  <span className={styles.visualMicro}>
                    EVERY BEAT HAS A PURPOSE
                  </span>
                  <div className={styles.soundBars}>
                    {Array.from({ length: 29 }, (_, index) => (
                      <i
                        key={index}
                        style={
                          {
                            "--bar": `${16 + ((index * 17) % 55)}px`,
                            "--delay": `${index * -0.08}s`,
                          } as CSSProperties
                        }
                      />
                    ))}
                  </div>
                  <div className={styles.miniTimeline}>
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <b />
                  </div>
                  <div className={styles.timelineLabels}>
                    <span>THE HOOK</span>
                    <span>THE REVEAL</span>
                    <span>THE CLOSE</span>
                  </div>
                </div>
                <div className={styles.capabilityCopy}>
                  <span>02</span>
                  <h3>Directed, down to the beat.</h3>
                  <p>
                    Purposeful camera moves, readable type, and an original
                    score. Preview the whole film or jump straight to any scene.
                  </p>
                </div>
              </article>
              <article className={styles.capability} data-reveal data-animate>
                <div className={styles.projectVisual} aria-hidden="true">
                  <span className={styles.visualMicro}>
                    READY FOR THE NEXT ONE
                  </span>
                  <div className={styles.miniProject}>
                    <span className={styles.miniProjectArt}>
                      d<span>.</span>
                    </span>
                    <div>
                      <b>The next big thing</b>
                      <span>Launch Film · 15 sec</span>
                    </div>
                    <Check size={15} />
                  </div>
                  <div className={styles.miniProject}>
                    <span className={styles.miniProjectArt}>
                      d<span>.</span>
                    </span>
                    <div>
                      <b>A different direction</b>
                      <span>Project duplicate</span>
                    </div>
                    <ArrowUpRight size={15} />
                  </div>
                  <span className={styles.draftPill}>
                    <i /> Browser draft saved
                  </span>
                </div>
                <div className={styles.capabilityCopy}>
                  <span>03</span>
                  <h3>Keep your momentum.</h3>
                  <p>
                    Recover a draft, duplicate a direction, revisit an export.
                    The next video starts with the work you already did.
                  </p>
                </div>
              </article>
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
                  Make your first film <ArrowUpRight size={19} />
                </Link>
                <p>
                  Try it with your own screenshots.
                  <br />
                  No account needed to preview.
                </p>
              </div>
            </div>
            <div className={styles.finalMeta}>
              <span>YOUR PRODUCT. YOUR STORY.</span>
              <span>15 SECONDS TO MAKE IT MATTER.</span>
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
            <Link href="/auth">
              Sign in <ArrowUpRight size={13} />
            </Link>
            <a href="#product">Back to the product ↑</a>
          </div>
        </div>
        <div className={styles.footerWord} aria-hidden="true">
          DemoPop<span>✳</span>
        </div>
        <div className={styles.footerBottom}>
          <span>INDEPENDENT PRODUCT. CONSIDERED MOTION.</span>
          <span>MADE WITH DEMOPOP.</span>
        </div>
      </footer>
    </div>
  );
}
