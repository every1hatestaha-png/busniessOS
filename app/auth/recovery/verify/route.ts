import { NextResponse } from "next/server";

import { issueRecoveryMarker } from "@/lib/server/recovery-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: unknown; token?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const token = typeof body.token === "string" ? body.token.trim() : "";

    if (!email || !/^\d{6,8}$/.test(token)) {
      return NextResponse.json(
        { error: "That confirmation code is invalid or has expired." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });

    if (error || !data.user?.email_confirmed_at) {
      return NextResponse.json(
        { error: "That confirmation code is invalid or has expired." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    await issueRecoveryMarker();

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "We could not verify that code right now. Please try again." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
