import { z } from "zod";
export const TEMPLATE_VERSION = "studio-6";
export const SUPPORTED_TEMPLATE_VERSIONS = new Set([
  "reveal-1",
  "studio-2",
  "launch-3",
  "launch-4",
  "launch-5",
  TEMPLATE_VERSION,
]);
export const TEMPLATES = [
  {
    id: "launch",
    name: "Launch Film",
    description:
      "A bold hook, cinematic product shots, and a sound-synced reveal.",
  },
  {
    id: "reveal",
    name: "Classic Reveal",
    description: "A clean wipe and two considered highlights.",
  },
  {
    id: "slide",
    name: "Slide & Settle",
    description: "A confident slide into your new design.",
  },
  {
    id: "split",
    name: "Split Compare",
    description: "See the old and new side by side.",
  },
] as const;
export const FONTS = {
  manrope: { name: "Manrope", file: "fonts/manrope.woff2", weight: "200 800" },
  "dm-sans": { name: "DM Sans", file: "fonts/dm-sans.ttf", weight: "100 1000" },
} as const;
export const fontSchema = z.enum(["manrope", "dm-sans"]);
export const formatSchema = z.enum(["vertical", "landscape", "square"]);
export const templateSchema = z.enum(["reveal", "slide", "split", "launch"]);
export const VIDEO = {
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 450,
} as const;
export const MAX_UPLOAD = 10 * 1024 * 1024;
export const cropSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    zoom: z.number().min(1).max(2),
  })
  .strict();
export const SAMPLE_ASSETS = {
  "sample-before": { file: "sample/before.png", width: 1440, height: 2000 },
  "sample-after": { file: "sample/after.png", width: 1440, height: 2000 },
  "sample-launch-before": {
    file: "sample/launch-before.png",
    width: 2560,
    height: 1760,
  },
  "sample-launch-after": {
    file: "sample/launch-after.png",
    width: 2560,
    height: 1760,
  },
} as const;
export function sampleAsset(id: string, base = ""): Media | null {
  const asset = Object.prototype.hasOwnProperty.call(SAMPLE_ASSETS, id)
    ? SAMPLE_ASSETS[id as keyof typeof SAMPLE_ASSETS]
    : null;
  return asset
    ? { src: `${base}/${asset.file}`, width: asset.width, height: asset.height }
    : null;
}
export const assetIdSchema = z.union([
  z.enum([
    "sample-before",
    "sample-after",
    "sample-launch-before",
    "sample-launch-after",
  ]),
  z.uuid(),
]);
export const storySceneSchema = z
  .object({
    id: z.uuid(),
    asset: assetIdSchema,
    caption: z.string().trim().min(1).max(70),
    crop: cropSchema,
    formatCrops: z
      .object({
        vertical: cropSchema.optional(),
        landscape: cropSchema.optional(),
        square: cropSchema.optional(),
      })
      .strict()
      .optional(),
    weight: z.number().int().min(1).max(5),
    trimStart: z.number().min(0).max(29).default(0),
  })
  .strict();
export const storySchema = z
  .object({
    duration: z.union([z.literal(15), z.literal(30), z.literal(60)]),
    scenes: z
      .array(storySceneSchema)
      .min(3)
      .max(6)
      .refine(
        (scenes) =>
          new Set(scenes.map((scene) => scene.id)).size === scenes.length,
        "Each scene needs a unique ID.",
      ),
  })
  .strict();
export type StoryScene = z.infer<typeof storySceneSchema>;
export type Story = z.infer<typeof storySchema>;
export const projectSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    template: templateSchema.default("reveal"),
    format: formatSchema.default("vertical"),
    font: fontSchema.default("manrope"),
    sound: z.enum(["off", "pulse"]).default("off"),
    cta: z.string().trim().min(1).max(36).default("See it in action."),
    opening: z.string().trim().min(1).max(70),
    highlight1: z.string().trim().min(1).max(48),
    highlight2: z.string().trim().min(1).max(48),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    url: z.string().trim().min(1).max(80),
    before: assetIdSchema,
    after: assetIdSchema,
    logo: assetIdSchema.nullable(),
    beforeCrop: cropSchema,
    afterCrop: cropSchema,
    highlight1Crop: cropSchema.nullable().optional(),
    highlight2Crop: cropSchema.nullable().optional(),
    story: storySchema.nullable().optional(),
    hooks: z.array(z.string().trim().min(1).max(70)).length(3).optional(),
    client: z.string().trim().max(60).optional(),
    sourceUrl: z.url().max(2048).optional(),
  })
  .strict();
export type ProjectInput = z.infer<typeof projectSchema>;
export const brandKitSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    font: fontSchema,
    logo: assetIdSchema.nullable(),
    url: z.string().trim().max(80),
  })
  .strict();
