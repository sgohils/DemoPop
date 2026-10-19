import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { makeCancelSignal } from "@remotion/renderer";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildLinkVideo, linkVideoRequestSchema } from "../shared/link-video";
import type { Media, VideoProps } from "../shared/project";
import { safeStoragePath } from "./access";
import { normalizeImage } from "./images";
import { frameLinkMobileCapture } from "./link-video-framing";
import { publicWebUrl } from "./public-web";
import {
  createLinkVideoJobStore,
  LinkVideoError,
  videoByteRange,
  type LocalLinkVideoJob,
} from "./link-video-jobs";
import { adminClient, cloudConfigured, userClient } from "./supabase";
import { captureWebsite, type WebsiteImport } from "./website-import";

type LinkVideoRequest = z.infer<typeof linkVideoRequestSchema>;
type StoredImage = Awaited<ReturnType<typeof normalizeImage>> & { id: string };
const prefix = "demopop-link-video-";
const stateKey = Symbol.for("demopop.create-from-link.v1");
type State = {
  jobs: ReturnType<typeof createLinkVideoJobStore>;
  cloudCaptures: number;
};
const globalState = globalThis as typeof globalThis & { [stateKey]?: State };
const state: State = (globalState[stateKey] ??= (() => {
  const jobs = createLinkVideoJobStore({ onDrop: removeLocalOutput });
  const expiry = setInterval(() => void jobs.prune().catch(() => {}), 60_000);
  expiry.unref();
  // A stopped local server cannot run its expiry timer. Sweep only our stale
  // direct children of the OS temp directory, well beyond the render deadline.
  void removeAbandonedOutputs().catch(() => {});
  return { cloudCaptures: 0, jobs };
})());

async function removeAbandonedOutputs() {
  const root = path.resolve(tmpdir());
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith(prefix)) continue;
    const directory = path.resolve(root, entry.name);
    if (path.dirname(directory) !== root) continue;
    const metadata = await stat(directory).catch(() => null);
    if (metadata && metadata.mtimeMs < Date.now() - 2 * 60 * 60_000)
      await rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

async function removeLocalOutput(job: LocalLinkVideoJob) {
  if (!job.directory) return;
  const directory = path.resolve(job.directory);
  if (
    path.dirname(directory) !== path.resolve(tmpdir()) ||
    !path.basename(directory).startsWith(prefix)
  )
    throw new Error("Unexpected local video cleanup path");
  await rm(directory, { recursive: true, force: true });
}

export function linkVideoJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function linkVideoFailure(error: unknown) {
  if (error instanceof LinkVideoError)
    return linkVideoJson(
      {
        error: error.message,
        ...(error.projectId ? { projectId: error.projectId } : {}),
      },
      error.status,
    );
  if (error instanceof z.ZodError || error instanceof SyntaxError)
    return linkVideoJson(
      {
        error:
          "Enter a public website URL and choose a supported video size and duration.",
      },
      400,
    );
  return linkVideoJson(
    { error: "The video could not be created. Please try again." },
    503,
  );
}

export function localLinkVideoAllowed(req: NextRequest) {
  if (
    (process.env.NODE_ENV === "production" &&
      process.env.DEMOPOP_LOCAL_PREVIEW !== "1") ||
    !["localhost", "127.0.0.1", "[::1]"].includes(req.nextUrl.hostname)
  )
    throw new LinkVideoError(
      503,
      "Connect the account service to create videos from a link.",
    );
}

export async function readLinkVideoRequest(req: NextRequest) {
  if (
    !req.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new LinkVideoError(415, "Send a website URL as JSON.");
  if (Number(req.headers.get("content-length")) > 4096)
    throw new LinkVideoError(413, "Enter a shorter website URL.");
  const reader = req.body?.getReader();
  if (!reader) throw new LinkVideoError(400, "Enter a website URL.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) {
      await reader.cancel();
      throw new LinkVideoError(413, "Enter a shorter website URL.");
    }
    chunks.push(value);
  }
  const result = linkVideoRequestSchema.parse(
    JSON.parse(Buffer.concat(chunks).toString("utf8")),
  );
  try {
    publicWebUrl(result.url);
  } catch {
    throw new LinkVideoError(
      400,
      "Use a public website on its standard HTTP or HTTPS port.",
    );
  }
  return result;
}

