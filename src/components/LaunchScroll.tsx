"use client";

import Link from "next/link";
import { useEffect, useRef, type CSSProperties } from "react";
import { BrandMark } from "./BrandMark";
import styles from "./launch-scroll.module.css";

const FILM = "/films/demopop-launch.mp4";
const POSTER = "/films/demopop-launch-poster.webp";
// Give the opening, product reveal, and closing identity room to be read.
// Scroll remains native; these cues only direct the film inside its sticky stage.
const FILM_CUES = [
  { at: 0, frame: 0 },
  { at: 0.1, frame: 0 },
  { at: 0.38, frame: 0.34 },
  { at: 0.46, frame: 0.34 },
  { at: 0.64, frame: 0.72 },
  { at: 0.72, frame: 0.72 },
  { at: 0.9, frame: 0.98 },
  { at: 1, frame: 0.98 },
];
function easeBetween(value: number, start: number, end: number) {
  const progress = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return progress * progress * progress * (progress * (progress * 6 - 15) + 10);
}
function filmProgress(value: number) {
  const index = FILM_CUES.findIndex((cue) => cue.at > value);
  if (index < 1) return FILM_CUES.at(-1)!.frame;
  const before = FILM_CUES[index - 1];
  const after = FILM_CUES[index];
  return (
    before.frame +
    (after.frame - before.frame) * easeBetween(value, before.at, after.at)
  );
}
const CHAPTERS = [
  {
    at: 0,
    number: "01",
    name: "The hook",
    detail: "Make the first second count.",
    headline: "Build the\nintrigue.",
    cue: 0,
  },
  {
    at: 0.1,
    number: "02",
    name: "The reveal",
    detail: "Give your product its moment.",
    headline: "Make the\nreveal.",
    cue: 0.4,
  },
  {
    at: 0.46,
    number: "03",
    name: "The proof",
    detail: "Show what makes it different.",
    headline: "Show the\ndifference.",
    cue: 0.65,
  },
  {
    at: 0.72,
    number: "04",
    name: "Your next launch",
    detail: "Leave them wanting to try it.",
    headline: "Leave a\nmark.",
    cue: 0.94,
  },
];

const chapterStyle = (index: number): CSSProperties =>
  ({
    "--chapter-weight": index === 0 ? 1 : 0,
    "--chapter-shift": index === 0 ? 0 : 1,
    visibility: index === 0 ? "visible" : "hidden",
  }) as CSSProperties;

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {diagonal ? (
        <path d="M6 18 18 6M6 6h12v12" />
      ) : (
        <path d="M4 12h15m-6-6 6 6-6 6" />
      )}
    </svg>
  );
}

