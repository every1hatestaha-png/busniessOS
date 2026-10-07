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
  target.searchParams.set("confirmation_error", "session");
  return NextResponse.redirect(target);
}

function recoveryActivationFallback(requestUrl: string) {
  const target = new URL("/forgot-password", requestUrl);
  target.searchParams.set("activation", "1");
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
    // Recovery links opened on another browser/device can lack the PKCE
    // verifier. Keep recovery destinations in recovery so the user can request
    // a fresh reset email without falsely granting proof or creating an identity.
    if (isRecoveryDestination(next)) {
      return recoveryActivationFallback(request.url);
    }

    // A failed exchange cannot establish that the email was confirmed. Keep
    // password sign-in and resend available without claiming confirmation.
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