export type BrandKitInput = z.infer<typeof brandKitSchema>;
export function videoSettings(project: Pick<ProjectInput, "format" | "story">) {
  return {
    ...VIDEO,
    ...(project.format === "landscape" ? { width: 1920, height: 1080 } : {}),
    ...(project.format === "square" ? { width: 1080, height: 1080 } : {}),
    durationInFrames: (project.story?.duration ?? 15) * VIDEO.fps,
  };
}
export type Media = {
  src: string;
  width: number;
  height: number;
  kind?: "video";
  duration?: number;
};
export type VideoProps = {
  project: ProjectInput;
  before: Media;
  after: Media;
  logo: Media | null;
  sceneMedia?: Record<string, Media>;
};
export function resolveStoryMedia(
  assetId: string,
  beforeId: string,
  afterId: string,
  before: Media,
  after: Media,
  sceneMedia: Record<string, Media>,
): Media | null {
  if (sceneMedia[assetId]) return sceneMedia[assetId];
  if (assetId === beforeId) return before;
  if (assetId === afterId) return after;
  return null;
}
export function hasUsableClipTrim(
  media: Media,
  trimStart: number,
  fps = VIDEO.fps,
) {
  return (
    media.kind !== "video" ||
    clipPlaybackFrames(media.duration, trimStart, fps) !== null
  );
}
export function clipPlaybackFrames(
  durationSeconds: number | undefined,
  trimStart: number,
  fps: number = VIDEO.fps,
) {
  if (
    !Number.isFinite(durationSeconds) ||
    !Number.isFinite(trimStart) ||
    !Number.isFinite(fps) ||
    fps <= 0 ||
    trimStart < 0 ||
    (durationSeconds! - trimStart) * fps < 1 - 1e-9
  ) {
    return null;
  }

  // Quantize both the full clip and trim point against the same frame grid.
  // Subtracting independently rounded seconds can drop a valid final frame.
  const totalFrames = Math.floor(durationSeconds! * fps + 1e-9);
  const trimBefore = Math.floor(trimStart * fps);
  const durationInFrames = totalFrames - trimBefore;
  if (totalFrames < 1 || durationInFrames < 1) return null;
  return { trimBefore, durationInFrames };
}
export function projectAssetIds(project: ProjectInput) {
  return [
    ...new Set(
      [
        project.before,
        project.after,
        project.logo,
        ...(project.story?.scenes.map((scene) => scene.asset) ?? []),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
}
export const defaultCrop = { x: 0.5, y: 0, zoom: 1 };
export const sampleProject: ProjectInput = {
  name: "Forma Studio",
  template: "reveal",
  format: "vertical",
  font: "manrope",
  sound: "off",
  cta: "See it in action.",
  opening: "A fresh perspective.\nA better first impression.",
  highlight1: "Room for the work to shine.",
  highlight2: "A clearer path to getting in touch.",
  color: "#365DDB",
  url: "forma-studio.example",
  before: "sample-before",
  after: "sample-after",
  logo: null,
  beforeCrop: { ...defaultCrop },
  afterCrop: { ...defaultCrop },
};
export const launchProject: ProjectInput = {
  ...sampleProject,
  name: "Orbit",
  template: "launch",
  font: "dm-sans",
  sound: "pulse",
  opening: "Your idea.\nAlready in motion.",
  highlight1: "One prompt. A clear plan.",
  highlight2: "Less setup. More momentum.",
  cta: "Build what’s next.",
  color: "#8C9EFF",
  url: "orbit.example",
  before: "sample-launch-before",
  after: "sample-launch-after",
};
export const launchMedia = (
  base = "",
): Pick<VideoProps, "before" | "after" | "logo"> => ({
  before: sampleAsset(launchProject.before, base)!,
  after: sampleAsset(launchProject.after, base)!,
  logo: null,
});
export function newProject(style?: {
  template?: ProjectInput["template"];
  format?: ProjectInput["format"];
}): ProjectInput {
  return {
    ...(style?.template && style.template !== "launch"
      ? sampleProject
      : launchProject),
    ...(style?.template ? { template: style.template } : {}),
    ...(style?.format ? { format: style.format } : {}),
  };
}
export const sampleMedia = (
  base = "",
): Pick<VideoProps, "before" | "after" | "logo"> => ({
  before: { src: `${base}/sample/before.png`, width: 1440, height: 2000 },
  after: { src: `${base}/sample/after.png`, width: 1440, height: 2000 },
  logo: null,
});
export function coverGeometry(
  media: Pick<Media, "width" | "height">,
  crop: z.infer<typeof cropSchema>,
  width: number,
  height: number,
  extraZoom = 1,
) {
  const scale =
    Math.max(width / media.width, height / media.height) *
    crop.zoom *
    extraZoom;
  const w = media.width * scale,
    h = media.height * scale;
  return {
    width: w,
    height: h,
    left: -(w - width) * crop.x,
    top: -(h - height) * crop.y,
  };
}
