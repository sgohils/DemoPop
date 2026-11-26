import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminClient, cloudConfigured } from "./supabase";
import { projectSchema } from "../shared/project";
import { safeStoragePath } from "./access";
import { isSameOriginRequest } from "./request-origin";
import { recordFunnel } from "./billing";

export const reviewTokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function publicReview(req: NextRequest, token: string) {
  const unavailable = () =>
    NextResponse.json(
      { error: "This review link is unavailable or has expired." },
      { status: 404 },
    );
  if (!cloudConfigured() || !/^[a-f0-9]{64}$/.test(token)) return unavailable();
  const admin = adminClient();
  try {
    const found = await admin
      .from("review_links")
      .select("*")
      .eq("token_hash", reviewTokenHash(token))
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (found.error || !found.data) return unavailable();
    const review = found.data;
    const rendered = await admin
      .from("render_jobs")
      .select("snapshot,status,output_path,preview_path,output_kind")
      .eq("id", review.job_id)
      .eq("owner_id", review.owner_id)
      .maybeSingle();
    if (
      rendered.error ||
      !rendered.data?.output_path ||
      rendered.data.status !== "completed"
    )
      return unavailable();
    const job = rendered.data,
      project = projectSchema.parse(job.snapshot);
    if (req.method === "POST") {
      if (!isSameOriginRequest(req))
        return NextResponse.json(
          { error: "Request origin is not allowed." },
          { status: 403 },
        );
      const body = z
        .object({
          author: z.string().trim().min(1).max(80),
          body: z.string().trim().max(2000).default(""),
          seconds: z
            .number()
            .finite()
            .min(0)
            .max(project.story?.duration ?? 15),
          approve: z.boolean().default(false),
        })
        .strict()
        .parse(await req.json());
      if (!body.approve && !body.body)
        return NextResponse.json(
          { error: "Write a comment first." },
          { status: 400 },
        );
      const result = await admin.rpc("submit_review_feedback", {
        p_hash: reviewTokenHash(token),
        p_author: body.author,
        p_body: body.body,
        p_seconds: body.seconds,
        p_approve: body.approve,
      });
      if (result.error)
        return NextResponse.json(
          {
            error: result.error.message.includes("Too many")
              ? "Too many comments. Please try again later."
              : "The review could not be updated. Refresh the page and retry.",
          },
          { status: result.error.message.includes("Too many") ? 429 : 409 },
        );
      if (body.approve) await recordFunnel(review.owner_id, "review_approved");
      return NextResponse.json({ ok: true });
    }
    const path =
      job.preview_path ||
      (job.output_kind === "video" ? job.output_path : null);
    if (!path || !safeStoragePath(review.owner_id, path)) return unavailable();
    const signed = await admin.storage
      .from("exports")
      .createSignedUrl(path, 300);
    if (signed.error) return unavailable();
    const comments = await admin
      .from("review_comments")
      .select("id,author,body,seconds,created_at")
      .eq("review_id", review.id)
      .order("created_at")
      .limit(200);
    if (comments.error)
      return NextResponse.json(
        { error: "Comments could not load. Please retry." },
        { status: 503 },
      );
    let downloadUrl: string | null = null;
    if (
      review.allow_download &&
      safeStoragePath(review.owner_id, job.output_path)
    ) {
      const download = await admin.storage
        .from("exports")
        .createSignedUrl(job.output_path, 300, {
          download:
            job.output_kind === "launch-pack"
              ? "launch-package.zip"
              : "launch-video.mp4",
        });
      downloadUrl = download.data?.signedUrl ?? null;
    }
    return NextResponse.json({
      agencyName: review.agency_name,
      name: project.name,
      color: project.color,
      status: review.status,
      approvedBy: review.approved_by,
      approvedAt: review.approved_at,
      expiresAt: review.expires_at,
      duration: project.story?.duration ?? 15,
      playbackUrl: signed.data!.signedUrl,
      downloadUrl,
      outputKind: job.output_kind,
      comments: comments.data,
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: "Check your name, comment and video timestamp." },
        { status: 400 },
      );
    return NextResponse.json(
      { error: "This review could not load. Please retry." },
      { status: 503 },
    );
  }
}
