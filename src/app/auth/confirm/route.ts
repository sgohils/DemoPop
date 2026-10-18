import { NextRequest, NextResponse } from "next/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { userClient, cloudConfigured } from "../../../server/supabase";
export async function GET(req: NextRequest) {
  if (!cloudConfigured())
    return NextResponse.redirect(new URL("/auth?confirmation=failed", req.url));
  const token_hash = req.nextUrl.searchParams.get("token_hash"),
    type = req.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const code = req.nextUrl.searchParams.get("code");
  const recovery =
    type === "recovery" ||
    req.nextUrl.searchParams.get("next") === "/auth/reset";
  const client = await userClient();
  let error;
  if (token_hash && type) {
    ({ error } = await client.auth.verifyOtp({ token_hash, type }));
  } else if (code) {
    ({ error } = await client.auth.exchangeCodeForSession(code));
  } else {
    error = true;
  }
  return NextResponse.redirect(
    new URL(
      error
        ? "/auth?confirmation=failed"
        : recovery
          ? "/auth/reset"
          : "/projects",
      req.url,
    ),
  );
}
