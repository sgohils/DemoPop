import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import type { Media, VideoProps } from "../src/shared/project";

// OffthreadVideo proxies its source in a request URL. Large data URLs exceed
// HTTP header limits, so verified private clips use a short, temporary address.
// Bind only to loopback; an unguessable per-render path gates every request.
export async function prepareVideoMedia(input: VideoProps) {
  const sources = [
    input.before,
    input.after,
    input.logo,
    ...Object.values(input.sceneMedia ?? {}),
  ].filter((media): media is Media => Boolean(media));
  const clips = new Map<string, Buffer>(),
    keys = new Map<string, string>();
  for (const media of sources) {
    if (media.kind !== "video" || !media.src.startsWith("data:")) continue;
    if (keys.has(media.src)) continue;
    if (!/^data:video\/mp4;base64,[A-Za-z0-9+/=]+$/.test(media.src))
      throw new Error("Invalid private clip source");
    const bytes = Buffer.from(
      media.src.slice(media.src.indexOf(",") + 1),
      "base64",
    );
    if (bytes.length > 16 * 1024 * 1024)
      throw new Error("Private clip is too large");
    const key = `clip-${clips.size}.mp4`;
    clips.set(key, bytes);
    keys.set(media.src, key);
  }
  if (!clips.size) return { props: input, cleanup: async () => {} };
  const token = randomBytes(24).toString("hex");
  const server = createServer((req, res) => {
    if (
      !["GET", "HEAD"].includes(req.method || "") ||
      !req.url?.startsWith(`/${token}/`)
    ) {
      res.writeHead(404).end();
      return;
    }
    const bytes = clips.get(req.url.slice(token.length + 2));
    if (!bytes) {
      res.writeHead(404).end();
      return;
    }
    const headers = {
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    };
    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) {
        res
          .writeHead(416, {
            ...headers,
            "Content-Range": `bytes */${bytes.length}`,
          })
          .end();
        return;
      }
      const start = match[1]
        ? Number(match[1])
        : Math.max(0, bytes.length - Number(match[2]));
      const end = match[1]
        ? match[2]
          ? Math.min(Number(match[2]), bytes.length - 1)
          : bytes.length - 1
        : bytes.length - 1;
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        start >= bytes.length ||
        end < start
      ) {
        res
          .writeHead(416, {
            ...headers,
            "Content-Range": `bytes */${bytes.length}`,
          })
          .end();
        return;
      }
      res.writeHead(206, {
        ...headers,
        "Content-Length": end - start + 1,
        "Content-Range": `bytes ${start}-${end}/${bytes.length}`,
      });
      res.end(
        req.method === "HEAD" ? undefined : bytes.subarray(start, end + 1),
      );
      return;
    }
    res.writeHead(200, { ...headers, "Content-Length": bytes.length });
    res.end(req.method === "HEAD" ? undefined : bytes);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Private clip server unavailable");
  const map = (media: Media): Media =>
    keys.has(media.src)
      ? {
          ...media,
          src: `http://127.0.0.1:${address.port}/${token}/${keys.get(media.src)}`,
        }
      : media;
  return {
    props: {
      ...input,
      before: map(input.before),
      after: map(input.after),
      logo: input.logo ? map(input.logo) : null,
      sceneMedia: Object.fromEntries(
        Object.entries(input.sceneMedia ?? {}).map(([id, media]) => [
          id,
          map(media),
        ]),
      ),
    },
    cleanup: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
