import { NextResponse } from "next/server";

import {
  clearRecoveryMarker,
  hasFreshRecoveryProof,
  hasRecoveryMarker,
} from "@/lib/server/recovery-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { password?: unknown };
    const password = typeof body.password === "string" ? body.password : "";

    if (password.length < 8 || password.length > 128) {
      return NextResponse.json(
        { error: "Password must be between 8 and 128 characters." },
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
        { error: "Your recovery verification has expired. Request a new confirmation code." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      return NextResponse.json(
        { error: "We could not update your password. Please request a new recovery code and try again." },
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
