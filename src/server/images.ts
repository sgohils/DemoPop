import sharp from "sharp";
import { MAX_UPLOAD } from "../shared/project";
export async function normalizeImage(bytes: Buffer) {
  if (!bytes.length || bytes.length > MAX_UPLOAD)
    throw new Error("Choose an image smaller than 10 MB.");
  const png = bytes
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp =
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP";
  if (!png && !jpeg && !webp)
    throw new Error("Only real PNG, JPEG, and WebP images are supported.");
  try {
    const image = sharp(bytes, {
      limitInputPixels: 40_000_000,
      failOn: "warning",
      animated: false,
    });
    const metadata = await image.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      (metadata.pages ?? 1) > 1 ||
      metadata.width < 64 ||
      metadata.height < 64
    )
      throw new Error("Invalid dimensions or animated image");
    const { data, info } = await image
      .rotate()
      .resize({
        width: 2560,
        height: 12000,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 94 })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    throw new Error(
      "This image could not be decoded. Use a still image of at least 64 × 64 pixels and at most 40 megapixels.",
    );
  }
}
