import { NextRequest } from "next/server";
import {
  downloadLinkVideo,
  linkVideoFailure,
} from "../../../../../server/link-video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    return await downloadLinkVideo(req, (await context.params).id);
  } catch (error) {
    return linkVideoFailure(error);
  }
}

export const HEAD = GET;
