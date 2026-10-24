import { z } from "zod";
import {
  defaultCrop,
  formatSchema,
  projectSchema,
  type ProjectInput,
} from "./project";
import type { WebsiteImport } from "../server/website-import";

export const VIDEO_GOALS = [
  {
    id: "website",
    name: "Website launch",
    description: "Introduce the whole product.",
  },
  {
    id: "feature",
    name: "Feature spotlight",
    description: "Bring one detail into focus.",
  },
  {
    id: "redesign",
    name: "Client reveal",
    description: "Give a new website its moment.",
  },
] as const;

export const linkVideoRequestSchema = z
  .object({
    url: z
      .string()
      .trim()
      .min(1)
      .max(2048)
      .transform((value) =>
        /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`,
      )
      .pipe(
        z
          .url()
          .max(2048)
          .refine((value) => {
            const url = new URL(value);
            return (
              ["http:", "https:"].includes(url.protocol) &&
              !url.username &&
              !url.password
            );
          }, "Enter a public website URL."),
      ),
    format: formatSchema.default("landscape"),
    duration: z
      .union([z.literal(15), z.literal(30), z.literal(60)])
      .default(30),
    goal: z.enum(["website", "feature", "redesign"]).optional(),
    previewOnly: z.boolean().optional(),
  })
  .strict();
export type LinkVideoOptions = Pick<
  z.infer<typeof linkVideoRequestSchema>,
  "format" | "duration" | "goal"
>;

/** Keep complete words and graphemes within the renderer's copy limits. */
export function linkVideoCopy(value: string, max: number) {
  const text = value.replace(/\s+/gu, " ").trim();
  if (text.length <= max) return text;
  const prefix = text.slice(0, max - 1);
  const boundary = prefix.lastIndexOf(" ");
  if (boundary >= max * 0.55)
    return prefix.slice(0, boundary).replace(/[,;:—–-]+$/u, "") + "…";
  let result = "";
  for (const { segment } of new Intl.Segmenter(undefined, {
    granularity: "grapheme",
  }).segment(text)) {
    if (result.length + segment.length > max - 1) break;
    result += segment;
  }
  return result.trimEnd() + "…";
}

export function buildLinkVideo(
  website: WebsiteImport,
  options: Partial<LinkVideoOptions>,
  assets: { captures: string[]; logo: string | null },
): ProjectInput {
  if (website.captures.length < 3 || assets.captures.length < 3)
    throw new Error(
      "The website needs three captured views to create a video.",
    );
  const name = linkVideoCopy(website.name || new URL(website.url).hostname, 60);
  const opening = linkVideoCopy(
    options.goal === "redesign"
      ? `A new look for ${name}.`
      : options.goal === "feature"
        ? `${name}. A closer look.`
        : website.opening || `Meet ${name}.`,
    70,
  );
  const description =
    "description" in website && typeof website.description === "string"
      ? website.description
      : "";
  const order = options.goal === "feature" ? [1, 0, 2] : [0, 1, 2];
  const captions = order.map((captureIndex, index) => {
    const capture = website.captures[captureIndex];
    const source =
      captureIndex === 0 && description ? description : capture.caption;
    return linkVideoCopy(
      source && source.trim() !== opening
        ? source
        : index === 0
          ? `Meet ${name}.`
          : index === 1
            ? "Take a closer look."
            : "See it on mobile.",
      70,
    );
  });
  return projectSchema.parse({
    name,
    opening,
    template: "launch",
    format: options.format ?? "landscape",
    font: website.font,
    sound: "pulse",
    cta: linkVideoCopy(website.cta || "Explore the website.", 36),
    highlight1: linkVideoCopy(captions[1], 48),
    highlight2: linkVideoCopy(captions[2], 48),
    color: website.color,
    url: linkVideoCopy(new URL(website.url).hostname, 80),
    sourceUrl: website.url,
    before: assets.captures[order[0]],
    after: assets.captures[order[1]],
    logo: assets.logo,
    beforeCrop: { ...defaultCrop },
    afterCrop: { ...defaultCrop },
    story: {
      duration: options.duration ?? 30,
      scenes: captions.map((caption, index) => ({
        id: crypto.randomUUID(),
        asset: assets.captures[order[index]],
        caption,
        crop: { ...defaultCrop },
        weight: 3,
        trimStart: 0,
      })),
    },
  });
}
