import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  adminClient,
  cloudConfigured,
  userClient,
} from "../../../server/supabase";
import { isSameOriginRequest } from "../../../server/request-origin";
import { boundedBody } from "../../../server/stripe";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const empty = () =>
    new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "private, no-store" },
    });
  if (!isSameOriginRequest(req)) return new NextResponse(null, { status: 403 });
  if (!cloudConfigured()) return empty();
  try {
    const identity = await (await userClient()).auth.getUser();
    if (identity.error || !identity.data.user) return empty();
    const owner = identity.data.user.id;
    const body = z
      .object({
        event: z.literal("preview_ready"),
        projectId: z.uuid().optional(),
      })
      .strict()
      .parse(JSON.parse(await boundedBody(req, 512)));
    const db = adminClient();
    const limit = await db.rpc("consume_request_limit", {
      p_owner: owner,
      p_key: "preview-metrics",
      p_max: 30,
      p_seconds: 3600,
    });
    if (limit.error || !limit.data) return empty();
    if (body.projectId) {
      const project = await db
        .from("projects")
        .select("id")
        .eq("id", body.projectId)
        .eq("owner_id", owner)
        .maybeSingle();
      if (project.error || !project.data) return empty();
    }
    await db
      .from("funnel_events")
      .insert({
        owner_id: owner,
        event: body.event,
        project_id: body.projectId || null,
      });
  } catch {
    /* Telemetry cannot interrupt editing. */
  }
  return empty();
}
