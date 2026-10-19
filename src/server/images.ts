import sharp from "sharp";
import { MAX_UPLOAD } from "../shared/project";

// Match the private inputs bucket. A small compressed upload can decode into a
// much larger lossless image, so keep the prepared file within its storage cap.
const MAX_NORMALIZED_IMAGE = 15 * 1024 * 1024;
class PreparedImageTooLarge extends Error {}

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
    const prepared = image.rotate().resize({
      width: 2560,
      height: 12000,
      fit: "inside",
      withoutEnlargement: true,
    });
    // Screenshots and logos need their small type, colored edges, and alpha
    // intact. Avoid introducing a lossy encode before the final MP4 encode.
    let { data, info } = await prepared
      .clone()
      .webp({ lossless: true, exact: true, effort: 3 })
      .toBuffer({ resolveWithObject: true });
    // Dense photographic inputs can exceed the bucket limit when made lossless.
    // Only those inputs use lossy WebP; preserve alpha and use sharper chroma
    // subsampling while bounding both encoding work and the stored file size.
    for (const quality of [94, 88, 82]) {
      if (data.length <= MAX_NORMALIZED_IMAGE) break;
      ({ data, info } = await prepared
        .clone()
        .webp({ quality, alphaQuality: 100, smartSubsample: true, effort: 4 })
        .toBuffer({ resolveWithObject: true }));
    }
    if (data.length > MAX_NORMALIZED_IMAGE)
      throw new PreparedImageTooLarge(
        "This image is too complex to prepare. Try a smaller image.",
      );
    return { data, width: info.width, height: info.height };
  } catch (error) {
    if (error instanceof PreparedImageTooLarge) throw error;
    throw new Error(
      "This image could not be decoded. Use a still image of at least 64 × 64 pixels and at most 40 megapixels.",
    );
  }
}
