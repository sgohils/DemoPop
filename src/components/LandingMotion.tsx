"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  FileImage,
  Film,
  MousePointer2,
  ArrowUpRight,
} from "lucide-react";
import styles from "../app/home.module.css";

const SampleGallery = dynamic(
  () => import("./HomeShowcase").then((module) => module.HomeShowcase),
  {
    ssr: false,
    loading: () => (
      <div className={styles.galleryPlaceholder} role="status">
        <span className={styles.loadingMark} />
        <p>Setting the stage…</p>
      </div>
    ),
  },
);

export function LandingMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let observer: IntersectionObserver | undefined;
    const setup = () => {
      observer?.disconnect();
      element.dataset.motionReady = String(!reduced.matches);
      const nodes = element.querySelectorAll<HTMLElement>(
        "[data-reveal], [data-animate]",
      );
      if (reduced.matches || !("IntersectionObserver" in window)) {
        nodes.forEach((node) => {
          node.dataset.seen = "true";
          node.dataset.active = "false";
        });
        return;
      }
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const node = entry.target as HTMLElement;
            if (entry.isIntersecting) node.dataset.seen = "true";
            node.dataset.active = String(entry.isIntersecting);
          }
        },
        { threshold: 0.12, rootMargin: "0px 0px -24px 0px" },
      );
      nodes.forEach((node) => observer?.observe(node));
    };
    setup();
    reduced.addEventListener("change", setup);
    return () => {
      observer?.disconnect();
      reduced.removeEventListener("change", setup);
    };
  }, []);
  return (
    <div ref={root} className={styles.motionContent}>
      {children}
    </div>
  );
}

const storySteps = [
  {
    name: "Drop it in.",
    detail:
      "Your before. Your after. The raw material for a very good entrance.",
    number: "01",
    label: "THE STARTING POINT",
  },
  {
    name: "Make it yours.",
    detail: "Choose your motion, write the hook, and bring your own signature.",
    number: "02",
    label: "THE CREATIVE DIRECTION",
  },
  {
    name: "Send it out.",
    detail: "A polished 15-second MP4, ready for the feed or the big screen.",
    number: "03",
    label: "THE FINISHED FILM",
  },
];

export function ProductStory() {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div className={styles.story} data-reveal data-animate>
      <div className={styles.storyControls}>
        <div
          className={styles.storyTabs}
          role="tablist"
          aria-label="From screenshots to launch film"
        >
          {storySteps.map((step, index) => (
            <button
              key={step.name}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              id={`story-tab-${index}`}
              type="button"
              role="tab"
              aria-selected={active === index}
              aria-controls={`story-panel-${index}`}
              tabIndex={active === index ? 0 : -1}
              onClick={() => setActive(index)}
              onKeyDown={(event) => {
                const next =
                  event.key === "ArrowRight"
                    ? (index + 1) % 3
                    : event.key === "ArrowLeft"
                      ? (index + 2) % 3
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? 2
                          : null;
                if (next === null) return;
                event.preventDefault();
                setActive(next);
                tabRefs.current[next]?.focus();
              }}
            >
              <span>{step.number}</span>
              <span>{step.name}</span>
              <ArrowUpRight size={17} />
            </button>
          ))}
        </div>
        <p className={styles.storyDescription} key={active}>
          {storySteps[active].detail}
        </p>
        <div className={styles.storyFootnote}>
          <span /> A FEW GOOD INPUTS. A LOT OF MOMENTUM.
        </div>
      </div>
      <div className={styles.storyStage}>
        <div className={styles.stageGrid} aria-hidden="true" />
        {storySteps.map((step, index) => (
          <div
            id={`story-panel-${index}`}
            key={step.name}
            role="tabpanel"
            aria-labelledby={`story-tab-${index}`}
            hidden={active !== index}
            className={styles.storyPanel}
          >
            <div className={styles.stageTopline}>
              <span>{step.label}</span>
              <span>{step.number} / 03</span>
            </div>
            {index === 0 && (
              <div className={styles.inputDeck}>
                <div className={styles.inputCard}>
                  <span>
                    <FileImage size={12} /> BEFORE.PNG
                  </span>
                  <Image
                    src="/sample/before.png"
                    width={1440}
                    height={2000}
                    alt="An original website screenshot"
                    sizes="(max-width: 700px) 35vw, 220px"
                  />
                  <span className={styles.assetTag}>Your starting point</span>
                </div>
                <ArrowRight className={styles.deckArrow} size={24} />
                <div className={styles.inputCard}>
                  <span>
                    <FileImage size={12} /> AFTER.PNG
                  </span>
                  <Image
                    src="/sample/after.png"
                    width={1440}
                    height={2000}
                    alt="The redesigned version of the same website"
                    sizes="(max-width: 700px) 35vw, 220px"
                  />
                  <span className={styles.assetTag}>Your next chapter</span>
                </div>
                <span className={styles.dropLabel}>
                  <Check size={13} /> The transformation starts here.
                </span>
              </div>
            )}
            {index === 1 && (
              <div className={styles.creativeStage}>
                <div className={styles.creativeFrame}>
                  <span className={styles.creativeLabel}>
                    LAUNCH FILM / YOUR BRAND
                  </span>
                  <div>
                    Your next
                    <br />
                    big <em>thing.</em>
                  </div>
                  <span className={styles.creativeLine} />
                </div>
                <div className={styles.colorTool}>
                  <span>YOUR SIGNATURE</span>
                  <div>
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                  <b>#536BFF</b>
                </div>
                <span className={styles.floatingCursor}>
                  <MousePointer2 size={15} fill="currentColor" /> Make it yours
                </span>
              </div>
            )}
            {index === 2 && (
              <div className={styles.exportStage}>
                <div className={styles.exportWindow}>
                  <div>
                    <Film size={13} />
                    <span>your-next-launch.mp4</span>
                    <span className={styles.readyTag}>
                      <Check size={11} /> READY
                    </span>
                  </div>
                  <Image
                    src="/films/demopop-launch-poster.webp"
                    unoptimized
                    width={1920}
                    height={1080}
                    alt="A frame from the real DemoPop launch film"
                    sizes="(max-width: 700px) 85vw, 600px"
                  />
                  <div>
                    <span>1080P / H.264</span>
                    <span>
                      00:15 <ArrowUpRight size={12} />
                    </span>
                  </div>
                </div>
                <span className={styles.exportBadge}>
                  <Check size={14} /> YOUR NEXT LAUNCH, READY.
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function LandingGallery() {
  const root = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "500px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={root} className={styles.galleryMount} data-reveal>
      {near ? (
        <SampleGallery />
      ) : (
        <div className={styles.galleryPlaceholder}>
          <span className={styles.loadingMark} />
          <p>Four ways to make an entrance.</p>
          <span>LIVE MOTION PREVIEW</span>
        </div>
      )}
    </div>
  );
}
