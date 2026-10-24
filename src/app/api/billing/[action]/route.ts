import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  adminClient,
  cloudConfigured,
  userClient,
} from "../../../../server/supabase";
import { isSameOriginRequest } from "../../../../server/request-origin";
import {
  billingSummary,
  checkout,
  fulfillCheckout,
  portal,
  requireBilling,
} from "../../../../server/billing";
import { BillingError, boundedBody } from "../../../../server/stripe";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(
  req: NextRequest,
  ctx: { params: Promise<{ action: string }> },
) {
  try {
    const { action } = await ctx.params;
    if (req.method !== "GET" && !isSameOriginRequest(req))
      throw new BillingError(403, "Request origin is not allowed.");
    const identity = cloudConfigured()
      ? await (await userClient()).auth.getUser()
      : null;
    const user = identity?.error ? null : identity?.data.user;
    if (req.method === "GET" && action === "status")
      return NextResponse.json(await billingSummary(user?.id));
    if (!user) throw new BillingError(401, "Sign in to choose your plan.");
    requireBilling();
    if (req.method === "POST" && action === "checkout") {
      const body = z
        .object({
          offer: z.enum(["package", "studio"]),
          projectId: z.uuid().optional(),
        })
        .strict()
        .parse(JSON.parse(await boundedBody(req, 2048)));
      return NextResponse.json(
        await checkout(user.id, user.email, body.offer, body.projectId),
      );
    }
    if (req.method === "POST" && action === "portal")
      return NextResponse.json(await portal(user.id));
    if (req.method === "POST" && action === "confirm") {
      const limited = await adminClient().rpc("consume_request_limit", {
        p_owner: user.id,
        p_key: "billing-confirm",
        p_max: 30,
        p_seconds: 3600,
      });
      if (limited.error || !limited.data)
        throw new BillingError(
          429,
          "Please wait a moment before refreshing your purchase.",
        );
      const body = z
        .object({
          sessionId: z
            .string()
            .regex(/^cs_[a-zA-Z0-9_]+$/)
            .max(256),
        })
        .strict()
        .parse(JSON.parse(await boundedBody(req, 2048)));
      return NextResponse.json(
        await fulfillCheckout(
          body.sessionId,
          `confirm:${body.sessionId}`,
          user.id,
        ),
      );
    }
    throw new BillingError(404, "Not found.");
  } catch (error) {
    if (error instanceof BillingError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return NextResponse.json(
        { error: "This billing request could not be read. Please retry." },
        { status: 400 },
      );
    console.error("Billing request failed");
    return NextResponse.json(
      { error: "Billing is temporarily unavailable. Please retry shortly." },
      { status: 503 },
    );
  }
}
async function route(
  req: NextRequest,
  ctx: { params: Promise<{ action: string }> },
) {
  const response = await handle(req, ctx);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
export { route as GET, route as POST };
