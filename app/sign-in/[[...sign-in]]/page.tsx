"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";

import { MAX_EMAIL_OTP_LENGTH, isValidEmailOtp, normalizeEmailOtp } from "@/lib/auth-email-otp";
import { postAuthDestination } from "@/lib/auth-routing";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const LOGIN_VISUAL = "/auth/faisal-mosque.webp";
const RESEND_COOLDOWN_SECONDS = 30;

export default function SignInPage() {
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(searchParams.get("error") || "");
  const [showMigrationHelp, setShowMigrationHelp] = useState(false);
  const [showVerificationHelp, setShowVerificationHelp] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [verificationError, setVerificationError] = useState("");
  const [resendBusy, setResendBusy] = useState(false);
  const [resendStatus, setResendStatus] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const emailConfirmed = searchParams.get("confirmed") === "1";
  const confirmationError = searchParams.get("confirmation_error");

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setShowMigrationHelp(false);
    setShowVerificationHelp(false);
    setResendStatus("");

    const identifier = email.trim().toLowerCase();
    if (!identifier || !password) {
      setError("Enter your email and password.");
      setBusy(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: identifier,
      password,
    });

    if (signInError) {
      if (signInError.code === "email_not_confirmed" || signInError.message.toLowerCase().includes("email not confirmed")) {
        setError("Your email has not been verified yet.");
        setShowVerificationHelp(true);
      } else if (signInError.message === "Invalid login credentials") {
        setError("Email or password is incorrect.");
        setShowMigrationHelp(true);
      } else if (signInError.status === 429 || signInError.message.toLowerCase().includes("rate")) {
        setError("Too many sign-in attempts. Please wait a moment and try again.");
      } else {
        setError("We could not sign you in right now. Please try again.");
      }
      setBusy(false);
      return;
    }

    const destination = postAuthDestination(
      searchParams.get("redirect_url") ?? searchParams.get("next"),
      window.location.href,
    );
    window.location.assign(destination);
  }

  async function verifyPendingEmail() {
    if (verificationBusy) return;

    const identifier = email.trim().toLowerCase();
    const token = normalizeEmailOtp(verificationCode);

    if (!identifier) {
      setVerificationError("Enter the email address you used to create the account.");
      return;
    }

    if (!isValidEmailOtp(token)) {
      setVerificationError("Enter the verification code exactly as it appears in your email.");
      return;
    }

    setVerificationBusy(true);
    setVerificationError("");

    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email: identifier,
      token,
      type: "email",
    });

    if (verifyError || !data.user) {
      const message = verifyError?.message.toLowerCase() ?? "";
      if (message.includes("expired") || message.includes("invalid")) {
        setVerificationError("That code is invalid or expired. Request a new code and try again.");
      } else if (message.includes("rate") || message.includes("too many")) {
        setVerificationError("Too many verification attempts. Please wait a moment and try again.");
      } else {
        setVerificationError("We could not verify that code. Please check it and try again.");
      }
      setVerificationBusy(false);
      return;
    }

    if (!data.session) {
      window.location.assign("/sign-in?confirmed=1");
      return;
    }

    const destination = postAuthDestination(
      searchParams.get("redirect_url") ?? searchParams.get("next"),
      window.location.href,
    );
    window.location.assign(destination);
  }

  async function resendVerification() {
    const identifier = email.trim().toLowerCase();
    if (!identifier || resendBusy || resendCooldown > 0) return;

    setResendBusy(true);
    setResendStatus("");
    const origin = window.location.origin;
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: identifier,
      options: {
        emailRedirectTo: `${origin}/auth/callback`,
      },
    });

    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    setResendStatus(
      resendError
        ? "We could not resend the verification code yet. Please wait a moment and try again."
        : "If this address has a pending MunshiOS signup, a new verification code has been sent.",
    );
    setResendBusy(false);
  }

  return (
    <main className="min-h-dvh bg-[#071821] text-white">
      <div className="grid min-h-dvh lg:grid-cols-[56%_44%]">
        <section className="relative hidden min-h-dvh overflow-hidden lg:block" aria-hidden="true">
          <Image src={LOGIN_VISUAL} alt="" fill sizes="56vw" priority className="object-cover object-center" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,19,25,0.12)_0%,rgba(4,19,25,0.05)_55%,rgba(7,24,33,0.82)_100%)]" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#041319]/90 via-[#041319]/45 to-transparent px-10 pb-10 pt-28 xl:px-14 xl:pb-12">
            <div className="max-w-lg">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300/90">MunshiOS</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-white xl:text-3xl">Run your business from one place.</p>
              <p className="mt-2 text-sm leading-6 text-slate-300/85">Sales, inventory, purchases, accounts and operations — connected in one system.</p>
            </div>
          </div>
        </section>

        <section className="relative flex min-h-dvh items-center justify-center px-6 py-10 sm:px-10 lg:px-12 xl:px-16">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(16,185,129,0.08),transparent_34%)]" />

          <div className="relative w-full max-w-[430px]">
            <Link href="/" className="mb-10 inline-flex items-center gap-3 sm:mb-12">
              <span className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[0.04] shadow-[0_8px_30px_rgba(0,0,0,0.18)]">
                <Image src="/brand/munshios-mark.svg" alt="MunshiOS" width={28} height={28} priority />
              </span>
              <span className="text-lg font-semibold tracking-[-0.03em] text-white">munshi<span className="text-emerald-400">OS</span></span>
            </Link>

            <div className="mb-8">
              <h1 className="text-[34px] font-semibold tracking-[-0.045em] text-white sm:text-[38px]">Welcome back</h1>
              <p className="mt-2 text-[15px] text-slate-400">Sign in to continue to your workspace.</p>
            </div>

            {emailConfirmed ? (
              <p role="status" className="mb-5 flex items-start gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] px-4 py-3 text-sm leading-5 text-emerald-100">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" />
                Email confirmed. Sign in once to continue your setup.
              </p>
            ) : null}

            {confirmationError ? (
              <p role="alert" className="mb-5 rounded-xl border border-amber-400/20 bg-amber-400/[0.07] px-4 py-3 text-sm leading-5 text-amber-100">
                {confirmationError === "session"
                  ? "This link could not sign you in. If you already verified your email, sign in below. Otherwise, request a new verification code."
                  : confirmationError === "expired"
                  ? "That verification link is invalid or expired. Enter your email below and request a new verification code."
                  : "That verification link is incomplete. Request a new verification code below."}
              </p>
            ) : null}

            <form onSubmit={handleSignIn} className="space-y-5">
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-200">Email</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-slate-500" />
                  <input id="email" type="email" autoComplete="email" required disabled={busy} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" className="h-[52px] w-full rounded-xl border border-white/10 bg-white/[0.035] pl-12 pr-4 text-sm text-white outline-none transition placeholder:text-slate-600 hover:border-white/15 focus:border-emerald-400/70 focus:bg-white/[0.05] focus:ring-2 focus:ring-emerald-400/10 disabled:opacity-60" />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-4">
                  <label htmlFor="password" className="text-sm font-medium text-slate-200">Password</label>
                  <Link href="/forgot-password" className="text-xs font-medium text-emerald-300 transition hover:text-emerald-200">Forgot password?</Link>
                </div>
                <div className="relative">
                  <LockKeyhole className="absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-slate-500" />
                  <input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required disabled={busy} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" className="h-[52px] w-full rounded-xl border border-white/10 bg-white/[0.035] pl-12 pr-12 text-sm text-white outline-none transition placeholder:text-slate-600 hover:border-white/15 focus:border-emerald-400/70 focus:bg-white/[0.05] focus:ring-2 focus:ring-emerald-400/10 disabled:opacity-60" />
                  <button type="button" disabled={busy} onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 transition hover:bg-white/[0.05] hover:text-slate-200 disabled:opacity-50">{showPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}</button>
                </div>
              </div>

              {error ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-500/[0.07] px-4 py-3 text-sm leading-5 text-red-200">{error}</p> : null}

              {showVerificationHelp || confirmationError ? (
                <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.05] px-4 py-3 text-sm leading-6 text-slate-300">
                  <p>Enter the verification code from your MunshiOS email. If you need a fresh code, resend it below.</p>
                  <div className="mt-3 space-y-2">
                    <input
                      id="sign-in-verification-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={MAX_EMAIL_OTP_LENGTH}
                      value={verificationCode}
                      onChange={(event) => {
                        setVerificationCode(normalizeEmailOtp(event.target.value));
                        setVerificationError("");
                      }}
                      placeholder="12345678"
                      disabled={verificationBusy}
                      className="h-12 w-full rounded-xl border border-white/10 bg-black/10 px-4 text-center text-lg font-semibold tracking-[0.28em] text-white outline-none focus:border-emerald-400/70 disabled:opacity-60"
                    />
                    {verificationError ? <p role="alert" className="text-xs leading-5 text-red-200">{verificationError}</p> : null}
                    <button
                      type="button"
                      onClick={verifyPendingEmail}
                      disabled={verificationBusy || !isValidEmailOtp(verificationCode) || !email.trim()}
                      className="h-10 rounded-lg bg-emerald-500 px-4 text-xs font-semibold text-[#03251b] hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {verificationBusy ? "Verifying..." : "Verify email"}
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={resendBusy || resendCooldown > 0 || !email.trim()}
                    onClick={resendVerification}
                    className="mt-2 font-medium text-emerald-300 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {resendBusy ? "Sending..." : resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend verification code"}
                  </button>
                  {resendStatus ? <p role="status" className="mt-2 text-xs text-slate-400">{resendStatus}</p> : null}
                </div>
              ) : null}

              {showMigrationHelp ? (
                <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.05] px-4 py-3 text-sm leading-6 text-slate-300">
                  If you used MunshiOS before the login upgrade, you may need to establish a password once. <Link href="/forgot-password" className="font-medium text-emerald-300 hover:text-emerald-200">Request a reset link.</Link> After setting it, use the same email and password for later logins.
                </div>
              ) : null}

              <button type="submit" disabled={busy} className="flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-[#03251b] shadow-[0_10px_30px_rgba(16,185,129,0.14)] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60">
                {busy ? "Signing in..." : "Sign in"}
                {!busy ? <ArrowRight className="size-4" /> : null}
              </button>
            </form>

            <div className="mt-7 border-t border-white/[0.08] pt-6">
              <p className="text-center text-sm text-slate-500">New to MunshiOS? <Link href="/sign-up" className="font-medium text-emerald-300 transition hover:text-emerald-200">Create an account</Link></p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
