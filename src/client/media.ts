import { MAX_UPLOAD, type Media } from "../shared/project";
export async function localMedia(blob: Blob): Promise<Media> {
  if (blob.size > MAX_UPLOAD)
    throw new Error("Choose a file smaller than 10 MB.");
  if (blob.type === "video/mp4") {
    const src = URL.createObjectURL(blob);
    try {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(
              new Error(
                "The clip took too long to load. Try another MP4 file.",
              ),
            ),
          10000,
        );
        video.onloadedmetadata = () => {
          clearTimeout(timer);
          resolve();
        };
        video.onerror = () => {
          clearTimeout(timer);
          reject(new Error("Use a playable H.264 MP4."));
        };
        video.src = src;
      });
      if (
        !Number.isFinite(video.duration) ||
        video.duration < 0.1 ||
        video.duration > 30 ||
        Math.min(video.videoWidth, video.videoHeight) < 64 ||
        Math.max(video.videoWidth, video.videoHeight) > 4096
      )
        throw new Error(
          "Use an MP4 clip between 0.1 and 30 seconds long, with each dimension between 64 and 4096 pixels.",
        );
      const result: Media = {
        src,
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
        kind: "video",
      };
      video.removeAttribute("src");
      video.load();
      return result;
    } catch (error) {
      URL.revokeObjectURL(src);
      throw error;
    }
  }
  if (!["image/png", "image/jpeg", "image/webp"].includes(blob.type))
    throw new Error("Choose a PNG, JPEG, WebP, or MP4 file.");
  const bitmap = await createImageBitmap(blob);
  try {
    if (
      bitmap.width < 64 ||
      bitmap.height < 64 ||
      bitmap.width * bitmap.height > 40_000_000
    )
      throw new Error(
        "Use an image of at least 64 × 64 pixels, up to 40 megapixels.",
      );
    return {
      src: URL.createObjectURL(blob),
      width: bitmap.width,
      height: bitmap.height,
    };
  } finally {
    bitmap.close();
  }
}
