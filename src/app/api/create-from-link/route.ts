import { after, NextRequest } from "next/server";
import { isSameOriginRequest } from "../../../server/request-origin";
import { cloudConfigured } from "../../../server/supabase";
import {
  createCloudLinkVideo,
  linkVideoFailure,
  linkVideoJson,
  readLinkVideoRequest,
  reserveLocalLinkVideo,
  runLocalLinkVideo,
} from "../../../server/link-video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req))
    return linkVideoJson({ error: "Request origin is not allowed." }, 403);
  try {
    const request = await readLinkVideoRequest(req);
    if (cloudConfigured())
      return linkVideoJson(await createCloudLinkVideo(request), 202);
    if (request.previewOnly)
      return linkVideoJson({ error: "Sign in to save a website preview. You can try your own media in the studio." }, 503);
    const job = await reserveLocalLinkVideo(req);
    after(() => runLocalLinkVideo(job, request));
    return linkVideoJson(
      { id: job.id, mode: "local", status: "queued", progress: 0 },
      202,
    );
  } catch (error) {
    return linkVideoFailure(error);
  }
}
