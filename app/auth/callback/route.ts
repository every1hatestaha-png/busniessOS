import { NextResponse } from "next/server";

import { hasFreshRecoveryProof } from "@/lib/auth-recovery-proof";
import { safeInternalDestination } from "@/lib/auth-routing";
import { issueRecoveryMarker } from "@/lib/server/recovery-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function isRecoveryDestination(next: string) {
  return next === "/forgot-password?verified=1" || next.startsWith("/recovery/");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeInternalDestination(url.searchParams.get("next"), request.url, "/dashboard");

  if (!code) {
    return NextResponse.redirect(new URL(`/sign-in?error=${encodeURIComponent("Missing authentication code.")}`, request.url));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL(`/sign-in?error=${encodeURIComponent("Could not complete authentication. Please try again.")}`, request.url));
  }

  if (isRecoveryDestination(next)) {
    const [{ data: userData, error: userError }, { data: claimsData, error: claimsError }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.auth.getClaims(),
    ]);

    if (
      !userError
      && userData.user?.email_confirmed_at
      && !claimsError
      && hasFreshRecoveryProof(claimsData?.claims)
    ) {
      await issueRecoveryMarker();
    }
  }

  return NextResponse.redirect(new URL(next, request.url));
}
