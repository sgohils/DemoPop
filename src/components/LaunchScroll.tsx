"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import styles from "./launch-scroll.module.css";

const FILM = "/films/demopop-launch.mp4";
const POSTER = "/films/demopop-launch-poster.webp";
const CHAPTERS = [
  {
    at: 0,
    number: "01",
    name: "The hook",
    detail: "Make the first second count.",
    headline: "Build the\nintrigue.",
  },
  {
    at: 0.22,
    number: "02",
    name: "The reveal",
    detail: "Give your product its moment.",
    headline: "Make the\nreveal.",
  },
  {
    at: 0.39,
    number: "03",
    name: "The proof",
    detail: "Show what makes it different.",
    headline: "Show the\ndifference.",
  },
  {
    at: 0.79,
    number: "04",
    name: "Your next launch",
    detail: "Leave them wanting to try it.",
    headline: "Leave a\nmark.",
  },
];

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
  const progress = useRef<HTMLProgressElement>(null);
  const chapterNumber = useRef<HTMLSpanElement>(null);
  const chapterName = useRef<HTMLSpanElement>(null);
  const chapterDetail = useRef<HTMLSpanElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const fullFilm = useRef<HTMLVideoElement>(null);
  const watchButton = useRef<HTMLButtonElement>(null);
  const createButton = useRef<HTMLAnchorElement>(null);
  const mobileChapterKicker = useRef<HTMLSpanElement>(null);
  const mobileChapterHeadline = useRef<HTMLParagraphElement>(null);
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

    const update = () => {
      raf = 0;
      if (disposed || dialog.current?.open) return;
      const bounds = element.getBoundingClientRect();
      if (visible && !motion.matches && !film.getAttribute("src")) {
        film.preload = "auto";
        film.src = FILM;
        film.load();
      }
      if (!visible && (bounds.bottom < 0 || bounds.top > window.innerHeight)) {
        return;
      }
      const distance = Math.max(1, bounds.height - window.innerHeight);
      const amount = motion.matches
        ? 0
        : Math.max(0, Math.min(1, -bounds.top / distance));
      const expansion = Math.min(1, amount / 0.42);
      const eased = expansion * expansion * (3 - 2 * expansion);
      const copyExit = Math.max(
        0,
        Math.min(1, (amount - 0.025) / (mobile.matches ? 0.18 : 0.22)),
      );
      const chapterEntrance = Math.max(0, Math.min(1, (amount - 0.205) / 0.11));
      const initialScale = mobile.matches ? 0.96 : 0.59;

      surface.style.setProperty(
        "--film-scale",
        `${initialScale + (1 - initialScale) * eased}`,
      );
      surface.style.setProperty(
        "--film-x",
        `${mobile.matches ? 0 : 22 * (1 - eased)}vw`,
      );
      surface.style.setProperty(
        "--film-y",
        `${(mobile.matches ? 95 : 12) * (1 - eased)}px`,
      );
      surface.style.setProperty(
        "--film-rotate",
        `${mobile.matches ? 0 : -5 * (1 - eased)}deg`,
      );
      surface.style.setProperty("--copy-opacity", `${1 - copyExit}`);
      surface.style.setProperty("--copy-y", `${-70 * copyExit}px`);
      surface.style.setProperty("--chapter-opacity", `${chapterEntrance}`);
      surface.style.setProperty(
        "--chapter-y",
        `${20 * (1 - chapterEntrance)}px`,
      );
      surface.style.setProperty(
        "--copy-events",
        copyExit >= 0.98 ? "none" : "auto",
      );
      if (createButton.current)
        createButton.current.tabIndex = copyExit >= 0.98 ? -1 : 0;
      surface.style.setProperty("--ambient", `${0.2 + 0.8 * eased}`);
      surface.dataset.scrollProgress = amount.toFixed(3);
      element.dataset.scrollProgress = amount.toFixed(3);
      element.dataset.reducedMotion = String(motion.matches);
      if (progress.current) progress.current.value = amount;

      const nextChapter = CHAPTERS.findLastIndex((item) => amount >= item.at);
      if (nextChapter !== currentChapter) {
        currentChapter = nextChapter;
        const next = CHAPTERS[Math.max(0, nextChapter)];
        if (chapterNumber.current)
          chapterNumber.current.textContent = next.number;
        if (chapterName.current) chapterName.current.textContent = next.name;
        if (chapterDetail.current)
          chapterDetail.current.textContent = next.detail;
        if (mobileChapterKicker.current)
          mobileChapterKicker.current.textContent = `${next.number} / ${next.name}`;
        if (mobileChapterHeadline.current)
          mobileChapterHeadline.current.textContent = next.headline;
      }
      if (loaded && Number.isFinite(film.duration)) {
        targetTime = Math.max(
          0,
          Math.min(film.duration - 0.06, amount * film.duration),
        );
        seek();
      }
    };
    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(update);
    };
    const metadata = () => {
      loaded = true;
      schedule();
    };
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
    window.addEventListener("resize", schedule, { passive: true });
    motion.addEventListener("change", schedule);
    mobile.addEventListener("change", schedule);
    schedule();

    return () => {
      disposed = true;
      unlockPage.current?.();
      unlockPage.current = null;
      if (raf) window.cancelAnimationFrame(raf);
      observer.disconnect();
      film.pause();
      film.removeEventListener("loadedmetadata", metadata);
      film.removeEventListener("seeked", seek);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      motion.removeEventListener("change", schedule);
      mobile.removeEventListener("change", schedule);
    };
  }, []);

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
      data-scroll-progress="0"
      data-reduced-motion="false"
      aria-label="Meet DemoPop"
    >
      <a className={styles.skipFilm} href="#product">
        Skip the film
      </a>
      <div ref={stage} className={styles.stage} data-scroll-progress="0">
        <div className={styles.ambient} aria-hidden="true" />
        <div className={styles.coordinates} aria-hidden="true">
          <span>DEMOPOP / MOTION SYSTEM 01</span>
          <span>BUILT TO BE SEEN.</span>
        </div>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>
            <span /> THE LAUNCH IS PART OF THE PRODUCT
          </p>
          <h1>
            You built it.
            <br />
            <span>
              Now make
              <br className={styles.desktopBreak} /> it move.
            </span>
          </h1>
          <p className={styles.description}>
            Two screenshots. Fifteen seconds.
            <br />A launch worth watching.
          </p>
          <div className={styles.actions}>
            <Link
              ref={createButton}
              href="/editor/new"
              className={styles.create}
            >
              Create a video <Arrow />
            </Link>
            <span className={styles.noSetup}>
              Your screenshots.
              <br />
              Your main character moment.
            </span>
          </div>
        </div>

        <div className={styles.wordmark} aria-hidden="true">
          demopop<span>✳</span>
        </div>

        <div className={styles.mobileChapter} aria-hidden="true">
          <span
            ref={mobileChapterKicker}
            className={styles.mobileChapterKicker}
          >
            01 / The hook
          </span>
          <p ref={mobileChapterHeadline}>Build the{"\n"}intrigue.</p>
        </div>

        <div className={styles.filmPosition}>
          <div className={styles.film}>
            <div className={styles.frameTop} aria-hidden="true">
              <span>
                <i /> DEMOPOP — THE LAUNCH FILM
              </span>
              <span>00:15 / 16:9</span>
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

        <div className={styles.bottomBar}>
          <div className={styles.chapter}>
            <span ref={chapterNumber} className={styles.chapterNumber}>
              01
            </span>
            <div>
              <span ref={chapterName} className={styles.chapterName}>
                The hook
              </span>
              <span ref={chapterDetail} className={styles.chapterDetail}>
                Make the first second count.
              </span>
            </div>
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