async function ownerIdentity() {
  const identity = await (await userClient()).auth.getUser();
  if (identity.error || !identity.data.user)
    throw new LinkVideoError(401, "Sign in to create a video from your link.");
  return identity.data.user.id;
}

async function prepareImages(result: WebsiteImport) {
  const prepare = async (source: string): Promise<StoredImage> => {
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(source))
      throw new Error("Unexpected website capture image");
    return {
      ...(await normalizeImage(
        Buffer.from(source.slice(source.indexOf(",") + 1), "base64"),
      )),
      id: randomUUID(),
    };
  };
  const captures = [];
  for (const [index, capture] of result.captures.entries()) {
    const image = await prepare(capture.image);
    captures.push(
      index === 2
        ? { ...(await frameLinkMobileCapture(image)), id: image.id }
        : image,
    );
  }
  const logo = result.logo ? await prepare(result.logo) : null;
  return { captures, logo };
}

function generatedProject(
  result: WebsiteImport,
  request: LinkVideoRequest,
  images: Awaited<ReturnType<typeof prepareImages>>,
) {
  return buildLinkVideo(result, request, {
    captures: images.captures.map((image) => image.id),
    logo: images.logo?.id ?? null,
  });
}

export async function reserveLocalLinkVideo(req: NextRequest) {
  localLinkVideoAllowed(req);
  return state.jobs.reserve();
}

export async function runLocalLinkVideo(
  job: LocalLinkVideoJob,
  request: LinkVideoRequest,
) {
  const { cancel, cancelSignal } = makeCancelSignal();
  let timedOut = false;
  const deadline = setTimeout(() => {
    timedOut = true;
    cancel();
  }, 8 * 60_000);
  try {
    job.status = "capturing";
    job.progress = 0.06;
    const captured = await captureWebsite(request.url);
    job.status = "preparing";
    job.progress = 0.2;
    const images = await prepareImages(captured);
    const project = generatedProject(captured, request, images);
    const media = Object.fromEntries(
      [...images.captures, ...(images.logo ? [images.logo] : [])].map(
        (image) => [
          image.id,
          {
            src: `data:image/webp;base64,${image.data.toString("base64")}`,
            width: image.width,
            height: image.height,
          } satisfies Media,
        ],
      ),
    );
    const props: VideoProps = {
      project,
      before: media[project.before],
      after: media[project.after],
      logo: project.logo ? media[project.logo] : null,
      sceneMedia: media,
    };
    job.directory = await mkdtemp(path.join(tmpdir(), prefix));
    job.output = path.join(job.directory, "video.mp4");
    job.status = "rendering";
    job.progress = 0.25;
    const { renderVideo } = await import("../../worker/render");
    await renderVideo(
      props,
      job.output,
      (progress) => {
        job.progress = Math.max(
          job.progress,
          0.25 + Math.min(1, progress) * 0.74,
        );
      },
      cancelSignal,
    );
    if (timedOut) throw new Error("Local render timed out");
    const output = await stat(job.output);
    if (!output.size || output.size > 100 * 1024 * 1024)
      throw new Error("Local render output is too large");
    state.jobs.finish(job);
  } catch (error) {
    console.error("Create-from-link local render failed:", error);
    await removeLocalOutput(job).catch(() => {});
    job.output = undefined;
    job.directory = undefined;
    state.jobs.finish(
      job,
      timedOut
        ? "This website took too long to turn into a video. Try a shorter video or another public page."
        : "This website could not be turned into a video. Try another public page.",
    );
  } finally {
    clearTimeout(deadline);
  }
}

