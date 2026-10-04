import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { safeInternalDestination } from "@/lib/auth-routing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ALLOWED_CONFIRMATION_TYPES = new Set<EmailOtpType>(["signup", "email", "invite", "magiclink"]);

function confirmationFailure(requestUrl: string, reason: "missing" | "expired") {
  const target = new URL("/sign-in", requestUrl);
  target.searchParams.set("confirmation_error", reason);
  return NextResponse.redirect(target);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const rawType = url.searchParams.get("type");
  const next = safeInternalDestination(url.searchParams.get("next"), request.url, "/onboarding");

  if (!tokenHash || !rawType || !ALLOWED_CONFIRMATION_TYPES.has(rawType as EmailOtpType)) {
    return confirmationFailure(request.url, "missing");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: rawType as EmailOtpType,
  });

  if (error) {
    return confirmationFailure(request.url, "expired");
  }

  return NextResponse.redirect(new URL(next, request.url));
}
