import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { captureWebsite } from "../../../server/website-import";
import { isSameOriginRequest } from "../../../server/request-origin";
import {
  adminClient,
  cloudConfigured,
  userClient,
} from "../../../server/supabase";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
let localRequestAt = 0;
let capturing = false;
export async function POST(req: NextRequest) {
  const json = (body: unknown, status = 200) =>
    NextResponse.json(body, {
      status,
      headers: { "Cache-Control": "private, no-store" },
    });
  if (!isSameOriginRequest(req))
    return json({ error: "Request origin is not allowed." }, 403);
  try {
    if (Number(req.headers.get("content-length")) > 4096)
      return json({ error: "Enter a shorter URL." }, 413);
    const body = z
      .object({ url: z.url().max(2048) })
      .strict()
      .parse(await req.json());
    if (cloudConfigured()) {
      const identity = await (await userClient()).auth.getUser();
      if (identity.error || !identity.data.user)
        return json({ error: "Sign in to import a website." }, 401);
      const quota = await adminClient().rpc("consume_request_limit", {
        p_owner: identity.data.user.id,
        p_key: "website-import",
        p_max: 6,
        p_seconds: 3600,
      });
      if (quota.error || !quota.data)
        return json(
          { error: "Website import limit reached. Please try again later." },
          429,
        );
    } else {
      if (
        process.env.NODE_ENV === "production" &&
        process.env.DEMOPOP_LOCAL_PREVIEW !== "1"
      )
        return json(
          { error: "Connect the account service to enable website import." },
          503,
        );
      if (!["localhost", "127.0.0.1", "[::1]"].includes(req.nextUrl.hostname))
        return json(
          { error: "Configure your account service to enable website import." },
          503,
        );
      if (Date.now() - localRequestAt < 15000)
        return json(
          { error: "Wait a few seconds before importing another website." },
          429,
        );
      localRequestAt = Date.now();
    }
    if (capturing)
      return json(
        { error: "Another website is being captured. Try again shortly." },
        429,
      );
    capturing = true;
    try {
      return json(await captureWebsite(body.url));
    } finally {
      capturing = false;
    }
  } catch (error) {
    return json(
      {
        error:
          error instanceof z.ZodError
            ? "Enter a valid website URL."
            : (error as Error).message,
      },
      400,
    );
  }
}
