import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { POST_AUTH_PATH, postAuthDestination, safeInternalDestination } from "@/lib/auth-routing";
import { issueRecoveryMarker } from "@/lib/server/recovery-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ALLOWED_CONFIRMATION_TYPES = new Set<EmailOtpType>([
  "signup",
  "email",
  "invite",
  "magiclink",
  "recovery",
]);

function confirmationFailure(requestUrl: string, reason: "missing" | "expired") {
  const target = new URL("/sign-in", requestUrl);
  target.searchParams.set("confirmation_error", reason);
  return NextResponse.redirect(target);
}

function recoveryFailure(requestUrl: string, reason: "missing" | "expired") {
  const target = new URL("/forgot-password", requestUrl);
  target.searchParams.set("activation", "1");
  target.searchParams.set("confirmation_error", reason);
  return NextResponse.redirect(target);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function recoveryConfirmationPage(tokenHash: string, next: string) {
  const token = escapeHtml(tokenHash);
  const destination = escapeHtml(next);

  return new Response(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Reset your MunshiOS password</title>
  <style>
    body{margin:0;background:#071821;color:#fff;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    main{min-height:100vh;display:grid;place-items:center;padding:24px}
    section{width:min(440px,100%);border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.035);border-radius:20px;padding:28px;box-sizing:border-box}
    h1{margin:0 0 10px;font-size:28px;letter-spacing:-.03em}
    p{margin:0 0 22px;color:#aab7c4;line-height:1.6}
    button{width:100%;height:52px;border:0;border-radius:12px;background:#10c98f;color:#03251b;font-weight:700;font-size:15px;cursor:pointer}
    small{display:block;margin-top:16px;color:#71808f;line-height:1.5}
  </style>
</head>
<body>
  <main>
    <section>
      <h1>Reset your password</h1>
      <p>Click below to continue to the secure password reset screen.</p>
      <form method="post" action="/auth/confirm">
        <input type="hidden" name="token_hash" value="${token}" />
        <input type="hidden" name="type" value="recovery" />
        <input type="hidden" name="next" value="${destination}" />
        <button type="submit">Continue securely</button>
      </form>
      <small>This extra confirmation protects single-use recovery links from email scanners and link previews.</small>
    </section>
  </main>
</body>
</html>`,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const rawType = url.searchParams.get("type");
  const fallbackNext = rawType === "recovery" ? "/recovery/new-password" : POST_AUTH_PATH;
  const next = safeInternalDestination(url.searchParams.get("next"), request.url, fallbackNext);

  if (!tokenHash || !rawType || !ALLOWED_CONFIRMATION_TYPES.has(rawType as EmailOtpType)) {
    return rawType === "recovery"
      ? recoveryFailure(request.url, "missing")
      : confirmationFailure(request.url, "missing");
  }

  // Recovery tokens are intentionally not consumed on GET. Email security scanners
  // and link-preview bots routinely prefetch links; a user gesture must POST before
  // the single-use recovery token is verified.
  if (rawType === "recovery") {
    return recoveryConfirmationPage(tokenHash, next);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: rawType as EmailOtpType,
  });

  if (error) {
    return confirmationFailure(request.url, "expired");
  }

  return NextResponse.redirect(new URL(postAuthDestination(next, request.url), request.url));
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const tokenHash = typeof formData.get("token_hash") === "string"
    ? String(formData.get("token_hash"))
    : "";
  const rawType = typeof formData.get("type") === "string"
    ? String(formData.get("type"))
    : "";
  const next = safeInternalDestination(
    typeof formData.get("next") === "string" ? String(formData.get("next")) : null,
    request.url,
    "/recovery/new-password",
  );

  if (!tokenHash || rawType !== "recovery") {
    return recoveryFailure(request.url, "missing");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "recovery",
  });

  if (error || !data.user?.email_confirmed_at) {
    return recoveryFailure(request.url, "expired");
  }

  await issueRecoveryMarker();
  return NextResponse.redirect(new URL(next, request.url), 303);
}
