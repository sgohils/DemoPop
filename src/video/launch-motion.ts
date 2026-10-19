import {
  coverGeometry,
  type Media,
  type ProjectInput,
} from "../shared/project";
import { contrastRatio, mixColor } from "../shared/video-style";
import fontMetrics from "./font-metrics.json";

export const LAUNCH_BEATS = {
  opening: 0,
  before: 54,
  reveal: 105,
  highlight1: 171,
  highlight2: 255,
  closing: 354,
  end: 450,
} as const;

/** Fast intent, then a quiet settle. All movement is frame deterministic. */
export function launchProgress(frame: number, start: number, end: number) {
  const progress = Math.max(0, Math.min(1, (frame - start) / (end - start)));
  return 1 - (1 - progress) ** 4;
}

export function launchWindow(
  frame: number,
  start: number,
  end: number,
  entrance = 10,
  exit = 8,
) {
  if (frame < start || frame >= end) return 0;
  return (
    launchProgress(frame, start, start + entrance) *
    (1 - launchProgress(frame, end - exit, end))
  );
}

export function launchAccent(brand: string) {
  let accent = brand;
  for (let step = 0; step <= 20; step++) {
    accent = mixColor(brand, "#ffffff", step / 20);
    if (contrastRatio(accent, "#08090c") >= 5) return accent;
  }
  return accent;
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const characters = (text: string) =>
  Array.from(graphemes.segment(text), (part) => part.segment);

/** Real bundled-font advances, including the headline's -0.035em tracking. */
export function launchTextWidth(
  text: string,
  size: number,
  font: ProjectInput["font"] = "dm-sans",
) {
  const metrics: Record<string, number> = fontMetrics[font];
  const glyphs = characters(text);
  const advance = glyphs.reduce((sum, glyph) => {
    const base = glyph.normalize("NFD")[0];
    return sum + (metrics[glyph] ?? metrics[base] ?? 1.12);
  }, 0);
  // Small allowance for kerning/fallback shaping differences between platforms.
  return (
    Math.max(0, advance - Math.max(0, glyphs.length - 1) * 0.035) * size * 1.04
  );
}

/** Balance whole words instead of letting a short last line become an orphan. */
function balancedLines(
  words: string[],
  width: number,
  size: number,
  font: ProjectInput["font"],
) {
  const widths = new Map<string, number>();
  const measure = (copy: string) => {
    if (!widths.has(copy)) widths.set(copy, launchTextWidth(copy, size, font));
    return widths.get(copy)!;
  };
  const greedy: string[] = [];
  let current = "";
  for (const word of words) {
    if (current && measure(`${current} ${word}`) > width) {
      greedy.push(current);
      current = word;
    } else current = current ? `${current} ${word}` : word;
  }
  if (current) greedy.push(current);
  if (greedy.length < 2) return greedy;
  const target = Math.min(width, measure(words.join(" ")) / greedy.length);
  const memo = new Map<string, { cost: number; lines: string[] } | null>();
  const solve = (
    start: number,
    remaining: number,
  ): { cost: number; lines: string[] } | null => {
    if (!remaining)
      return start === words.length ? { cost: 0, lines: [] } : null;
    const key = `${start}:${remaining}`;
    if (memo.has(key)) return memo.get(key)!;
    let best: { cost: number; lines: string[] } | null = null;
    for (let end = start + 1; end <= words.length - remaining + 1; end++) {
      const line = words.slice(start, end).join(" ");
      const measured = measure(line);
      if (measured > width) break;
      const tail = solve(end, remaining - 1);
      if (!tail) continue;
      const balance = ((measured - target) / width) ** 2;
      const sentence = end < words.length && /[.!?:;]$/.test(line) ? -0.035 : 0;
      const orphan = measured < width * 0.24 ? 0.12 : 0;
      const cost = balance + sentence + orphan + tail.cost;
      if (!best || cost < best.cost)
        best = { cost, lines: [line, ...tail.lines] };
    }
    memo.set(key, best);
    return best;
  };
  return solve(0, greedy.length)?.lines ?? greedy;
}

/** Accurate, balanced headlines; hard returns remain editorial break points. */
export function fitLaunchText(
  text: string,
  width: number,
  height: number,
  preferredSize: number,
  lineHeight = 1.02,
  font: ProjectInput["font"] = "dm-sans",
) {
  const paragraphs = text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  const copy = paragraphs.length > 3 ? [paragraphs.join(" ")] : paragraphs;
  // Short two-part benefit copy reads as complete thoughts. A modest size
  // reduction is preferable to orphaning "More" or a final single noun.
  if (copy.length === 1) {
    const sentences = copy[0].split(/(?<=[.!?])\s+/u);
    if (
      sentences.length > 1 &&
      sentences.length <= 3 &&
      launchTextWidth(copy[0], preferredSize, font) > width
    ) {
      const semanticSize = Math.floor(
        Math.min(
          preferredSize,
          height / (sentences.length * lineHeight),
          ...sentences.map(
            (sentence) => width / launchTextWidth(sentence, 1, font),
          ),
        ),
      );
      if (semanticSize >= preferredSize * 0.72)
        return {
          text: sentences.join("\n"),
          fontSize: semanticSize,
          lineHeight,
        };
    }
  }
  let fallback = { text: "", fontSize: 14, lineHeight };
  for (let size = preferredSize; size >= 14; size--) {
    const lines: string[] = [];
    let fits = true;
    for (const paragraph of copy) {
      const words = paragraph.split(" ");
      const longIdentifier =
        words.length === 1 && characters(words[0]).length >= 36;
      const unspacedScript =
        /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Punctuation}]+$/u.test(
          paragraph,
        );
      if (longIdentifier || unspacedScript) {
        let line = "";
        for (const glyph of characters(paragraph)) {
          if (line && launchTextWidth(line + glyph, size, font) > width) {
            lines.push(line);
            line = "";
          }
          line += glyph;
        }
        if (line) lines.push(line);
      } else {
        if (words.some((word) => launchTextWidth(word, size, font) > width))
          fits = false;
        lines.push(...balancedLines(words, width, size, font));
      }
    }
    fallback = { text: lines.join("\n"), fontSize: size, lineHeight };
    if (fits && lines.length * size * lineHeight <= height) return fallback;
  }
  return fallback;
}