/** The film is a real export. Scroll moves its playhead; playback never starts audio. */
export function LaunchScroll() {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const filmFrame = useRef<HTMLDivElement>(null);
  const progress = useRef<HTMLProgressElement>(null);
  const chapterDescription = useRef<HTMLSpanElement>(null);
  const chapterRail = useRef<HTMLElement>(null);
  const filmTime = useRef<HTMLSpanElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const fullFilm = useRef<HTMLVideoElement>(null);
  const watchButton = useRef<HTMLButtonElement>(null);
  const createButton = useRef<HTMLAnchorElement>(null);
  const intro = useRef<HTMLDivElement>(null);
  const mobileChapter = useRef<HTMLDivElement>(null);
  const bottomBar = useRef<HTMLDivElement>(null);
  const unlockPage = useRef<(() => void) | null>(null);

  useEffect(() => {
    const element = section.current;
    const surface = stage.current;
    const film = video.current;
    if (!element || !surface || !film) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobile = window.matchMedia("(max-width: 720px)");
    let raf = 0;
    let targetTime = 0;
    let loaded = false;
    let visible = false;
    let currentChapter = -1;
    let disposed = false;
    let displayedAmount: number | null = null;
    let previousTime = 0;
    let layoutDirty = true;
    const introLinks = Array.from(intro.current?.querySelectorAll("a") ?? []);
    let copyInteractive: boolean | null = null;
    let displayedSecond = -1;
    const cueButtons = Array.from(
      chapterRail.current?.querySelectorAll("button") ?? [],
    );
    const chapterLayers = CHAPTERS.map((_, index) =>
      Array.from(
        surface.querySelectorAll<HTMLElement>(
          `[data-chapter-layer="${index}"]`,
        ),
      ),
    );
    const chapterWeights: number[] = CHAPTERS.map((_, index) =>
      index === 0 ? 1 : 0,
    );
    let previousChapterPosition = 0;
    let layout = {
      start: 0,
      distance: 1,
      height: 1,
      filmCenter: 1,
      filmHeight: 1,
      introBottom: 0,
      chapterBottom: 0,
      bottom: 1,
    };

    // Read geometry together, only when content or viewport dimensions change.
    // The animation itself writes transforms and opacity without forcing layout.
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      layout = {
        start: bounds.top + window.scrollY,
        distance: Math.max(1, bounds.height - window.innerHeight),
        height: bounds.height,
        filmCenter: filmFrame.current?.offsetTop ?? surface.clientHeight / 2,
        filmHeight:
          ((filmFrame.current?.offsetWidth ?? surface.clientWidth * 0.92) * 9) /
          16,
        introBottom: intro.current
          ? intro.current.offsetTop + intro.current.offsetHeight + 24
          : 0,
        chapterBottom: mobileChapter.current
          ? mobileChapter.current.offsetTop +
            mobileChapter.current.offsetHeight +
            24
          : 0,
        bottom: bottomBar.current
          ? bottomBar.current.offsetTop - 24
          : surface.clientHeight,
      };
      layoutDirty = false;
    };

    // A decoder finishes one seek before the next starts, even during a fast fling.
    // This avoids a queue of stale frame requests on mobile hardware.
    const seek = () => {
      if (
        disposed ||
        motion.matches ||
        !visible ||
        !loaded ||
        film.seeking ||
        film.readyState < 1 ||
        Math.abs(film.currentTime - targetTime) < 1 / 30
      ) {
        return;
      }
      film.currentTime = targetTime;
    };

    const update = (now: number) => {
      raf = 0;
      if (disposed || dialog.current?.open || document.hidden) {
        previousTime = 0;
        return;
      }
      if (layoutDirty) measure();
      if (visible && !motion.matches && !film.getAttribute("src")) {
        film.preload = "auto";
        film.src = FILM;
        film.load();
      }
      const scroll = window.scrollY;
      if (
        !visible &&
        (scroll > layout.start + layout.height ||
          scroll + window.innerHeight < layout.start)
      ) {
        displayedAmount = null;
        previousTime = 0;
        return;
      }
      const targetAmount = motion.matches
        ? 0
        : Math.max(0, Math.min(1, (scroll - layout.start) / layout.distance));
      const elapsed = previousTime
        ? Math.min(64, now - previousTime)
        : 1000 / 60;
      // Time-based damping feels the same on 60/120 Hz displays and settles
      // quickly after a wheel tick, touch fling, or a reversal.
      let amount =
        displayedAmount === null || motion.matches || !visible
          ? targetAmount
          : displayedAmount +
            (targetAmount - displayedAmount) * (1 - Math.exp(-elapsed / 140));
      if (Math.abs(targetAmount - amount) < 0.0001) amount = targetAmount;
      displayedAmount = amount;
      previousTime = now;
      const eased = easeBetween(amount, 0.06, 0.42);
      const copyExit = easeBetween(amount, 0.1, mobile.matches ? 0.3 : 0.33);
      const copyOpacity = 1 - easeBetween(copyExit, 0, 0.85);
      const chapterEntrance = easeBetween(amount, 0.32, 0.4);
      const initialScale = mobile.matches ? 0.94 : 0.84;
      const nextChapter = CHAPTERS.findLastIndex((item) => amount >= item.at);
      const firstChapter = currentChapter < 0;
      if (nextChapter !== currentChapter) {
        currentChapter = nextChapter;
        const next = CHAPTERS[Math.max(0, nextChapter)];
        if (chapterDescription.current)
          chapterDescription.current.textContent = `${next.number}. ${next.name}. ${next.detail}`;
        cueButtons.forEach((button, index) => {
          if (index === nextChapter)
            button.setAttribute("aria-current", "step");
          else button.removeAttribute("aria-current");
        });
      }
      // Keep every caption in a shared grid cell: changes never resize the
      // film's available space. Blend to the new chapter in time, so stopping
      // at a scroll boundary cannot leave two half-visible headlines behind.
      let chapterAnimating = false;
      const previousWeights = [...chapterWeights];
      const blend =
        motion.matches || firstChapter ? 1 : 1 - Math.exp(-elapsed / 80);
      for (let index = 0; index < chapterWeights.length; index++) {
        const target = index === nextChapter ? 1 : 0;
        const weight =
          chapterWeights[index] + (target - chapterWeights[index]) * blend;
        chapterWeights[index] =
          Math.abs(target - weight) < 0.001 ? target : weight;
        if (chapterWeights[index] !== target) chapterAnimating = true;
      }
      const chapterPosition = chapterWeights.reduce(
        (sum, weight, index) => sum + weight * index,
        0,
      );
      for (let index = 0; index < chapterWeights.length; index++) {
        const weight = chapterWeights[index];
        if (
          weight === previousWeights[index] &&
          (weight === 0 || chapterPosition === previousChapterPosition)
        )
          continue;
        for (const layer of chapterLayers[index]) {
          layer.style.visibility = weight === 0 ? "hidden" : "visible";
          layer.style.setProperty("--chapter-weight", weight.toFixed(4));
          if (weight > 0)
            layer.style.setProperty(
              "--chapter-shift",
              `${Math.max(-1, Math.min(1, index - chapterPosition))}`,
            );
        }
      }
      previousChapterPosition = chapterPosition;
      let filmFit = 1;
      let filmY = 0;
      if (!motion.matches) {
        // Reserve the outgoing copy's actual space until its fade is nearly
        // complete. Expanding toward the next chapter too early puts the
        // description and CTA over the moving film.
        const outgoingTop = Math.max(
          layout.chapterBottom,
          layout.introBottom - 70 * copyExit,
        );
        const spaceExit = easeBetween(copyExit, 0.6, 1);
        const top =
          outgoingTop + (layout.chapterBottom - outgoingTop) * spaceExit;
        const height = Math.max(
          1,
          Math.min(layout.filmHeight, layout.bottom - top),
        );
        filmFit = height / layout.filmHeight;
        filmY = top + (layout.bottom - top) / 2 - layout.filmCenter;
      }

      surface.style.setProperty(
        "--film-scale",
        `${(initialScale + (1 - initialScale) * eased) * filmFit}`,
      );
      surface.style.setProperty("--film-x", "0px");
      surface.style.setProperty("--film-y", `${filmY}px`);
      surface.style.setProperty("--film-rotate", "0deg");
      // All depth layers follow the same eased native scroll position. The
      // backdrop is a static poster, so immersion needs only one video decoder.
      const immersion = motion.matches ? 0 : eased;
      surface.style.setProperty("--immersion", `${immersion}`);
      surface.style.setProperty(
        "--film-tilt",
        `${(1 - immersion) * (mobile.matches ? 3 : 8)}deg`,
      );
      surface.style.setProperty("--film-roll", `${(1 - immersion) * -1.2}deg`);
      surface.style.setProperty("--film-radius", `${12 - 8 * immersion}px`);
      surface.style.setProperty("--frame-opacity", `${1 - immersion}`);
      surface.style.setProperty("--backdrop-y", `${30 - 85 * amount}px`);
      surface.style.setProperty("--orbit-turn", `${-18 + 24 * amount}deg`);
      surface.style.setProperty("--echo-y", `${70 - 140 * amount}px`);
      surface.style.setProperty("--ambient-x", `${-4 + 8 * amount}%`);
      surface.dataset.immersion = immersion.toFixed(3);
      surface.style.setProperty("--copy-opacity", `${copyOpacity}`);
      surface.style.setProperty(
        "--copy-visibility",
        copyOpacity < 0.001 ? "hidden" : "visible",
      );
      surface.style.setProperty("--copy-y", `${-70 * copyExit}px`);
      surface.style.setProperty("--chapter-opacity", `${chapterEntrance}`);
      surface.style.setProperty(
        "--chapter-y",
        `${20 * (1 - chapterEntrance)}px`,
      );
      const interactive = copyOpacity > 0.1;
      if (interactive !== copyInteractive) {
        copyInteractive = interactive;
        surface.style.setProperty(
          "--copy-events",
          interactive ? "auto" : "none",
        );
        introLinks.forEach((link) => {
          link.tabIndex = interactive ? 0 : -1;
        });
      }
      surface.style.setProperty("--ambient", `${0.2 + 0.8 * eased}`);
      surface.dataset.scrollProgress = amount.toFixed(3);
      element.dataset.scrollProgress = amount.toFixed(3);
      element.dataset.reducedMotion = String(motion.matches);
      if (progress.current) progress.current.value = amount;

      if (loaded && Number.isFinite(film.duration)) {
        targetTime = Math.max(
          0,
          Math.min(film.duration - 0.06, filmProgress(amount) * film.duration),
        );
        seek();
        const second = Math.floor(targetTime);
        if (second !== displayedSecond && filmTime.current) {
          displayedSecond = second;
          filmTime.current.textContent = `00:${String(second).padStart(2, "0")} / 00:15`;
        }
      }
      const settled = amount === targetAmount && !chapterAnimating;
      surface.dataset.scrollSettled = String(settled);
      if (!settled) schedule();
      else previousTime = 0;
    };
    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(update);
    };
    const metadata = () => {
      loaded = true;
      schedule();
    };
    const invalidateLayout = () => {
      layoutDirty = true;
      schedule();
    };
    const visibilityChanged = () => {
      displayedAmount = null;
      previousTime = 0;
      schedule();
    };
    const resizeObserver = new ResizeObserver(invalidateLayout);
    for (const node of [
      element,
      surface,
      intro.current,
      mobileChapter.current,
      bottomBar.current,
    ]) {
      if (node) resizeObserver.observe(node);
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (!visible) film.pause();
        schedule();
      },
      { rootMargin: "320px 0px" },
    );
    observer.observe(element);
    film.addEventListener("loadedmetadata", metadata);
    film.addEventListener("seeked", seek);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", invalidateLayout, { passive: true });
    motion.addEventListener("change", invalidateLayout);
    mobile.addEventListener("change", invalidateLayout);
    document.addEventListener("visibilitychange", visibilityChanged);
    const filmDialog = dialog.current;
    filmDialog?.addEventListener("close", invalidateLayout);
    void document.fonts.ready.then(() => {
      if (!disposed) invalidateLayout();
    });
    schedule();

    return () => {
      disposed = true;
      unlockPage.current?.();
      unlockPage.current = null;
      if (raf) window.cancelAnimationFrame(raf);
      observer.disconnect();
      resizeObserver.disconnect();
      film.pause();
      film.removeEventListener("loadedmetadata", metadata);
      film.removeEventListener("seeked", seek);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", invalidateLayout);
      motion.removeEventListener("change", invalidateLayout);
      mobile.removeEventListener("change", invalidateLayout);
      document.removeEventListener("visibilitychange", visibilityChanged);
      filmDialog?.removeEventListener("close", invalidateLayout);
    };
  }, []);

  const jumpToChapter = (cue: number) => {
    const hero = section.current;
    if (!hero) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    window.scrollTo({
      top:
        hero.getBoundingClientRect().top +
        window.scrollY +
        (hero.clientHeight - window.innerHeight) * cue,
      behavior: reduced ? "instant" : "smooth",
    });
  };

  const watch = () => {
    const player = fullFilm.current;
    if (!dialog.current || !player || dialog.current.open) return;
    const body = document.body;
    const scrollY = window.scrollY;
    const previous = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      paddingRight: body.style.paddingRight,
    };
    const gutter = window.innerWidth - document.documentElement.clientWidth;
    const padding =
      Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;
    dialog.current.showModal();
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `${-scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    if (gutter > 0) body.style.paddingRight = `${padding + gutter}px`;
    unlockPage.current = () => {
      Object.assign(body.style, previous);
      window.scrollTo({ top: scrollY, behavior: "instant" });
    };
    player.currentTime = 0;
    void player.play().catch(() => {
      // The native controls remain available if the browser requires another tap.
    });
  };
  const close = () => dialog.current?.close();
  const onClose = () => {
    fullFilm.current?.pause();
    const restore = unlockPage.current;
    unlockPage.current = null;
    restore?.();
    watchButton.current?.focus({ preventScroll: true });
  };

  return (
    <section
      ref={section}
      className={styles.hero}
      data-home-scroll
      id="launch-scroll"
      data-scroll-progress="0"
      data-reduced-motion="false"
      aria-label="Meet DemoPop"
    >
      <a className={styles.skipFilm} href="#product">
        Skip the film
      </a>
      <div ref={stage} className={styles.stage} data-scroll-progress="0">
        <div className={styles.sceneBackdrop} aria-hidden="true" />
        <div className={styles.ambient} aria-hidden="true" />
        <div className={styles.orbit} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        {CHAPTERS.map((chapter, index) => (
          <span
            key={chapter.number}
            className={styles.chapterEcho}
            aria-hidden="true"
            data-chapter-layer={index}
            style={chapterStyle(index)}
          >
            {chapter.number}
          </span>
        ))}
        <div className={styles.coordinates} aria-hidden="true">
          <span>DEMOPOP / MOTION SYSTEM 01</span>
          <span>BUILT TO BE SEEN.</span>
        </div>
        <div ref={intro} className={styles.intro} data-hero-intro>
          <p className={styles.eyebrow}>
            <span /> FOR WEB AGENCIES & DESIGNERS
          </p>
          <h1>
            Turn client websites
            <br />
            <span>into launch campaigns.</span>
          </h1>
          <div className={styles.introFooter}>
            <p className={styles.description}>
              Start with your website. Preview a branded launch video before
              paying, then collect client approval and deliver every format.
            </p>
            <div className={styles.actions}>
              <Link ref={createButton} href="/create" className={styles.create}>
                Create from a website <Arrow />
              </Link>
              <a href="#campaign" className={styles.noSetup}>
                See a sample package ↗
              </a>
            </div>
          </div>
        </div>

        <div className={styles.wordmark} aria-hidden="true">
          demopop
          <BrandMark />
        </div>

        <div
          ref={mobileChapter}
          className={styles.mobileChapter}
          data-hero-chapter
          aria-hidden="true"
        >
          {CHAPTERS.map((chapter, index) => (
            <div
              key={chapter.number}
              className={styles.chapterPanel}
              data-chapter-layer={index}
              style={chapterStyle(index)}
            >
              <span className={styles.mobileChapterKicker}>
                {chapter.number} / {chapter.name}
              </span>
              <p>{chapter.headline}</p>
            </div>
          ))}
        </div>

        <div ref={filmFrame} className={styles.filmPosition}>
          <div className={styles.film}>
            <div className={styles.frameTop} aria-hidden="true">
              <span>
                <i /> DEMOPOP — THE LAUNCH FILM
              </span>
              <span ref={filmTime}>00:00 / 00:15</span>
            </div>
            {/* A poster is also the useful, zero-JavaScript fallback. */}
            <video
              ref={video}
              className={styles.scrubVideo}
              poster={POSTER}
              preload="none"
              muted
              playsInline
              disablePictureInPicture
              aria-label="DemoPop launch film"
            />
            <div className={styles.frameCorner} aria-hidden="true">
              <Arrow diagonal />
            </div>
          </div>
        </div>

        <nav
          ref={chapterRail}
          className={styles.chapterRail}
          aria-label="Film chapters"
        >
          {CHAPTERS.map((chapter, index) => (
            <button
              key={chapter.number}
              type="button"
              aria-label={`Scroll to ${chapter.name}`}
              aria-controls="launch-scroll"
              aria-current={index === 0 ? "step" : undefined}
              onClick={() => jumpToChapter(chapter.cue)}
            >
              <span>{chapter.number}</span>
              <i aria-hidden="true" />
              <span className={styles.railName}>{chapter.name}</span>
            </button>
          ))}
        </nav>

        <div ref={bottomBar} className={styles.bottomBar} data-hero-transport>
          <div className={styles.chapter}>
            <span
              ref={chapterDescription}
              className={styles.chapterDescription}
            >
              01. The hook. Make the first second count.
            </span>
            {CHAPTERS.map((chapter, index) => (
              <div
                key={chapter.number}
                className={styles.chapterSummary}
                data-chapter-layer={index}
                style={chapterStyle(index)}
                aria-hidden="true"
              >
                <span className={styles.chapterNumber}>{chapter.number}</span>
                <div>
                  <span className={styles.chapterName}>{chapter.name}</span>
                  <span className={styles.chapterDetail}>{chapter.detail}</span>
                </div>
              </div>
            ))}
          </div>
          <div className={styles.transport}>
            <span className={styles.scrollLabel}>
              SCROLL TO SEE IT MOVE <span aria-hidden="true">↓</span>
            </span>
            <progress
              ref={progress}
              max={1}
              value={0}
              aria-label="Launch film scroll progress"
            />
          </div>
          <button
            ref={watchButton}
            type="button"
            className={styles.watch}
            aria-label="Watch the film"
            onClick={watch}
          >
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="m7 4 9 6-9 6V4Z" fill="currentColor" />
            </svg>
            Watch the film<span className={styles.soundLabel}>WITH SOUND</span>
          </button>
        </div>
      </div>

      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="film-dialog-title"
        onClose={onClose}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className={styles.dialogInner}>
          <div className={styles.dialogHeader}>
            <div>
              <span className={styles.dialogEyebrow}>
                THE PRODUCT, IN MOTION
              </span>
              <h2 id="film-dialog-title">Made with DemoPop.</h2>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close launch film"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <video
            ref={fullFilm}
            src={FILM}
            poster={POSTER}
            preload="none"
            playsInline
            controls
            aria-label="DemoPop launch film with sound"
          />
          <div className={styles.dialogFooter}>
            <span>Two screenshots. One launch film.</span>
            <Link href="/editor/new" onClick={close}>
              Make yours <Arrow diagonal />
            </Link>
          </div>
        </div>
      </dialog>
    </section>
  );
}
