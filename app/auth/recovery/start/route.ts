import { NextResponse } from "next/server";

import { safeInternalDestination } from "@/lib/auth-routing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSameOriginWebMutation } from "@/lib/server/cors";
import { consumeRecoveryEmailBudget } from "@/lib/server/auth-recovery-rate-limit";

const GENERIC_RESPONSE = { ok: true };
const DEFAULT_RECOVERY_REDIRECT = "/auth/callback?next=%2Frecovery%2Fnew-password";

function genericResponse() {
  return NextResponse.json(GENERIC_RESPONSE, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}

function recoveryOrigin(requestUrl: string) {
  const fallback = new URL(requestUrl).origin;
  const configured = process.env.AUTH_REDIRECT_ORIGIN?.trim();

  if (!configured) return fallback;

  try {
    const parsed = new URL(configured);
    if (parsed.protocol === "https:") return parsed.origin;

    const localHttp =
      parsed.protocol === "http:"
      && process.env.NODE_ENV !== "production"
      && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
    return localHttp ? parsed.origin : fallback;
  } catch {
    return fallback;
  }
}

export async function POST(request: Request) {
  if (!isSameOriginWebMutation(request)) {
    return NextResponse.json(
      { error: "This request origin is not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const body = (await request.json()) as { email?: unknown; redirectTo?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || email.length > 320 || !email.includes("@")) {
      return genericResponse();
    }
    // Budget every valid email regardless of account existence. Storage failure
    // fails closed through the generic catch without invoking the provider.
    if (!await consumeRecoveryEmailBudget(email)) return genericResponse();

    const origin = recoveryOrigin(request.url);
    const requestedRedirect = typeof body.redirectTo === "string" ? body.redirectTo : null;
    const safeRedirectPath = safeInternalDestination(
      requestedRedirect,
      request.url,
      DEFAULT_RECOVERY_REDIRECT,
    );
    const redirectTo = `${origin}${safeRedirectPath}`;

    const supabase = await createSupabaseServerClient();
    // Recovery targets existing Supabase identities only. Shared verified-email
    // linking still preserves legacy MunshiOS users and their memberships after
    // authentication; recovery must never provision a missing provider identity.
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    if (error) {
      console.warn("[auth] password recovery request failed", {
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
