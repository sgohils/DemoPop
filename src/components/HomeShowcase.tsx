"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  ArrowUpRight,
  Monitor,
  Smartphone,
  ArrowRight,
  Check,
} from "lucide-react";
import { Preview } from "./Preview";
import {
  sampleMedia,
  sampleProject,
  launchProject,
  launchMedia,
  TEMPLATES,
  type ProjectInput,
} from "../shared/project";
import styles from "./home-showcase.module.css";

const notes = {
  launch: "THE ANNOUNCEMENT",
  reveal: "THE TRANSFORMATION",
  slide: "THE NEW PERSPECTIVE",
  split: "THE SIDE BY SIDE",
};

export function HomeShowcase() {
  const [template, setTemplate] = useState<ProjectInput["template"]>("launch");
  const [format, setFormat] = useState<ProjectInput["format"]>("landscape");
  const verticalFormatButton = useRef<HTMLButtonElement>(null);
  const landscapeFormatButton = useRef<HTMLButtonElement>(null);
  const templateButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = TEMPLATES.find((item) => item.id === template)!;
  const project = template === "launch" ? launchProject : sampleProject;
  return (
    <section className={styles.showcase} aria-label="Interactive sample video">
      <div className={styles.playerSide}>
        <div className={styles.canvasHeader}>
          <span>
            <i /> LIVE MOTION PREVIEW
          </span>
          <div
            className={styles.formatToggle}
            role="group"
            aria-label="Sample video format"
          >
            <button
              ref={verticalFormatButton}
              type="button"
              aria-label="Portrait sample"
              aria-pressed={format === "vertical"}
              onClick={() => setFormat("vertical")}
              onKeyDown={(event) => {
                if (event.key !== "ArrowRight" && event.key !== "ArrowDown")
                  return;
                event.preventDefault();
                setFormat("landscape");
                landscapeFormatButton.current?.focus();
              }}
            >
              <Smartphone size={13} />
              9:16
            </button>
            <button
              ref={landscapeFormatButton}
              type="button"
              aria-label="Landscape sample"
              aria-pressed={format === "landscape"}
              onClick={() => setFormat("landscape")}
              onKeyDown={(event) => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowUp")
                  return;
                event.preventDefault();
                setFormat("vertical");
                verticalFormatButton.current?.focus();
              }}
            >
              <Monitor size={14} />
              16:9
            </button>
          </div>
        </div>
        <div
          className={`${styles.canvas} ${format === "landscape" ? styles.landscape : styles.portrait}`}
        >
          <div className={styles.canvasGrid} aria-hidden="true" />
          <span className={styles.canvasNote}>{notes[template]}</span>
          <Preview
            input={{
              project: { ...project, template, format },
              ...(template === "launch" ? launchMedia() : sampleMedia()),
            }}
            compact
            pauseWhenOffscreen
          />
        </div>
        <div className={styles.canvasFooter}>
          <span>
            {project.name} <ArrowRight size={12} /> {selected.name}
          </span>
          <span>ORIGINAL DEMO PROJECT</span>
        </div>
      </div>
      <div className={styles.directionSide}>
        <div className={styles.directionHeading}>
          <span>CHOOSE YOUR DIRECTION</span>
          <span>04 STYLES</span>
        </div>
        <div
          className={styles.templatePicker}
          role="group"
          aria-label="Sample motion template"
        >
          {TEMPLATES.map((item, index) => (
            <button
              className={styles.styleButton}
              key={item.id}
              ref={(element) => {
                templateButtons.current[index] = element;
              }}
              type="button"
              aria-label={`${item.name} sample`}
              aria-pressed={template === item.id}
              onClick={() => setTemplate(item.id)}
              onKeyDown={(event) => {
                const direction =
                  event.key === "ArrowRight" || event.key === "ArrowDown"
                    ? 1
                    : event.key === "ArrowLeft" || event.key === "ArrowUp"
                      ? -1
                      : 0;
                if (!direction) return;
                event.preventDefault();
                const nextIndex =
                  (index + direction + TEMPLATES.length) % TEMPLATES.length;
                setTemplate(TEMPLATES[nextIndex].id);
                templateButtons.current[nextIndex]?.focus();
              }}
            >
              <span className={styles.styleNumber}>0{index + 1}</span>
              <span>
                <strong>{item.name}</strong>
                <small>{notes[item.id]}</small>
              </span>
              <span className={styles.styleIndicator}>
                {template === item.id ? (
                  <Check size={14} />
                ) : (
                  <ArrowUpRight size={15} />
                )}
              </span>
            </button>
          ))}
        </div>
        <p className={styles.selectionDescription} aria-live="polite">
          {selected.description}
        </p>
        <Link
          className={styles.useStyle}
          href={`/editor/new?template=${template}&format=${format}`}
        >
          Use this style <ArrowUpRight size={17} />
        </Link>
        <p className={styles.hint}>
          Switch a style. Change the format.
          <br />
          This is the same renderer you’ll use.
        </p>
      </div>
    </section>
  );
}
