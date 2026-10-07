"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";

import {
  MAX_NEW_PASSWORD_LENGTH,
  MIN_NEW_PASSWORD_LENGTH,
  isAcceptableNewPassword,
} from "@/lib/auth-password-policy";

export default function RecoveryNewPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    void fetch("/auth/recovery/status", { cache: "no-store" })
      .then((response) => {
        if (!active) return;
        if (!response.ok) {
          window.location.replace("/forgot-password");
          return;
        }
        setCheckingSession(false);
      })
      .catch(() => {
        if (active) window.location.replace("/forgot-password");
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || checkingSession) return;
    setError("");

    if (!isAcceptableNewPassword(password)) {
      setError(`Use a password between ${MIN_NEW_PASSWORD_LENGTH} and ${MAX_NEW_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      const response = await fetch("/auth/recovery/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error || "We could not update your password. Please request a new password reset link and try again.");
        setBusy(false);
        return;
      }

      window.location.assign("/dashboard");
    } catch {
      setError("We could not update your password right now. Please try again.");
      setBusy(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="min-h-dvh bg-[#071821] px-6 py-10 text-white sm:px-10">
        <div className="mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-[430px] items-center justify-center">
          <p className="text-sm text-slate-400">Checking secure recovery session...</p>
        </div>
      </main>
    );
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

        <section>
          <div className="grid size-12 place-items-center rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.06]">
            <ShieldCheck className="size-5 text-emerald-300" />
          </div>
          <h1 className="mt-6 text-[34px] font-semibold tracking-[-0.045em] text-white">Choose a new password</h1>
          <p className="mt-2 text-[15px] leading-6 text-slate-400">Use at least {MIN_NEW_PASSWORD_LENGTH} characters and don&apos;t reuse a password from another service. Your recovery verification expires shortly.</p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <div>
              <label htmlFor="new-password" className="mb-2 block text-sm font-medium text-slate-200">New password</label>
              <div className="relative">
                <LockKeyhole className="absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-slate-500" />
                <input id="new-password" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={MIN_NEW_PASSWORD_LENGTH} maxLength={MAX_NEW_PASSWORD_LENGTH} required disabled={busy} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={`${MIN_NEW_PASSWORD_LENGTH}–${MAX_NEW_PASSWORD_LENGTH} characters`} className="h-[52px] w-full rounded-xl border border-white/10 bg-white/[0.035] pl-12 pr-12 text-sm text-white outline-none transition placeholder:text-slate-600 hover:border-white/15 focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-400/10 disabled:opacity-60" />
                <button type="button" disabled={busy} onClick={() => setShowPassword((value) => !value)} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 transition hover:bg-white/[0.05] hover:text-slate-200 disabled:opacity-50" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}</button>
              </div>
            </div>

            <div>
              <label htmlFor="confirm-password" className="mb-2 block text-sm font-medium text-slate-200">Confirm new password</label>
              <input id="confirm-password" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={MIN_NEW_PASSWORD_LENGTH} maxLength={MAX_NEW_PASSWORD_LENGTH} required disabled={busy} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter it again" className="h-[52px] w-full rounded-xl border border-white/10 bg-white/[0.035] px-4 text-sm text-white outline-none transition placeholder:text-slate-600 hover:border-white/15 focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-400/10 disabled:opacity-60" />
            </div>

            {error ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-500/[0.07] px-4 py-3 text-sm leading-5 text-red-200">{error}</p> : null}

            <button type="submit" disabled={busy} className="h-[52px] w-full rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-[#03251b] shadow-[0_10px_30px_rgba(16,185,129,0.14)] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60">{busy ? "Updating password..." : "Update password"}</button>
          </form>
        </section>

        <Link href="/forgot-password" className="mt-8 inline-flex items-center gap-2 self-start text-sm text-slate-500 transition hover:text-slate-300"><ArrowLeft className="size-4" /> Start recovery again</Link>
      </div>
    </main>
  );
}
