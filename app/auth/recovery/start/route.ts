import { NextResponse } from "next/server";

import { db } from "@/lib/server/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const GENERIC_RESPONSE = { ok: true };

export async function POST(request: Request) {
  let email = "";
  try {
    const body = (await request.json()) as { email?: unknown; redirectTo?: unknown };
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || email.length > 320 || !email.includes("@")) {
      return NextResponse.json(GENERIC_RESPONSE, { status: 200, headers: { "Cache-Control": "no-store" } });
    }

    const existingUser = await db.user.findUnique({
      where: { email },
      select: { id: true },
    });

    // Always return the same public response so the recovery endpoint does not
    // disclose whether an email belongs to a MunshiOS customer.
    if (!existingUser) {
      return NextResponse.json(GENERIC_RESPONSE, { status: 200, headers: { "Cache-Control": "no-store" } });
    }

    const origin = new URL(request.url).origin;
    const redirectTo = typeof body.redirectTo === "string" && body.redirectTo.startsWith("/")
      ? `${origin}${body.redirectTo}`
      : `${origin}/auth/callback?next=${encodeURIComponent("/forgot-password?verified=1")}`;

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: redirectTo,
      },
    });

    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes("rate") || message.includes("too many")) {
        return NextResponse.json(
          { ok: false, error: "RATE_LIMITED" },
          { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" } },
        );
      }

      return NextResponse.json(
        { ok: false, error: "RECOVERY_UNAVAILABLE" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(GENERIC_RESPONSE, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(
      { ok: false, error: "RECOVERY_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
