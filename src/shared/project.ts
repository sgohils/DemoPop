import { z } from "zod";
export const TEMPLATE_VERSION = "reveal-1";
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
export const assetIdSchema = z.union([
  z.enum(["sample-before", "sample-after"]),
  z.uuid(),
]);
export const projectSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
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
  })
  .strict();
export type ProjectInput = z.infer<typeof projectSchema>;
export type Media = { src: string; width: number; height: number };
export type VideoProps = {
  project: ProjectInput;
  before: Media;
  after: Media;
  logo: Media | null;
};
export const defaultCrop = { x: 0.5, y: 0, zoom: 1 };
export const sampleProject: ProjectInput = {
  name: "Forma Studio",
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
