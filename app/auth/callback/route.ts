import { NextResponse } from "next/server";

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

    const amr = claimsData?.claims && typeof claimsData.claims === "object"
      ? (claimsData.claims as { amr?: unknown }).amr
      : null;
    const hasFreshEmailMethod = Array.isArray(amr) && amr.some((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const method = (entry as { method?: unknown }).method;
      const timestamp = (entry as { timestamp?: unknown }).timestamp;
      if (!["otp", "recovery", "magiclink"].includes(String(method))) return false;
      if (typeof timestamp !== "number") return false;
      const age = Math.floor(Date.now() / 1000) - timestamp;
      return age >= -30 && age <= 10 * 60;
    });

    if (!userError && userData.user?.email_confirmed_at && !claimsError && hasFreshEmailMethod) {
      await issueRecoveryMarker();
    }
  }

  return NextResponse.redirect(new URL(next, request.url));
}
