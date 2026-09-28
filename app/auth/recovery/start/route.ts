import { NextResponse } from "next/server";

import { safeInternalDestination } from "@/lib/auth-routing";
import { db } from "@/lib/server/db";
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

    const existingUser = await db.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: "insensitive",
        },
      },
      select: { id: true },
    });

    // Always return the same public response so the recovery endpoint does not
    // disclose whether an email belongs to a MunshiOS customer.
    if (!existingUser) {
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
        shouldCreateUser: true,
        emailRedirectTo: redirectTo,
      },
    });

    if (error) {
      // Do not reflect provider-specific failures or cooldowns to the caller.
      // Returning different statuses for an existing email would turn recovery
      // into an account-enumeration oracle. App-level rate limiting still runs
      // before this handler and remains email-agnostic.
      console.warn("[auth] recovery OTP request failed", {
        code: error.code ?? null,
        status: error.status ?? null,
      });
    }

    return genericResponse();
  } catch {
    // Recovery responses intentionally stay generic to avoid disclosing whether
    // an account exists. Operational failures are observable in server logs.
    console.warn("[auth] recovery request could not be processed");
    return genericResponse();
  }
}
