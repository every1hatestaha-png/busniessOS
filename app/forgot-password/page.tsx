"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, KeyRound, Mail, ShieldCheck } from "lucide-react";

type RecoveryStep = "email" | "code" | "choice";

const RESEND_COOLDOWN_SECONDS = 30;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<RecoveryStep>("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const verifiedByLink = new URLSearchParams(window.location.search).get("verified") === "1";
    if (!verifiedByLink) return;

    let active = true;
    void fetch("/auth/recovery/status", { cache: "no-store" }).then((response) => {
      if (!active) return;
      if (response.ok) setStep("choice");
    }).catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  async function sendRecoveryCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (busy || (step === "code" && resendCooldown > 0)) return;

    const identifier = email.trim().toLowerCase();
    if (!identifier) {
      setError("Enter your email address.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const linkDestination = "/forgot-password?verified=1";
      const redirectTo = `/auth/callback?next=${encodeURIComponent(linkDestination)}`;
      const response = await fetch("/auth/recovery/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: identifier, redirectTo }),
      });

      if (response.status === 429) {
        setError("Please wait a moment before requesting another code.");
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
        return;
      }

      if (!response.ok) {
        setError("We could not start recovery right now. Please try again shortly.");
        return;
      }

      setEmail(identifier);
      setCode("");
      setStep("code");
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      setError("We could not start recovery right now. Please try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyRecoveryCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const identifier = email.trim().toLowerCase();
    const token = code.trim();
    if (!identifier || !/^\d{6,8}$/.test(token)) {
      setError("Enter the confirmation code from your email.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const response = await fetch("/auth/recovery/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: identifier, token }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error || "That confirmation code is invalid or has expired.");
        return;
      }

      setStep("choice");
    } catch {
      setError("We could not verify that code right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function continueWithoutChangingPassword() {
    window.location.assign("/dashboard");
  }

  function changePassword() {
    window.location.assign("/recovery/new-password");
  }

  return (
    <main className="min-h-dvh bg-[#071821] px-6 py-10 text-white sm:px-10">
      <div className="mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-[430px] flex-col justify-center">
        <Link href="/" className="mb-10 inline-flex items-center gap-3 self-start">
          <span className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[0.04] shadow-[0_8px_30px_rgba(0,0,0,0.18)]">
            <Image src="/brand/munshios-mark.svg" alt="MunshiOS" width={28} height={28} priority />
          </span>
          <span className="text-lg font-semibold tracking-[-0.03em] text-white">munshi<span className="text-emerald-400">OS</span></span>
        </Link>

        {step === "email" ? (
          <section>
            <div className="grid size-12 place-items-center rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.06]">
              <Mail className="size-5 text-emerald-300" />
            </div>
            <h1 className="mt-6 text-[34px] font-semibold tracking-[-0.045em] text-white">Recover your account</h1>
            <p className="mt-2 text-[15px] leading-6 text-slate-400">Enter the email attached to your MunshiOS account. We&apos;ll send a short confirmation code.</p>

            <form onSubmit={sendRecoveryCode} className="mt-7 space-y-4">
              <div>
                <label htmlFor="recovery-email" className="mb-2 block text-sm font-medium text-slate-200">Email</label>
                <input id="recovery-email" type="email" autoComplete="email" required disabled={busy} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" className="h-[52px] w-full rounded-xl border border-white/10 bg-white/[0.035] px-4 text-sm text-white outline-none transition placeholder:text-slate-600 hover:border-white/15 focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-400/10 disabled:opacity-60" />
              </div>
              {error ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-500/[0.07] px-4 py-3 text-sm leading-5 text-red-200">{error}</p> : null}
              <button type="submit" disabled={busy} className="h-[52px] w-full rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-[#03251b] shadow-[0_10px_30px_rgba(16,185,129,0.14)] transition hover:bg-emerald-400 disabled:opacity-60">{busy ? "Sending..." : "Send confirmation code"}</button>
            </form>
          </section>
        ) : null}

        {step === "code" ? (
          <section>
            <div className="grid size-12 place-items-center rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.06]">
              <KeyRound className="size-5 text-emerald-300" />
            </div>
            <h1 className="mt-6 text-[34px] font-semibold tracking-[-0.045em] text-white">Enter your code</h1>
            <p className="mt-2 text-[15px] leading-6 text-slate-400">If <span className="font-medium text-slate-300">{email}</span> belongs to a MunshiOS account, a confirmation code has been sent.</p>

            <form onSubmit={verifyRecoveryCode} className="mt-7 space-y-4">
              <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={8} required disabled={busy} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="000000" className="h-[56px] w-full rounded-xl border border-white/10 bg-white/[0.035] px-4 text-center text-xl tracking-[0.32em] text-white outline-none transition placeholder:text-slate-700 focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-400/10 disabled:opacity-60" />
              {error ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-500/[0.07] px-4 py-3 text-sm leading-5 text-red-200">{error}</p> : null}
              <button type="submit" disabled={busy} className="h-[52px] w-full rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-[#03251b] transition hover:bg-emerald-400 disabled:opacity-60">{busy ? "Verifying..." : "Verify code"}</button>
              <button type="button" disabled={busy || resendCooldown > 0} onClick={() => void sendRecoveryCode()} className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] text-sm font-medium text-slate-300 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50">{resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}</button>
              <button type="button" disabled={busy} onClick={() => { setStep("email"); setCode(""); setError(""); setResendCooldown(0); }} className="w-full text-sm text-slate-500 transition hover:text-slate-300">Use another email</button>
            </form>
          </section>
        ) : null}

        {step === "choice" ? (
          <section>
            <div className="grid size-12 place-items-center rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.08]">
              <CheckCircle2 className="size-6 text-emerald-300" />
            </div>
            <h1 className="mt-6 text-[34px] font-semibold tracking-[-0.045em] text-white">Email verified</h1>
            <p className="mt-2 text-[15px] leading-6 text-slate-400">Your identity is verified. Continue to your workspace now, or set a password for future email + password sign-ins.</p>

            <div className="mt-7 space-y-3">
              <button type="button" onClick={continueWithoutChangingPassword} className="h-[52px] w-full rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-[#03251b] transition hover:bg-emerald-400">Continue to dashboard</button>
              <button type="button" onClick={changePassword} className="flex h-[52px] w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] text-sm font-semibold text-slate-200 transition hover:bg-white/[0.06]"><ShieldCheck className="size-4" /> Set or change password</button>
            </div>
          </section>
        ) : null}

        <Link href="/sign-in" className="mt-8 inline-flex items-center gap-2 self-start text-sm text-slate-500 transition hover:text-slate-300"><ArrowLeft className="size-4" /> Back to sign in</Link>
      </div>
    </main>
  );
}