/**
 * Detail cuts enlarge the user's chosen viewport, rather than exposing a
 * different part of a private image or moving beyond an edge of its crop.
 */
export function launchShotGeometry(
  media: Pick<Media, "width" | "height">,
  crop: ProjectInput["afterCrop"],
  width: number,
  height: number,
  zoom = 1,
  anchorX = 0.5,
  anchorY = 0.5,
) {
  const base = coverGeometry(media, crop, width, height);
  const amount = Math.max(1, zoom);
  const x = Math.max(0, Math.min(1, anchorX));
  const y = Math.max(0, Math.min(1, anchorY));
  return {
    width: base.width * amount,
    height: base.height * amount,
    left: base.left * amount + width * x * (1 - amount),
    top: base.top * amount + height * y * (1 - amount),
  };
}

/** Keep additional automatic punch-ins modest on tall and panoramic sources. */
export function launchDetailZoom(
  media: Pick<Media, "width" | "height">,
  zoom: number,
) {
  const aspect = media.width / media.height;
  const weight = aspect < 1 ? 0 : aspect > 2.4 ? 0.2 : 1;
  return 1 + (zoom - 1) * weight;
}

/**
 * Each custom shot selects the source independently. Blend covering geometries,
 * rather than crop coordinates, so zoom changes never expose an image edge.
 * Missing settings preserve the original automatic camera exactly.
 */
export function launchAfterGeometry(
  media: Pick<Media, "width" | "height">,
  project: Pick<
    ProjectInput,
    "afterCrop" | "highlight1Crop" | "highlight2Crop"
  >,
  width: number,
  height: number,
  frame: number,
  zoom = 1,
  anchorX = 0.5,
  anchorY = 0.5,
) {
  const automatic = launchShotGeometry(
    media,
    project.afterCrop,
    width,
    height,
    launchDetailZoom(media, zoom),
    anchorX,
    anchorY,
  );
  if (!project.highlight1Crop && !project.highlight2Crop) return automatic;
  const blend = (start: number, end: number) => {
    const t = Math.max(0, Math.min(1, (frame - start) / (end - start)));
    return t * t * (3 - 2 * t);
  };
  const second = blend(LAUNCH_BEATS.highlight2, LAUNCH_BEATS.highlight2 + 20);
  const first = blend(LAUNCH_BEATS.highlight1, LAUNCH_BEATS.highlight1 + 22);
  const firstWeight = project.highlight1Crop ? first * (1 - second) : 0;
  const secondWeight = project.highlight2Crop ? second : 0;
  if (firstWeight === 0 && secondWeight === 0) return automatic;
  const firstShot = project.highlight1Crop
    ? coverGeometry(media, project.highlight1Crop, width, height)
    : automatic;
  const secondShot = project.highlight2Crop
    ? coverGeometry(media, project.highlight2Crop, width, height)
    : automatic;
  if (firstWeight === 1) return firstShot;
  if (secondWeight === 1) return secondShot;
  const geometry = { ...automatic };
  for (const key of Object.keys(geometry) as (keyof typeof geometry)[]) {
    geometry[key] =
      automatic[key] * (1 - firstWeight - secondWeight) +
      firstShot[key] * firstWeight +
      secondShot[key] * secondWeight;
  }
  return geometry;
}