export async function createCloudLinkVideo(request: LinkVideoRequest) {
  const owner = await ownerIdentity();
  const admin = adminClient();
  const quota = await admin.rpc("consume_request_limit", {
    p_owner: owner,
    p_key: "create-from-link",
    p_max: 6,
    p_seconds: 3600,
  });
  if (quota.error || !quota.data)
    throw new LinkVideoError(
      429,
      "Your link-to-video limit is reached. Please try again later.",
    );
  if (state.cloudCaptures >= 2)
    throw new LinkVideoError(
      429,
      "Other websites are being prepared. Please try again shortly.",
    );
  state.cloudCaptures++;
  const registered: { id: string; path: string }[] = [];
  let projectId: string | undefined;
  try {
    let captured: WebsiteImport;
    try {
      captured = await captureWebsite(request.url);
    } catch {
      throw new LinkVideoError(
        400,
        "This website could not be opened. Try another public page.",
      );
    }
    const images = await prepareImages(captured);
    const project = generatedProject(captured, request, images);
    for (const image of [
      ...images.captures,
      ...(images.logo ? [images.logo] : []),
    ]) {
      const storagePath = `${owner}/${image.id}.webp`;
      const uploaded = await admin.storage
        .from("inputs")
        .upload(storagePath, image.data, {
          contentType: "image/webp",
          upsert: false,
        });
      if (uploaded.error) throw new Error("Website image upload failed");
      registered.push({ id: image.id, path: storagePath });
      const inserted = await admin.from("assets").insert({
        id: image.id,
        owner_id: owner,
        path: storagePath,
        width: image.width,
        height: image.height,
        kind: "image",
        duration: null,
      });
      if (inserted.error) throw new Error("Website image registration failed");
    }
    const saved = await admin
      .from("projects")
      .insert({
        owner_id: owner,
        name: project.name,
        settings: project,
        before_asset: project.before,
        after_asset: project.after,
        logo_asset: project.logo,
      })
      .select("id")
      .single();
    if (saved.error || !saved.data)
      throw new Error("Website project could not be saved");
    projectId = saved.data.id;
    const queued = await admin.rpc("enqueue_output_with_result", {
      p_owner: owner,
      p_project: projectId,
      p_settings: project,
      p_daily_cap: Number(process.env.DAILY_EXPORT_CAP || 10),
      p_kind: "video",
    });
    if (queued.error)
      throw new LinkVideoError(
        queued.error.message.includes("Daily") ? 429 : 503,
        queued.error.message.includes("Daily")
          ? "Your draft was saved. The daily export limit is reached; open it in the editor and export tomorrow."
          : "Your draft was saved, but its video could not be queued. Open it in the editor to retry.",
        projectId,
      );
    const job = z.object({ id: z.uuid() }).safeParse(queued.data);
    if (!job.success)
      throw new LinkVideoError(
        503,
        "Your draft was saved. Open it in the editor to check its video export.",
        projectId,
      );
    return {
      id: job.data.id,
      projectId,
      mode: "cloud" as const,
      status: "queued" as const,
      progress: 0,
    };
  } catch (error) {
    // A saved project may have an export even if its queue response was lost.
    // Keep that snapshot and its inputs; only discard assets with no project.
    if (!projectId && registered.length) {
      await admin
        .from("assets")
        .delete()
        .eq("owner_id", owner)
        .in(
          "id",
          registered.map((image) => image.id),
        );
      await admin.storage
        .from("inputs")
        .remove(registered.map((image) => image.path));
    }
    throw error;
  } finally {
    state.cloudCaptures--;
  }
}

async function cloudJob(id: string) {
  if (!z.uuid().safeParse(id).success)
    throw new LinkVideoError(404, "Video not found.");
  const owner = await ownerIdentity();
  const admin = adminClient();
  const result = await admin
    .from("render_jobs")
    .select(
      "id,owner_id,project_id,status,progress,error,output_path,output_kind",
    )
    .eq("id", id)
    .eq("owner_id", owner)
    .maybeSingle();
  if (result.error)
    throw new LinkVideoError(
      503,
      "The video status is temporarily unavailable.",
    );
  if (!result.data || result.data.output_kind !== "video")
    throw new LinkVideoError(404, "Video not found.");
  return { admin, owner, job: result.data };
}

