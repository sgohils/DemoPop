import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  projectSchema,
  MAX_UPLOAD,
  sampleMedia,
  type Media,
  type ProjectInput,
} from "../../../shared/project";
import {
  adminClient,
  cloudConfigured,
  userClient,
} from "../../../server/supabase";
import { normalizeImage } from "../../../server/images";
import { owned, safeStoragePath } from "../../../server/access";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const check = (error: { message: string } | null) => {
  if (error) {
    console.error("Database operation:", error.message);
    throw new HttpError(
      500,
      "The operation could not finish. Your edits are still here. Please retry.",
    );
  }
};
const uuid = (v: unknown) => z.uuid().parse(v);
async function handle(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    if (!cloudConfigured())
      throw new HttpError(
        503,
        "Cloud features are unavailable until Supabase is configured. You can edit and preview locally.",
      );
    if (
      req.method !== "GET" &&
      req.headers.get("origin") !== req.nextUrl.origin
    )
      throw new HttpError(403, "Request origin is not allowed.");
    const segments = (await params).path;
    const [kind, id, action] = segments;
    const supabase = await userClient();
    if (kind === "auth" && req.method === "POST") {
      if (id === "logout") {
        const { error } = await supabase.auth.signOut();
        check(error);
        return NextResponse.json({ ok: true });
      }
      const body = z
        .object({
          email: z.email().max(254),
          password: z.string().min(8).max(128),
        })
        .strict()
        .parse(await req.json());
      const result =
        id === "signup"
          ? await supabase.auth.signUp({
              ...body,
              options: {
                emailRedirectTo: `${req.nextUrl.origin}/auth/confirm`,
              },
            })
          : id === "login"
            ? await supabase.auth.signInWithPassword(body)
            : null;
      if (!result) throw new HttpError(404, "Not found.");
      if (result.error) throw new HttpError(400, result.error.message);
      return NextResponse.json({
        signedIn: Boolean(result.data.session),
        message: result.data.session
          ? "Signed in."
          : "Check your email to confirm your account, then sign in.",
      });
    }
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) throw new HttpError(401, "Sign in to continue.");
    const owner = user.id;
    const admin = adminClient();
    async function limit(key: string, max: number, seconds = 3600) {
      const { data, error } = await admin.rpc("consume_request_limit", {
        p_owner: owner,
        p_key: key,
        p_max: max,
        p_seconds: seconds,
      });
      check(error);
      if (!data)
        throw new HttpError(429, "Too many requests. Please try again later.");
    }
    async function validateAssets(p: ProjectInput) {
      for (const assetId of [p.before, p.after, p.logo].filter(
        Boolean,
      ) as string[]) {
        if (assetId.startsWith("sample-")) continue;
        const { data, error } = await supabase
          .from("assets")
          .select("*")
          .eq("id", uuid(assetId))
          .maybeSingle();
        check(error);
        owned(data, owner);
      }
    }
    async function resolveAsset(assetId: string): Promise<Media> {
      const sample = sampleMedia();
      if (assetId === "sample-before") return sample.before;
      if (assetId === "sample-after") return sample.after;
      const { data, error } = await supabase
        .from("assets")
        .select("*")
        .eq("id", uuid(assetId))
        .maybeSingle();
      check(error);
      const asset = owned(data, owner);
      if (!safeStoragePath(owner, asset.path))
        throw new HttpError(404, "Not found.");
      const signed = await admin.storage
        .from("inputs")
        .createSignedUrl(asset.path, 3600);
      check(signed.error);
      return {
        src: signed.data!.signedUrl,
        width: asset.width,
        height: asset.height,
      };
    }
    if (kind === "projects") {
      if (!id && req.method === "GET") {
        const { data, error } = await supabase
          .from("projects")
          .select("id,name,updated_at")
          .order("updated_at", { ascending: false });
        check(error);
        return NextResponse.json({ projects: data });
      }
      if (!id && req.method === "POST") {
        await limit("create", 20);
        const p = projectSchema.parse(await req.json());
        await validateAssets(p);
        const { data, error } = await supabase
          .from("projects")
          .insert({
            owner_id: owner,
            name: p.name,
            settings: p,
            before_asset: p.before,
            after_asset: p.after,
            logo_asset: p.logo,
          })
          .select("id")
          .single();
        check(error);
        return NextResponse.json(data);
      }
      const projectId = uuid(id);
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .maybeSingle();
      check(error);
      const project = owned(data, owner);
      if (req.method === "GET") {
        const p = projectSchema.parse(project.settings);
        const latest = await supabase
          .from("render_jobs")
          .select("id,status,progress,attempt_count,error")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        check(latest.error);
        return NextResponse.json({
          project: p,
          job: latest.data,
          media: {
            before: await resolveAsset(p.before),
            after: await resolveAsset(p.after),
            logo: p.logo ? await resolveAsset(p.logo) : null,
          },
        });
      }
      if (req.method === "PUT") {
        await limit("save", 180);
        const p = projectSchema.parse(await req.json());
        await validateAssets(p);
        const result = await supabase
          .from("projects")
          .update({
            name: p.name,
            settings: p,
            before_asset: p.before,
            after_asset: p.after,
            logo_asset: p.logo,
          })
          .eq("id", projectId);
        check(result.error);
        return NextResponse.json({ ok: true });
      }
    }
    if (kind === "assets") {
      if (req.method === "GET" && id) {
        return NextResponse.json(await resolveAsset(id));
      }
      if (req.method === "POST") {
        await limit("upload", 30);
        if (Number(req.headers.get("content-length") || 0) > MAX_UPLOAD + 65536)
          throw new HttpError(413, "Choose an image smaller than 10 MB.");
        const reader = req.body?.getReader();
        if (!reader) throw new HttpError(400, "Choose an image.");
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_UPLOAD) {
            await reader.cancel();
            throw new HttpError(413, "Choose an image smaller than 10 MB.");
          }
          chunks.push(value);
        }
        let image;
        try {
          image = await normalizeImage(Buffer.concat(chunks));
        } catch (e) {
          throw new HttpError(400, (e as Error).message);
        }
        const assetId = crypto.randomUUID(),
          path = `${owner}/${assetId}.webp`;
        const uploaded = await admin.storage
          .from("inputs")
          .upload(path, image.data, {
            contentType: "image/webp",
            upsert: false,
          });
        check(uploaded.error);
        const inserted = await admin.from("assets").insert({
          id: assetId,
          owner_id: owner,
          path,
          width: image.width,
          height: image.height,
        });
        if (inserted.error) {
          await admin.storage.from("inputs").remove([path]);
          check(inserted.error);
        }
        return NextResponse.json({
          id: assetId,
          media: await resolveAsset(assetId),
        });
      }
    }
    if (kind === "exports" && req.method === "POST") {
      await limit("export", 30);
      const body = z
        .object({ projectId: z.uuid(), project: projectSchema })
        .strict()
        .parse(await req.json());
      await validateAssets(body.project);
      const row = await supabase
        .from("projects")
        .select("owner_id")
        .eq("id", body.projectId)
        .maybeSingle();
      check(row.error);
      owned(row.data, owner);
      const result = await admin.rpc("enqueue_render", {
        p_owner: owner,
        p_project: body.projectId,
        p_settings: body.project,
        p_daily_cap: Number(process.env.DAILY_EXPORT_CAP || 10),
      });
      if (result.error) {
        if (result.error.message.includes("Daily"))
          throw new HttpError(
            429,
            "Daily export limit reached. Please try again tomorrow.",
          );
        check(result.error);
      }
      return NextResponse.json({ id: result.data });
    }
    if (kind === "jobs" && id) {
      const jobId = uuid(id);
      const result = await supabase
        .from("render_jobs")
        .select(
          "id,owner_id,project_id,status,progress,attempt_count,error,created_at",
        )
        .eq("id", jobId)
        .maybeSingle();
      check(result.error);
      const job = owned(result.data, owner);
      if (action === "retry" && req.method === "POST") {
        await limit("retry", 10);
        const retried = await admin.rpc("retry_render", {
          p_owner: owner,
          p_job: jobId,
          p_daily_cap: Number(process.env.DAILY_EXPORT_CAP || 10),
        });
        if (retried.error)
          throw new HttpError(
            409,
            "This export cannot be retried: it is active, has reached three attempts, or the daily limit was reached.",
          );
        return NextResponse.json({ id: retried.data });
      }
      if (action === "download" && req.method === "GET") {
        if (job.status !== "completed")
          throw new HttpError(409, "The video is not ready yet.");
        const output = await supabase
          .from("render_jobs")
          .select("output_path")
          .eq("id", jobId)
          .single();
        check(output.error);
        const path = output.data!.output_path;
        if (!safeStoragePath(owner, path))
          throw new HttpError(404, "Not found.");
        const signed = await admin.storage
          .from("exports")
          .createSignedUrl(path, 60, { download: "demopop-redesign.mp4" });
        check(signed.error);
        return NextResponse.json({ url: signed.data!.signedUrl });
      }
      if (req.method === "GET") return NextResponse.json({ job });
    }
    throw new HttpError(404, "Not found.");
  } catch (e) {
    if (e instanceof z.ZodError)
      return NextResponse.json(
        {
          error: e.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        { status: 400 },
      );
    if (e instanceof HttpError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    if ((e as Error).message === "Not found.")
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    console.error("API request failed:", e);
    return NextResponse.json(
      { error: "The operation could not finish. Please retry." },
      { status: 500 },
    );
  }
}
async function route(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const response = await handle(req, context);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}
export { route as GET, route as POST, route as PUT };
