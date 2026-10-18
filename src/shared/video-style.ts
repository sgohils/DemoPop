import { coverGeometry, type Media, type ProjectInput } from "./project";

export const REVEAL_BACKGROUND = "#f5f3ed";
const INK = "#172126";
const WHITE = "#ffffff";

function channels(hex: string) {
  return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
}

function luminance(hex: string) {
  const rgb = channels(hex).map((value) => {
    const srgb = value / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

export function contrastRatio(first: string, second: string) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Opaque text with at least 4.5:1 contrast on any allowed brand color. */
export function readableTextColor(background: string) {
  if (contrastRatio(WHITE, background) >= 4.5) return WHITE;
  if (contrastRatio(INK, background) >= 4.5) return INK;
  return "#000000";
}

export function mixColor(from: string, to: string, amount: number) {
  const target = channels(to);
  const rgb = channels(from).map((value, index) =>
    Math.round(value + (target[index] - value) * amount)
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${rgb.join("")}`;
}

/** Keep the brand hue where readable; move only text toward a safe foreground. */
function readableAccent(brand: string, background: string) {
  if (contrastRatio(brand, background) >= 4.5) return brand;
  const target = readableTextColor(background);
  let low = 0;
  let high = 1;
  for (let i = 0; i < 24; i++) {
    const middle = (low + high) / 2;
    if (contrastRatio(mixColor(brand, target, middle), background) >= 4.5)
      high = middle;
    else low = middle;
  }
  return mixColor(brand, target, high);
}

export function revealColors(brand: string) {
  const badgeBackground = mixColor(REVEAL_BACKGROUND, brand, 22 / 255);
  return {
    accent: readableAccent(brand, REVEAL_BACKGROUND),
    badgeBackground,
    badgeText: readableAccent(brand, badgeBackground),
    outroText: readableTextColor(brand),
  };
}

const progress = (frame: number, start: number, end: number) => {
  const t = Math.max(0, Math.min(1, (frame - start) / (end - start)));
  return t * t * (3 - 2 * t);
};

/** Two gentle pushes, each settling before its caption hands off. */
export function highlightMotion(frame: number) {
  const first = progress(frame, 210, 255);
  const second = progress(frame, 285, 335);
  return {
    zoom: 1 + first * 0.025 + second * 0.02,
    anchorX: 0.32 + second * 0.36,
    anchorY: 0.28 + second * 0.34,
  };
}

export function highlightGeometry(
  media: Pick<Media, "width" | "height">,
  crop: ProjectInput["afterCrop"],
  width: number,
  height: number,
  frame: number,
) {
  const base = coverGeometry(media, crop, width, height);
  const { zoom, anchorX, anchorY } = highlightMotion(frame);
  // Enlarge the selected viewport about an internal anchor. Every visible
  // source pixel stays inside the user's original crop, including edge crops.
  return {
    width: base.width * zoom,
    height: base.height * zoom,
    left: base.left * zoom + width * anchorX * (1 - zoom),
    top: base.top * zoom + height * anchorY * (1 - zoom),
  };
}
