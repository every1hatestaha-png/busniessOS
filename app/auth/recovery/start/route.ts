import { NextResponse } from "next/server";

import { safeInternalDestination } from "@/lib/auth-routing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const GENERIC_RESPONSE = { ok: true };
const DEFAULT_RECOVERY_REDIRECT = "/auth/callback?next=%2Fforgot-password%3Fverified%3D1";

function genericResponse() {
  return NextResponse.json(GENERIC_RESPONSE, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: unknown; redirectTo?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || email.length > 320 || !email.includes("@")) {
      return genericResponse();
    }

    const origin = new URL(request.url).origin;
    const requestedRedirect = typeof body.redirectTo === "string" ? body.redirectTo : null;
    const safeRedirectPath = safeInternalDestination(
      requestedRedirect,
      request.url,
      DEFAULT_RECOVERY_REDIRECT,
    );
    const redirectTo = `${origin}${safeRedirectPath}`;

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: redirectTo,
      },
    });

    if (error) {
      console.warn("[auth] recovery OTP request failed", {
        code: error.code ?? null,
        status: error.status ?? null,
      });
    }

    return genericResponse();
  } catch {
    console.warn("[auth] recovery request could not be processed");
    return genericResponse();
  }
}
