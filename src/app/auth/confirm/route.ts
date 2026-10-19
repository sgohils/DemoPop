import { NextRequest, NextResponse } from "next/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { userClient, cloudConfigured } from "../../../server/supabase";
import { safeAuthNext } from "../../../shared/auth-next";
import { requestOrigin } from "../../../server/request-origin";
export async function GET(req: NextRequest) {
  const next = safeAuthNext(
    req.nextUrl.searchParams.get("next") ??
      req.cookies.get("demopop-auth-next")?.value,
  );
  const failure =
    next === "/create"
      ? "/auth?confirmation=failed&next=%2Fcreate"
      : "/auth?confirmation=failed";
  if (!cloudConfigured())
    return NextResponse.redirect(new URL(failure, requestOrigin(req)));
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
  const response = NextResponse.redirect(
    new URL(
      error ? failure : recovery ? "/auth/reset" : next,
      requestOrigin(req),
    ),
  );
  response.cookies.set("demopop-auth-next", "", {
    path: "/auth/confirm",
    maxAge: 0,
  });
  return response;
}
