import { NextResponse } from "next/server";

import { hasFreshRecoveryProof } from "@/lib/auth-recovery-proof";
import {
  MAX_NEW_PASSWORD_LENGTH,
  MIN_NEW_PASSWORD_LENGTH,
  isAcceptableNewPassword,
} from "@/lib/auth-password-policy";
import {
  clearRecoveryMarker,
  hasRecoveryMarker,
} from "@/lib/server/recovery-session";
import { isSameOriginWebMutation } from "@/lib/server/cors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    if (!isSameOriginWebMutation(request)) {
      return NextResponse.json(
        { error: "This request origin is not allowed." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    const body = (await request.json()) as { password?: unknown };
    const password = typeof body.password === "string" ? body.password : "";

    if (!isAcceptableNewPassword(password)) {
      return NextResponse.json(
        { error: `Password must be between ${MIN_NEW_PASSWORD_LENGTH} and ${MAX_NEW_PASSWORD_LENGTH} characters.` },
        { status: 422, headers: { "Cache-Control": "no-store" } },
      );
    }

    const supabase = await createSupabaseServerClient();
    const [{ data: userData, error: userError }, { data: claimsData, error: claimsError }, marker] = await Promise.all([
      supabase.auth.getUser(),
      supabase.auth.getClaims(),
      hasRecoveryMarker(),
    ]);

    if (
      !marker
      || userError
      || !userData.user?.email_confirmed_at
      || claimsError
      || !hasFreshRecoveryProof(claimsData?.claims)
    ) {
      await clearRecoveryMarker();
      return NextResponse.json(
        { error: "Your recovery verification has expired. Request a new password reset link." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      return NextResponse.json(
        { error: "We could not update your password. Please request a new password reset link and try again." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    await clearRecoveryMarker();

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "We could not update your password right now. Please try again." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
