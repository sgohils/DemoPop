"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, FileVideo, Package } from "lucide-react";
import { PACKAGE_FORMATS, PACKAGE_HOOKS } from "../shared/launch-kit";
import styles from "./launch-campaign.module.css";

const hooks = [
  { label: "The idea", copy: "Your idea. Already in motion." },
  { label: "The product", copy: "Meet Orbit." },
  { label: "The benefit", copy: "One prompt. A clear plan." },
];
const formats = {
  landscape: {
    label: "Landscape",
    ratio: "16:9",
    use: "Your website & launch post",
  },
  vertical: {
    label: "Vertical",
    ratio: "9:16",
    use: "Reels, Stories & Shorts",
  },
  square: { label: "Square", ratio: "1:1", use: "The social feed" },
};

export function LaunchCampaign() {
  const [hook, setHook] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const pause = () =>
      element.querySelectorAll("video").forEach((video) => video.pause());
    const visibility = () => {
      if (document.hidden) pause();
    };
    const observer =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(([entry]) => {
            if (!entry.isIntersecting) pause();
          })
        : undefined;
    observer?.observe(element);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      pause();
      observer?.disconnect();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  return (
    <div ref={root} className={styles.campaign}>
      <div className={styles.toolbar}>
        <span>
          <span className={styles.liveDot} /> ORBIT / SAMPLE CAMPAIGN
        </span>
        <span>REAL EXPORTS. PRESS PLAY.</span>
      </div>
      <div
        className={styles.hookPicker}
        role="tablist"
        aria-label="Sample opening hook"
      >
        {hooks.map((item, index) => (
          <button
            key={item.label}
            ref={(node) => {
              tabs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`campaign-hook-${index}`}
            aria-controls="campaign-previews"
            aria-selected={hook === index}
            tabIndex={hook === index ? 0 : -1}
            onClick={() => setHook(index)}
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
              setHook(next);
              tabs.current[next]?.focus();
            }}
          >
            <span>
              0{index + 1} / {item.label}
            </span>
            <strong>{item.copy}</strong>
            <Check size={14} aria-hidden="true" />
          </button>
        ))}
      </div>
      <div
        id="campaign-previews"
        role="tabpanel"
        aria-labelledby={`campaign-hook-${hook}`}
        className={styles.previews}
      >
        {PACKAGE_FORMATS.map((format) => (
          <figure key={format} className={styles[format]}>
            <figcaption>
              <span>{formats[format].label}</span>
              <span>{formats[format].ratio}</span>
            </figcaption>
            <div className={styles.videoFrame}>
              <video
                key={`${format}-${hook}`}
                controls
                playsInline
                preload="none"
                poster={`/films/campaign/${format}-${PACKAGE_HOOKS[hook]}.webp`}
                src={`/films/campaign/${format}-${PACKAGE_HOOKS[hook]}.mp4`}
                aria-label={`${formats[format].label} sample: ${hooks[hook].label}`}
                onPlay={(event) => {
                  const playing = event.currentTarget;
                  root.current?.querySelectorAll("video").forEach((video) => {
                    if (video !== playing) video.pause();
                  });
                }}
              />
            </div>
            <p>{formats[format].use}</p>
          </figure>
        ))}
      </div>
      <div className={styles.delivery}>
        <div className={styles.deliveryTitle}>
          <Package size={20} />
          <div>
            <strong>One launch. The whole package.</strong>
            <span>9 MP4s + a thumbnail, together in one ZIP.</span>
          </div>
        </div>
        <div
          className={styles.fileGrid}
          aria-label="Nine videos included in a launch package"
        >
          {PACKAGE_FORMATS.flatMap((format) =>
            PACKAGE_HOOKS.map((variant) => (
              <span
                key={`${format}-${variant}`}
                data-selected={variant === PACKAGE_HOOKS[hook]}
              >
                <FileVideo size={12} aria-hidden="true" />
                {format}-{variant}.mp4
              </span>
            )),
          )}
        </div>
      </div>
      <div className={styles.campaignFooter}>
        <p>Three hooks × three formats. Your story stays consistent.</p>
        <Link href="/editor/new">
          Build your launch package <ArrowUpRight size={16} />
        </Link>
      </div>
    </div>
  );
}
