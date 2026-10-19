import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { makeCancelSignal } from "@remotion/renderer";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import {
  projectSchema,
  SUPPORTED_TEMPLATE_VERSIONS,
  type Media,
  SAMPLE_ASSETS,
  projectAssetIds,
} from "../src/shared/project";
import { safeStoragePath } from "../src/server/access";
import { renderVideo, cleanupBundle } from "./render";
import { renderLaunchPackage } from "./launch-package";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "Worker unavailable: configure Supabase URL and server-only service-role key in .env.",
  );
  process.exit(1);
}
const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let stopping = false;
let cancelCurrent: (() => void) | undefined;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stopping = true;
    cancelCurrent?.();
  });
console.log(
  "DemoPop worker ready. One active render; 90-second leases, 20-second heartbeats.",
);
while (!stopping) {
  const { data, error } = await db.rpc("claim_render");
  if (error) {
    console.error("Queue unavailable:", error.message);
    await new Promise((r) => setTimeout(r, 5000));
    continue;
  }
  const job = data?.[0];
  if (!job) {
    await new Promise((r) => setTimeout(r, 2000));
    continue;
  }
  const temp = await mkdtemp(path.resolve(".render-"));
  let progress = 0;
  let lost = false;
  let heartbeating = false;
  const { cancel, cancelSignal } = makeCancelSignal();
  cancelCurrent = cancel;
  async function heartbeat() {
    if (heartbeating) return;
    heartbeating = true;
    try {
      const result = await db
        .from("render_jobs")
        .update({
          progress: Math.min(0.99, progress),
          lease_until: new Date(Date.now() + 90000).toISOString(),
        })
        .eq("id", job.id)
        .eq("lease_token", job.lease_token)
        .eq("status", "rendering")
        .select("id");
      if (result.error || !result.data?.length) {
        lost = true;
        cancel();
      }
    } finally {
      heartbeating = false;
    }
  }
  const timer = setInterval(
    () =>
      void heartbeat().catch(() => {
        lost = true;
        cancel();
      }),
    20000,
  );
  try {
    if (!SUPPORTED_TEMPLATE_VERSIONS.has(job.template_version))
      throw new Error("Unsupported template version");
    const project = projectSchema.parse(job.snapshot);
    const mediaCache = new Map<string, Media>();
    async function media(id: string): Promise<Media> {
      if (mediaCache.has(id)) return mediaCache.get(id)!;
      if (Object.prototype.hasOwnProperty.call(SAMPLE_ASSETS, id)) {
        const asset = SAMPLE_ASSETS[id as keyof typeof SAMPLE_ASSETS];
        return {
          src: `data:image/png;base64,${(await readFile(`public/${asset.file}`)).toString("base64")}`,
          width: asset.width,
          height: asset.height,
        };
      }
      const asset = await db
        .from("assets")
        .select("*")
        .eq("id", id)
        .eq("owner_id", job.owner_id)
        .single();
      if (
        asset.error ||
        !asset.data ||
        !safeStoragePath(job.owner_id, asset.data.path)
      )
        throw new Error("Asset unavailable");
      const file = await db.storage.from("inputs").download(asset.data.path);
      if (file.error || !file.data) throw new Error("Asset unavailable");
      // Controlled database paths only. Embed private inputs so Chromium cannot fetch arbitrary URLs.
      const bytes = Buffer.from(await file.data.arrayBuffer());
      if (bytes.length > 16 * 1024 * 1024) throw new Error("Input too large");
      const result: Media = {
        src: `data:${asset.data.kind === "video" ? "video/mp4" : "image/webp"};base64,${bytes.toString("base64")}`,
        width: asset.data.width,
        height: asset.data.height,
        ...(asset.data.kind === "video"
          ? { kind: "video", duration: asset.data.duration }
          : {}),
      };
      mediaCache.set(id, result);
      return result;
    }
    const props = {
      project,
      before: await media(project.before),
      after: await media(project.after),
      logo: project.logo ? await media(project.logo) : null,
      sceneMedia: Object.fromEntries(
        await Promise.all(
          projectAssetIds(project).map(
            async (id) => [id, await media(id)] as const,
          ),
        ),
      ),
    };
    let output = path.join(temp, "video.mp4");
    let previewFile: string | null = null;
    if (job.output_kind === "launch-pack") {
      const result = await renderLaunchPackage(
        props,
        temp,
        (p) => {
          progress = p;
        },
        cancelSignal,
      );
      output = result.output;
      previewFile = result.preview;
    } else
      await renderVideo(
        props,
        output,
        (p) => {
          progress = p;
        },
        cancelSignal,
      );
    if (lost || stopping) throw new Error("Lease lost or worker stopping");
    await heartbeat();
    if (lost) throw new Error("Lease lost");
    const outputPath = `${job.owner_id}/${job.id}/${job.lease_token}.${job.output_kind === "launch-pack" ? "zip" : "mp4"}`;
    const previewPath = previewFile
      ? `${job.owner_id}/${job.id}/${job.lease_token}-preview.mp4`
      : null;
    if (previewFile && previewPath) {
      const uploadedPreview = await db.storage
        .from("exports")
        .upload(previewPath, await readFile(previewFile), {
          contentType: "video/mp4",
          upsert: false,
        });
      if (uploadedPreview.error) throw uploadedPreview.error;
    }
    const upload = await db.storage
      .from("exports")
      .upload(outputPath, await readFile(output), {
        contentType:
          job.output_kind === "launch-pack" ? "application/zip" : "video/mp4",
        upsert: false,
      });
    if (upload.error) {
      if (previewPath) await db.storage.from("exports").remove([previewPath]);
      throw upload.error;
    }
    const complete = await db
      .from("render_jobs")
      .update({
        status: "completed",
        progress: 1,
        output_path: outputPath,
        preview_path: previewPath,
        error: null,
        lease_token: null,
        lease_until: null,
      })
      .eq("id", job.id)
      .eq("lease_token", job.lease_token)
      .eq("status", "rendering")
      .select("id");
    if (complete.error || !complete.data?.length) {
      await db.storage
        .from("exports")
        .remove([outputPath, ...(previewPath ? [previewPath] : [])]);
      throw new Error("Completion lost lease");
    }
    console.log(`Completed ${job.id}`);
  } catch (e) {
    console.error(`Render ${job.id} failed:`, e);
    if (!lost)
      await db
        .from("render_jobs")
        .update({
          status: "failed",
          error: stopping
            ? "The worker stopped. Retry this export."
            : e instanceof Error &&
                /^The launch package (is too large|exceeds 100 MB)\./.test(
                  e.message,
                )
              ? "This launch package is too large. Choose a shorter story or simpler media, then create a new export."
              : "Rendering could not finish. Retry this export; if it keeps failing, check the media.",
          lease_token: null,
          lease_until: null,
        })
        .eq("id", job.id)
        .eq("lease_token", job.lease_token);
  } finally {
    clearInterval(timer);
    cancelCurrent = undefined;
    const target = path.resolve(temp);
    if (!target.startsWith(path.resolve(".render-")))
      throw new Error("Unexpected render cleanup path");
    await rm(target, { recursive: true, force: true });
  }
}
await cleanupBundle();
