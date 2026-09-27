"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { CheckCircle2, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";

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
    if (!identifier || password.length < 8) {
      setError("Use a valid email and a password with at least 8 characters.");
      setBusy(false);
      return;
    }

    const origin = window.location.origin;
    const { error: signUpError } = await supabase.auth.signUp({
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
      setError(signUpError.message);
      setBusy(false);
      return;
    }

    setSent(true);
    setBusy(false);
  }

  return (
    <main className="min-h-dvh w-full overflow-x-hidden bg-[#06131a] text-white">
      <div className="grid min-h-dvh w-full lg:grid-cols-[52.7%_47.3%]">
        <section className="relative hidden min-h-dvh overflow-hidden lg:block" aria-hidden="true">
          <Image src={LOGIN_VISUAL} alt="" fill sizes="53vw" priority className="object-cover object-center" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#06131a]/10 via-transparent to-[#06131a]/55" />
        </section>

        <section className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden px-5 py-8 sm:px-8 lg:px-10 xl:px-14">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_85%,rgba(13,148,136,0.23),transparent_34%),linear-gradient(180deg,#06131a_0%,#07161e_100%)]" />
          <div className="relative w-full max-w-[646px] rounded-[28px] border border-teal-500/50 bg-[#07151d]/88 px-6 py-9 shadow-[0_28px_80px_rgba(0,0,0,0.3)] backdrop-blur-xl sm:px-10 sm:py-11 lg:px-12 xl:px-14">
            {sent ? (
              <div className="py-8 text-center">
                <CheckCircle2 className="mx-auto size-12 text-emerald-400" />
                <h1 className="mt-5 text-3xl font-semibold">Check your email</h1>
                <p className="mt-3 text-slate-400">We sent a verification link to {email.trim().toLowerCase()}.</p>
                <Link href="/sign-in" className="mt-7 inline-flex rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-500">Back to sign in</Link>
              </div>
            ) : (
              <>
                <div className="mb-8">
                  <h1 className="text-4xl font-semibold tracking-[-0.04em] text-white sm:text-[42px]">Create your account</h1>
                  <p className="mt-2 text-base text-slate-400 sm:text-lg">Start using MunshiOS</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" className="h-12 rounded-xl border border-slate-600/80 bg-[#0b1921] px-4 text-sm text-white outline-none focus:border-teal-400" />
                    <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" className="h-12 rounded-xl border border-slate-600/80 bg-[#0b1921] px-4 text-sm text-white outline-none focus:border-teal-400" />
                  </div>

                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                    <input type="email" autoComplete="email" required disabled={busy} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="h-12 w-full rounded-xl border border-slate-600/80 bg-[#0b1921] pl-11 pr-4 text-sm text-white outline-none focus:border-teal-400 disabled:opacity-60" />
                  </div>

                  <div className="relative">
                    <LockKeyhole className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                    <input type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} required disabled={busy} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password, minimum 8 characters" className="h-12 w-full rounded-xl border border-slate-600/80 bg-[#0b1921] pl-11 pr-11 text-sm text-white outline-none focus:border-teal-400 disabled:opacity-60" />
                    <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-2 text-slate-400 hover:text-white" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
                  </div>

                  {error ? <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}

                  <button type="submit" disabled={busy} className="h-12 w-full rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60">{busy ? "Creating account..." : "Create account"}</button>
                </form>

                <p className="mt-7 text-center text-sm text-slate-400">Already have an account? <Link href="/sign-in" className="font-medium text-teal-300 hover:text-teal-200">Sign in</Link></p>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
