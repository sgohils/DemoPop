import { NextRequest } from "next/server";
import {
  linkVideoFailure,
  linkVideoJson,
  linkVideoStatus,
} from "../../../../server/link-video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    return linkVideoJson(await linkVideoStatus(req, (await context.params).id));
  } catch (error) {
    return linkVideoFailure(error);
  }
}
