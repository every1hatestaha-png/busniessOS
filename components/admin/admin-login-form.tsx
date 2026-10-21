"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ShieldCheck, LockKeyhole, Mail, ArrowRight } from "lucide-react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function AdminLoginForm() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const identifier = email.trim().toLowerCase();
    if (!identifier || !password) {
      setError("Enter your administrator email and password.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: identifier,
        password,
      });
      if (authError) {
        setError(authError.status === 429 ? "Too many attempts. Please wait before retrying." : "Unable to sign in. Check your credentials and try again.");
        setPassword("");
        return;
      }
      // The server checks verified email AND immutable user ID. The security
      // screen enforces TOTP before any admin dashboard or mutation access.
      window.location.replace("/admin/security");
    } catch {
      setError("Sign-in service unavailable. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#081219] px-4 py-12 text-white">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3">
            <ShieldCheck className="size-8 text-emerald-300" aria-hidden="true" />
          </div>
          <div>
            <p className="text-2xl font-semibold tracking-tight">MunshiOS</p>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Administration</p>
          </div>
        </div>
        <section className="rounded-2xl border border-white/10 bg-[#101e28] px-6 py-8 shadow-2xl sm:px-8">
          <h1 className="text-2xl font-semibold">Administrator sign in</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">Restricted owner access. Sign in with your administrator account, then verify your authenticator.</p>
          <form onSubmit={signIn} className="mt-7 space-y-5">
            <div>
              <label htmlFor="admin-email" className="mb-2 block text-sm font-medium">Administrator email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-slate-400" aria-hidden="true" />
                <input id="admin-email" type="email" name="email" autoComplete="username" autoCapitalize="none" spellCheck={false}
                  required maxLength={254} disabled={busy} value={email} onChange={(event) => setEmail(event.target.value)}
                  placeholder="Your admin email" className="h-11 w-full rounded-xl border border-slate-600 bg-[#0b1821] pl-10 pr-3 text-sm text-white outline-none focus:border-emerald-400" />
              </div>
            </div>
            <div>
              <label htmlFor="admin-password" className="mb-2 block text-sm font-medium">Password</label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-slate-400" aria-hidden="true" />
                <input id="admin-password" type="password" name="password" autoComplete="current-password" required disabled={busy}
                  value={password} onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter password" className="h-11 w-full rounded-xl border border-slate-600 bg-[#0b1821] pl-10 pr-3 text-sm text-white outline-none focus:border-emerald-400" />
              </div>
            </div>
            {error && <p role="alert" className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">{error}</p>}
            <button type="submit" disabled={busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 text-sm font-semibold text-[#042719] hover:bg-emerald-300 disabled:opacity-60">
              {busy ? "Verifying credentials..." : "Continue to security verification"} <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          </form>
          <p className="mt-6 text-center text-xs leading-5 text-slate-400">Only the registered platform owner can access this area. Authenticator verification is mandatory.</p>
        </section>
        <p className="mt-6 text-center text-xs text-slate-500">MunshiOS private administration</p>
      </div>
    </main>
  );
}
