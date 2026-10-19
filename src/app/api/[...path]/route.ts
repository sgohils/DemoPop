import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import {
  projectSchema,
  MAX_UPLOAD,
  sampleAsset,
  type Media,
  type ProjectInput,
  brandKitSchema,
  projectAssetIds,
} from "../../../shared/project";
import {
  adminClient,
  cloudConfigured,
  userClient,
} from "../../../server/supabase";
import { normalizeImage } from "../../../server/images";
import { prepareClip } from "../../../server/clips";
import { publicReview, reviewTokenHash } from "../../../server/review-api";
import { owned, safeStoragePath } from "../../../server/access";
import {
  isSameOriginRequest,
  requestOrigin,
} from "../../../server/request-origin";
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
    const segments = (await params).path;
    const [kind, id, action] = segments;
    if (
      kind === "reviews" &&
      id &&
      !action &&
      ["GET", "POST"].includes(req.method)
    )
      return publicReview(req, id);
    if (!cloudConfigured())
      throw new HttpError(
        503,
        "Cloud features are unavailable until Supabase is configured. You can edit and preview locally.",
      );
    if (req.method !== "GET" && !isSameOriginRequest(req))
      throw new HttpError(403, "Request origin is not allowed.");
    const supabase = await userClient();
    if (kind === "auth" && req.method === "POST") {
      if (id === "recover") {
        const body = z
          .object({ email: z.email().max(254) })
          .strict()
          .parse(await req.json());
        const result = await supabase.auth.resetPasswordForEmail(body.email, {
          redirectTo: `${requestOrigin(req)}/auth/confirm?next=/auth/reset`,
        });
        if (result.error)
          throw new HttpError(
            result.error.status === 429 ? 429 : 503,
            "A recovery email could not be requested right now. Please try again later.",
          );
        return NextResponse.json({
          message:
            "If an account exists for that email, a recovery link will arrive shortly.",
        });
      }
      if (id === "password") {
        const body = z
          .object({ password: z.string().min(8).max(128) })
          .strict()
          .parse(await req.json());
        const identity = await supabase.auth.getUser();
        if (identity.error || !identity.data.user)
          throw new HttpError(
            401,
            "Open a valid recovery link before changing your password.",
          );
        const result = await supabase.auth.updateUser(body);
        if (result.error)
          throw new HttpError(
            400,
            "The password could not be updated. Use a fresh recovery link and try again.",
          );
        return NextResponse.json({ ok: true });
      }
      if (id === "logout") {
        const { error } = await supabase.auth.signOut();
        check(error);
        return NextResponse.json({ ok: true });
      }
      const body = z
        .object({
          email: z.email().max(254),
          password: z.string().min(8).max(128),
          next: z.literal("/create").optional(),
        })
        .strict()
        .parse(await req.json());
      const result =
        id === "signup"
          ? await supabase.auth.signUp({
              email: body.email,
              password: body.password,
              options: {
                emailRedirectTo: `${requestOrigin(req)}/auth/confirm${body.next === "/create" ? "?next=%2Fcreate" : ""}`,
              },
            })
          : id === "login"
            ? await supabase.auth.signInWithPassword({
                email: body.email,
                password: body.password,
              })
            : null;
      if (!result) throw new HttpError(404, "Not found.");
      if (result.error) throw new HttpError(400, result.error.message);
      const response = NextResponse.json({
        signedIn: Boolean(result.data.session),
        userId: result.data.session ? result.data.user?.id : undefined,
        message: result.data.session
          ? "Signed in."
          : "Check your email to confirm your account, then sign in.",
      });
      if (id === "signup" && !result.data.session && body.next === "/create")
        response.cookies.set("demopop-auth-next", "/create", {
          httpOnly: true,
          sameSite: "lax",
          secure: req.nextUrl.protocol === "https:",
          path: "/auth/confirm",
          maxAge: 3600,
        });
      return response;
    }
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) throw new HttpError(401, "Sign in to continue.");
    if (kind === "session" && !id && req.method === "GET")
      return NextResponse.json({ signedIn: true, userId: user.id });
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
      for (const assetId of projectAssetIds(p)) {
        if (sampleAsset(assetId)) continue;
        const { data, error } = await supabase
          .from("assets")
          .select("*")
          .eq("id", uuid(assetId))
          .maybeSingle();
        check(error);
        owned(data, owner);
        if (
          [p.before, p.after, p.logo].includes(assetId) &&
          data?.kind === "video"
        )
          throw new HttpError(
            400,
            "Use still images for the main screenshots and logo. Add video clips to story scenes.",
          );
      }
    }
    async function resolveAsset(assetId: string): Promise<Media> {
      const sample = sampleAsset(assetId);
      if (sample) return sample;
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
        ...(asset.kind === "video"
          ? { kind: "video" as const, duration: asset.duration }
          : {}),
      };
    }
    if (kind === "recipes") {
      if (!id && req.method === "GET") {
        const result = await supabase
          .from("launch_recipes")
          .select("id,name,settings,updated_at")
          .order("updated_at", { ascending: false })
          .limit(100);
        check(result.error);
        return NextResponse.json({ recipes: result.data || [] });
      }
      if (id) {
        const found = await supabase
          .from("launch_recipes")
          .select("*")
          .eq("id", uuid(id))
          .maybeSingle();
        check(found.error);
        owned(found.data, owner);
        if (req.method === "DELETE") {
          await limit("recipe", 30);
          check(
            (
              await admin
                .from("launch_recipes")
                .delete()
                .eq("id", id)
                .eq("owner_id", owner)
            ).error,
          );
          return NextResponse.json({ ok: true });
        }
      }
      if ((!id && req.method === "POST") || (id && req.method === "PUT")) {
        await limit("recipe", 30);
        const body = z
          .object({
            name: z.string().trim().min(1).max(60),
            project: projectSchema,
          })
          .strict()
          .parse(await req.json());
        await validateAssets(body.project);
        const record = {
          owner_id: owner,
          name: body.name,
          settings: body.project,
        };
        const result = id
          ? await admin
              .from("launch_recipes")
              .update(record)
              .eq("id", id)
              .eq("owner_id", owner)
              .select("id")
              .single()
          : await admin
              .from("launch_recipes")
              .insert(record)
              .select("id")
              .single();
        check(result.error);
        return NextResponse.json(result.data);
      }
    }
    if (kind === "reviews" && id && req.method === "DELETE") {
      const found = await supabase
        .from("review_links")
        .select("owner_id")
        .eq("id", uuid(id))
        .maybeSingle();
      check(found.error);
      owned(found.data, owner);
      await limit("review-manage", 60);
      check(
        (
          await admin
            .from("review_links")
            .update({ revoked_at: new Date().toISOString() })
            .eq("id", id)
            .eq("owner_id", owner)
        ).error,
      );
      return NextResponse.json({ ok: true });
    }
    if (kind === "brand-kits") {
      if (!id && req.method === "GET") {
        const result = await supabase
          .from("brand_kits")
          .select("id,settings,updated_at")
          .order("updated_at", { ascending: false });
        check(result.error);
        return NextResponse.json({
          kits: (result.data || []).map((kit) => ({
            id: kit.id,
            ...brandKitSchema.parse(kit.settings),
            updated_at: kit.updated_at,
          })),
        });
      }
      if (id) {
        const found = await supabase
          .from("brand_kits")
          .select("*")
          .eq("id", uuid(id))
          .maybeSingle();
        check(found.error);
        owned(found.data, owner);
        if (req.method === "DELETE") {
          await limit("brand-kit", 30);
          check(
            (
              await admin
                .from("brand_kits")
                .delete()
                .eq("id", id)
                .eq("owner_id", owner)
            ).error,
          );
          return NextResponse.json({ ok: true });
        }
      }
      if ((!id && req.method === "POST") || (id && req.method === "PUT")) {
        await limit("brand-kit", 30);
        const kit = brandKitSchema.parse(await req.json());
        if (kit.logo) await resolveAsset(kit.logo);
        const record = {
          owner_id: owner,
          name: kit.name,
          settings: kit,
          logo_asset: kit.logo,
        };
        const result = id
          ? await admin
              .from("brand_kits")
              .update(record)
              .eq("id", id)
              .eq("owner_id", owner)
              .select("id")
              .single()
          : await admin.from("brand_kits").insert(record).select("id").single();
        check(result.error);
        return NextResponse.json({ id: result.data!.id });
      }
    }
    if (kind === "projects") {
      if (!id && req.method === "GET") {
        let query = supabase
          .from("projects")
          .select("id,name,updated_at,deleted_at,settings")
          .order("updated_at", { ascending: false })
          .limit(200);
        query =
          req.nextUrl.searchParams.get("trash") === "1"
            ? query.not("deleted_at", "is", null)
            : query.is("deleted_at", null);
        const { data, error } = await query;
        check(error);
        return NextResponse.json({
          projects: (data || []).map((p) => ({
            id: p.id,
            name: p.name,
            updated_at: p.updated_at,
            deleted_at: p.deleted_at,
            template: projectSchema.parse(p.settings).template,
            format: projectSchema.parse(p.settings).format,
            client: projectSchema.parse(p.settings).client || "",
            duration: projectSchema.parse(p.settings).story?.duration ?? 15,
          })),
        });
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
      if (
        req.method === "POST" &&
        ["duplicate", "trash", "restore"].includes(action)
      ) {
        await limit(
          action === "duplicate" ? "create" : "manage-project",
          action === "duplicate" ? 20 : 60,
        );
        const result = await admin.rpc("manage_project", {
          p_owner: owner,
          p_project: projectId,
          p_action: action,
        });
        if (result.error?.message.includes("Active export"))
          throw new HttpError(
            409,
            "Wait for the active export to finish before moving this project to trash.",
          );
        if (result.error?.message.includes("Not found"))
          throw new HttpError(404, "Not found.");
        check(result.error);
        return NextResponse.json({ id: result.data });
      }
      if (project.deleted_at)
        throw new HttpError(
          404,
          "This project is in the trash. Restore it from Projects.",
        );
      if (action === "reviews") {
        if (req.method === "GET") {
          const result = await supabase
            .from("review_links")
            .select(
              "id,token,agency_name,status,approved_by,approved_at,expires_at,revoked_at,created_at,job_id,allow_download,review_comments(id,author,body,seconds,created_at),render_jobs!inner(project_id)",
            )
            .eq("owner_id", owner)
            .eq("render_jobs.project_id", projectId)
            .order("created_at", { ascending: false })
            .limit(100);
          check(result.error);
          return NextResponse.json({
            reviews: (result.data || []).map((review) => ({
              ...review,
              url: `${requestOrigin(req)}/review/${review.token}`,
              token: undefined,
              render_jobs: undefined,
            })),
          });
        }
        if (req.method === "POST") {
          await limit("review-manage", 30);
          const body = z
            .object({
              jobId: z.uuid(),
              agencyName: z.string().trim().min(1).max(60),
              allowDownload: z.boolean().default(false),
            })
            .strict()
            .parse(await req.json());
          const job = await supabase
            .from("render_jobs")
            .select("id,status,output_path")
            .eq("id", body.jobId)
            .eq("project_id", projectId)
            .eq("owner_id", owner)
            .maybeSingle();
          check(job.error);
          if (!job.data?.output_path || job.data.status !== "completed")
            throw new HttpError(
              409,
              "Choose a completed, available export first.",
            );
          const token = randomBytes(32).toString("hex");
          const result = await admin
            .from("review_links")
            .insert({
              owner_id: owner,
              job_id: body.jobId,
              token,
              token_hash: reviewTokenHash(token),
              agency_name: body.agencyName,
              allow_download: body.allowDownload,
            })
            .select("id")
            .single();
          check(result.error);
          return NextResponse.json({
            id: result.data!.id,
            url: `${requestOrigin(req)}/review/${token}`,
          });
        }
      }
      if (action === "exports" && req.method === "GET") {
        const offset = z.coerce
          .number()
          .int()
          .min(0)
          .max(10000)
          .parse(req.nextUrl.searchParams.get("offset") || 0);
        const result = await supabase
          .from("render_jobs")
          .select(
            "id,status,progress,attempt_count,error,created_at,snapshot,output_expired_at,output_kind",
          )
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(offset, offset + 20);
        check(result.error);
        const jobs = (result.data || []).slice(0, 20).map((job) => {
          const snapshot = projectSchema.parse(job.snapshot);
          return {
            ...job,
            snapshot: undefined,
            format: snapshot.format,
            template: snapshot.template,
            duration: snapshot.story?.duration ?? 15,
          };
        });
        return NextResponse.json({
          jobs,
          hasMore: (result.data?.length || 0) > 20,
        });
      }
      if (req.method === "GET") {
        const p = projectSchema.parse(project.settings);
        const latest = await supabase
          .from("render_jobs")
          .select(
            "id,status,progress,attempt_count,error,snapshot,output_expired_at,output_kind",
          )
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        check(latest.error);
        return NextResponse.json({
          project: p,
          job: latest.data
            ? {
                ...latest.data,
                snapshot: undefined,
                format: projectSchema.parse(latest.data.snapshot).format,
                template: projectSchema.parse(latest.data.snapshot).template,
                duration:
                  projectSchema.parse(latest.data.snapshot).story?.duration ??
                  15,
              }
            : null,
          media: {
            before: await resolveAsset(p.before),
            after: await resolveAsset(p.after),
            logo: p.logo ? await resolveAsset(p.logo) : null,
            sceneMedia: Object.fromEntries(
              await Promise.all(
                (p.story?.scenes ?? []).map(
                  async (scene) =>
                    [scene.asset, await resolveAsset(scene.asset)] as const,
                ),
              ),
            ),
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
          const bytes = Buffer.concat(chunks);
          image =
            bytes.toString("ascii", 4, 8) === "ftyp"
              ? await prepareClip(bytes)
              : await normalizeImage(bytes);
        } catch (e) {
          throw new HttpError(400, (e as Error).message);
        }
        const assetId = crypto.randomUUID(),
          path = `${owner}/${assetId}.${"kind" in image ? "mp4" : "webp"}`;
        const uploaded = await admin.storage
          .from("inputs")
          .upload(path, image.data, {
            contentType: "kind" in image ? "video/mp4" : "image/webp",
            upsert: false,
          });
        check(uploaded.error);
        const inserted = await admin.from("assets").insert({
          id: assetId,
          owner_id: owner,
          path,
          width: image.width,
          height: image.height,
          kind: "kind" in image ? "video" : "image",
          duration: "duration" in image ? image.duration : null,
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
        .object({
          projectId: z.uuid(),
          project: projectSchema,
          outputKind: z.enum(["video", "launch-pack"]).default("video"),
        })
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
      const result = await admin.rpc("enqueue_output_with_result", {
        p_owner: owner,
        p_project: body.projectId,
        p_settings: body.project,
        p_daily_cap: Number(process.env.DAILY_EXPORT_CAP || 10),
        p_kind: body.outputKind,
      });
      if (result.error) {
        if (result.error.message.includes("Daily"))
          throw new HttpError(
            429,
            "Daily export limit reached. Please try again tomorrow.",
          );
        check(result.error);
      }
      const queued = z
        .object({
          id: z.uuid(),
          reused: z.boolean(),
          outputKind: z.enum(["video", "launch-pack"]),
        })
        .safeParse(result.data);
      if (!queued.success)
        throw new HttpError(
          500,
          "The export could not be confirmed. Please retry.",
        );
      return NextResponse.json(queued.data);
    }
    if (kind === "jobs" && id) {
      const jobId = uuid(id);
      const result = await supabase
        .from("render_jobs")
        .select(
          "id,owner_id,project_id,status,progress,attempt_count,error,created_at,snapshot,output_expired_at,output_kind",
        )
        .eq("id", jobId)
        .maybeSingle();
      check(result.error);
      const row = owned(result.data, owner);
      const snapshot = projectSchema.parse(row.snapshot);
      const job = {
        ...row,
        snapshot: undefined,
        format: snapshot.format,
        template: snapshot.template,
        duration: snapshot.story?.duration ?? 15,
      };
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
        if (!path)
          throw new HttpError(
            410,
            "This export has expired. Create a new export from the project.",
          );
        if (!safeStoragePath(owner, path))
          throw new HttpError(404, "Not found.");
        const signed = await admin.storage
          .from("exports")
          .createSignedUrl(path, 60, {
            download:
              row.output_kind === "launch-pack"
                ? "demopop-launch-package.zip"
                : "demopop-redesign.mp4",
          });
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
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
export { route as GET, route as POST, route as PUT, route as DELETE };
