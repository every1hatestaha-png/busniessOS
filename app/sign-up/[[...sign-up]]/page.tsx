"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { CheckCircle2, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";

import {
  MAX_NEW_PASSWORD_LENGTH,
  MIN_NEW_PASSWORD_LENGTH,
  isAcceptableNewPassword,
} from "@/lib/auth-password-policy";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const LOGIN_VISUAL = "/auth/faisal-mosque.webp";

export default function SignUpPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");

    const identifier = email.trim().toLowerCase();
    if (!identifier || !isAcceptableNewPassword(password)) {
      setError(`Use a valid email and a password between ${MIN_NEW_PASSWORD_LENGTH} and ${MAX_NEW_PASSWORD_LENGTH} characters.`);
      setBusy(false);
      return;
    }

    const origin = window.location.origin;
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: identifier,
      password,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=/onboarding`,
        data: {
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
        },
      },
    });

    if (signUpError) {
      const message = signUpError.message.toLowerCase();
      if (message.includes("rate") || message.includes("too many")) {
        setError("Too many signup attempts. Please wait a moment and try again.");
      } else {
        setError("We could not create your account right now. Please try again.");
      }
      setBusy(false);
      return;
    }

    if (data.session) {
      window.location.assign("/onboarding");
      return;
    }

    setEmail(identifier);
    setSent(true);
    setBusy(false);
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
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-white xl:text-3xl">Everything your business needs, connected.</p>
              <p className="mt-2 text-sm leading-6 text-slate-300/85">Create your workspace and manage sales, stock, purchases and accounts without switching between tools.</p>
            </div>
          </div>
        </section>

        <section className="relative flex min-h-dvh items-center justify-center px-6 py-10 sm:px-10 lg:px-12 xl:px-16">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(16,185,129,0.08),transparent_34%)]" />

          <div className="relative w-full max-w-[430px]">
            <Link href="/" className="mb-9 inline-flex items-center gap-3 sm:mb-10">
              <span className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[0.04] shadow-[0_8px_30px_rgba(0,0,0,0.18)]">
                <Image src="/brand/munshios-mark.svg" alt="MunshiOS" width={28} height={28} priority />
              </span>
              <span className="text-lg font-semibold tracking-[-0.03em] text-white">munshi<span className="text-emerald-400">OS</span></span>
            </Link>

            {sent ? (
              <div>
                <div className="grid size-12 place-items-center rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.08]">
                  <CheckCircle2 className="size-6 text-emerald-300" />
                </div>
                <h1 className="mt-6 text-[34px] font-semibold tracking-[-0.045em] text-white">Check your email</h1>
                <p className="mt-3 text-[15px] leading-6 text-slate-400">We sent a verification link to <span className="font-medium text-slate-200">{email}</span>.</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">Open it on this device to finish setup and continue to your workspace.</p>
                <Link href="/sign-in" className="mt-7 inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-5 text-sm font-medium text-slate-200 transition hover:bg-white/[0.07]">Back to sign in</Link>
              </div>
            ) : (
              <>
                <div className="mb-7">
                  <h1 className="text-[34px] font-semibold tracking-[-0.045em] text-white sm:text-[38px]">Create your account</h1>
                  <p className="mt-2 text-[15px] text-slate-400">Set up your MunshiOS workspace in a few steps.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="first-name" className="mb-2 block text-sm font-medium text-slate-200">First name</label>
                      <input id="first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="First name" autoComplete="given-name" className="h-[52px] w-full rounded-xl border border-white/10 bg-white/[0.035] px-4 text-sm text-white outline-none transition placeholder:text-slate-600 hover:border-white/15 focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-400/10" />
                    </div>
                    <div>
                      <label htmlFor="last-name" className="mb-2 block text-sm font-medium text-slate-200">Last name</label>
                      <input id="last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Last name" autoComplete="family-name" className="h-[52px] w-full rounded-xl border border-white/10 bg-white/[0.035] px-4 text-sm text-white outline-none transition placeholder:text-slate-600 hover:border-white/15 focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-400/10" />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-200">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-slate-500" />
                      <input id="email" type="email" autoComplete="email" required disabled={busy} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" className="h-[52px] w-full rounded-xl border border-white/10 bg-white/[0.035] pl-12 pr-4 text-sm text-white outline-none transition placeholder:text-slate-600 hover:border-white/15 focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-400/10 disabled:opacity-60" />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-200">Password</label>
                    <div className="relative">
                      <LockKeyhole className="absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-slate-500" />
                      <input id="password" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={MIN_NEW_PASSWORD_LENGTH} maxLength={MAX_NEW_PASSWORD_LENGTH} required disabled={busy} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={`Minimum ${MIN_NEW_PASSWORD_LENGTH} characters`} className="h-[52px] w-full rounded-xl border border-white/10 bg-white/[0.035] pl-12 pr-12 text-sm text-white outline-none transition placeholder:text-slate-600 hover:border-white/15 focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-400/10 disabled:opacity-60" />
                      <button type="button" disabled={busy} onClick={() => setShowPassword((value) => !value)} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 transition hover:bg-white/[0.05] hover:text-slate-200 disabled:opacity-50" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}</button>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-500">Use at least {MIN_NEW_PASSWORD_LENGTH} characters and avoid reusing a password from another service.</p>
                  </div>

                  {error ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-500/[0.07] px-4 py-3 text-sm leading-5 text-red-200">{error}</p> : null}

                  <button type="submit" disabled={busy} className="mt-1 h-[52px] w-full rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-[#03251b] shadow-[0_10px_30px_rgba(16,185,129,0.14)] transition hover:bg-emerald-400 disabled:opacity-60">{busy ? "Creating account..." : "Create account"}</button>
                </form>

                <p className="mt-7 border-t border-white/[0.08] pt-6 text-center text-sm text-slate-500">Already have an account? <Link href="/sign-in" className="font-medium text-emerald-300 transition hover:text-emerald-200">Sign in</Link></p>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
