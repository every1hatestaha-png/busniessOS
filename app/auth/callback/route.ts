import { NextResponse } from "next/server";

import { hasFreshRecoveryProof } from "@/lib/auth-recovery-proof";
import { safeInternalDestination } from "@/lib/auth-routing";
import { issueRecoveryMarker } from "@/lib/server/recovery-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function isRecoveryDestination(next: string) {
  return next === "/forgot-password?verified=1" || next.startsWith("/recovery/");
}

function signInFallback(requestUrl: string, next: string) {
  const target = new URL("/sign-in", requestUrl);
  target.searchParams.set("next", next);
  target.searchParams.set("confirmed", "1");
  return NextResponse.redirect(target);
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
    // Email confirmation may be opened on a different browser/device from the
    // one that initiated the PKCE signup. In that case the confirmation itself
    // succeeds at Supabase, but this browser does not have the PKCE verifier.
    // Never bypass authentication: require a normal password sign-in and keep
    // the intended post-login destination.
    return signInFallback(request.url, next);
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
