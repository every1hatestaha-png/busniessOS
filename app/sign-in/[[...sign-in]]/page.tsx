"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const LOGIN_VISUAL = "/auth/faisal-mosque.webp";

function safeDestination(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/sign-in")) return "/dashboard";
  return value;
}

export default function SignInPage() {
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(searchParams.get("error") || "");
  const [showMigrationHelp, setShowMigrationHelp] = useState(false);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setShowMigrationHelp(false);

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
      if (signInError.message === "Invalid login credentials") {
        setError("Email or password is incorrect.");
        setShowMigrationHelp(true);
      } else {
        setError("We could not sign you in right now. Please try again.");
      }
      setBusy(false);
      return;
    }

    window.location.assign(safeDestination(searchParams.get("redirect_url")));
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
            <div className="mb-8">
              <h1 className="text-4xl font-semibold tracking-[-0.04em] text-white sm:text-[42px]">Welcome back</h1>
              <p className="mt-2 text-base text-slate-400 sm:text-lg">Sign in to manage your business</p>
            </div>

            <form onSubmit={handleSignIn} className="space-y-5">
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-100">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                  <input id="email" type="email" autoComplete="email" required disabled={busy} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="h-12 w-full rounded-xl border border-slate-600/80 bg-[#0b1921] pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-teal-400 focus:ring-1 focus:ring-teal-400 disabled:opacity-60" />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-4">
                  <label htmlFor="password" className="text-sm font-medium text-slate-100">Password</label>
                  <Link href="/forgot-password" className="text-xs font-medium text-teal-300 hover:text-teal-200">Forgot password?</Link>
                </div>
                <div className="relative">
                  <LockKeyhole className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                  <input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required disabled={busy} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" className="h-12 w-full rounded-xl border border-slate-600/80 bg-[#0b1921] pl-11 pr-11 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-teal-400 focus:ring-1 focus:ring-teal-400 disabled:opacity-60" />
                  <button type="button" disabled={busy} onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-2 text-slate-400 hover:text-white">
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              {error ? <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}

              {showMigrationHelp ? (
                <div className="rounded-xl border border-teal-400/30 bg-teal-500/10 px-4 py-3 text-sm leading-6 text-teal-50">
                  Existing MunshiOS customer from the previous login system? Your old password may not work after the auth migration. Verify your email once and choose a new password to activate permanent Supabase login.
                  <Link href="/forgot-password" className="ml-1 font-semibold text-teal-300 underline underline-offset-2 hover:text-teal-200">Activate existing account</Link>
                </div>
              ) : null}

              <button type="submit" disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60">
                {busy ? "Signing in..." : "Sign in"}
                {!busy ? <ArrowRight className="size-4" /> : null}
              </button>
            </form>

            <div className="mt-5 rounded-xl border border-slate-700/80 bg-[#0b1921]/70 px-4 py-3 text-sm text-slate-300">
              Used MunshiOS before the login-system upgrade? <Link href="/forgot-password" className="font-medium text-teal-300 hover:text-teal-200">Activate your existing account with an email code</Link>.
            </div>

            <p className="mt-7 text-center text-sm text-slate-400">
              New to MunshiOS? <Link href="/sign-up" className="font-medium text-teal-300 hover:text-teal-200">Create an account</Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
