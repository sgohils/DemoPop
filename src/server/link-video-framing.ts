import sharp from "sharp";

const canvas = { width: 1600, height: 900 };
export function linkMobileFrameGeometry(source: {
  width: number;
  height: number;
}) {
  const scale = Math.min(960 / source.width, 792 / source.height, 2);
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);
  return {
    ...canvas,
    screen: {
      width,
      height,
      left: Math.round((canvas.width - width) / 2),
      top: Math.round((canvas.height - height) / 2),
    },
  };
}

/** Frame the mobile capture before registration so every export retains its
 * complete screen, and editor thumbnails show the same composition. */
export async function frameLinkMobileCapture(image: {
  data: Buffer;
  width: number;
  height: number;
}) {
  if (image.width >= image.height) return image;
  const frame = linkMobileFrameGeometry(image);
  const screen = frame.screen;
  const mask = Buffer.from(
    `<svg width="${screen.width}" height="${screen.height}"><rect width="100%" height="100%" rx="20" fill="white"/></svg>`,
  );
  const screenshot = await sharp(image.data)
    .resize(screen.width, screen.height)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
  const surround = Buffer.from(
    `<svg width="1600" height="900"><defs><radialGradient id="glow"><stop stop-color="#262d3c"/><stop offset="1" stop-color="#111318"/></radialGradient></defs><rect width="1600" height="900" fill="url(#glow)"/><rect x="${screen.left - 4}" y="${screen.top - 4}" width="${screen.width + 8}" height="${screen.height + 8}" rx="24" fill="#535b6c"/></svg>`,
  );
  const data = await sharp({
    create: { ...canvas, channels: 4, background: "#111318" },
  })
    .composite([
      { input: surround },
      { input: screenshot, left: screen.left, top: screen.top },
    ])
    .webp({ lossless: true, exact: true, effort: 3 })
    .toBuffer();
  return { data, ...canvas };
}