export async function linkVideoStatus(req: NextRequest, id: string) {
  if (cloudConfigured()) {
    const { owner, job } = await cloudJob(id);
    const result = {
      id,
      mode: "cloud" as const,
      status: job.status,
      progress: Math.max(0, Math.min(1, Number(job.progress) || 0)),
      projectId: job.project_id as string,
      ...(job.status === "failed"
        ? {
            error:
              "The video could not finish. Open its project to retry the export.",
          }
        : {}),
    };
    if (job.status !== "completed") return result;
    if (!job.output_path || !safeStoragePath(owner, job.output_path))
      throw new LinkVideoError(
        410,
        "This video has expired. Open its project to create another export.",
        job.project_id,
      );
    return {
      ...result,
      progress: 1,
      videoUrl: `/api/create-from-link/${id}/download?inline=1`,
      downloadUrl: `/api/create-from-link/${id}/download`,
    };
  }
  localLinkVideoAllowed(req);
  const job = await state.jobs.get(id);
  if (!job)
    throw new LinkVideoError(
      410,
      "This local video has expired or the preview restarted. Create it again from your link.",
    );
  return {
    id,
    mode: "local" as const,
    status: job.status,
    progress: job.progress,
    ...(job.error ? { error: job.error } : {}),
    ...(job.status === "completed"
      ? {
          videoUrl: `/api/create-from-link/${id}/download?inline=1`,
          downloadUrl: `/api/create-from-link/${id}/download`,
          expiresAt: new Date(job.expiresAt).toISOString(),
        }
      : {}),
  };
}

export async function downloadLinkVideo(req: NextRequest, id: string) {
  if (cloudConfigured()) {
    const { admin, owner, job } = await cloudJob(id);
    if (job.status !== "completed")
      throw new LinkVideoError(409, "The video is still being created.");
    if (!job.output_path || !safeStoragePath(owner, job.output_path))
      throw new LinkVideoError(
        410,
        "This video has expired. Open its project to create another export.",
        job.project_id,
      );
    const signed = await admin.storage
      .from("exports")
      .createSignedUrl(
        job.output_path,
        300,
        req.nextUrl.searchParams.get("inline") === "1"
          ? undefined
          : { download: "demopop-link-video.mp4" },
      );
    if (signed.error || !signed.data)
      throw new LinkVideoError(503, "The video is temporarily unavailable.");
    return NextResponse.redirect(signed.data.signedUrl, {
      headers: {
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  }
  localLinkVideoAllowed(req);
  const job = await state.jobs.get(id);
  if (!job)
    throw new LinkVideoError(
      410,
      "This local video has expired or the preview restarted. Create it again from your link.",
    );
  if (job.status !== "completed" || !job.output)
    throw new LinkVideoError(409, "The video is not ready to download.");
  let size: number;
  try {
    size = (await stat(job.output)).size;
  } catch {
    throw new LinkVideoError(
      410,
      "This local video is no longer available. Create it again from your link.",
    );
  }
  const range = videoByteRange(req.headers.get("range"), size);
  const headers = new Headers({
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Disposition": `${req.nextUrl.searchParams.get("inline") === "1" ? "inline" : "attachment"}; filename="demopop-link-video.mp4"`,
  });
  if (!range) {
    headers.set("Content-Range", `bytes */${size}`);
    return new NextResponse(null, { status: 416, headers });
  }
  headers.set("Content-Length", String(range.end - range.start + 1));
  if (range.partial)
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
  const body =
    req.method === "HEAD"
      ? null
      : (Readable.toWeb(
          createReadStream(job.output, { start: range.start, end: range.end }),
        ) as ReadableStream<Uint8Array>);
  return new NextResponse(body, { status: range.partial ? 206 : 200, headers });
}
