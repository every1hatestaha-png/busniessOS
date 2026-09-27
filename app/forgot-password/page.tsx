"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");

    const identifier = email.trim().toLowerCase();
    if (!identifier) {
      setError("Enter your email address.");
      setBusy(false);
      return;
    }

    const redirectTo = `${window.location.origin}/auth/callback?next=/recovery/new-password`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(identifier, { redirectTo });
    if (resetError) {
      setError(resetError.message);
      setBusy(false);
      return;
    }

    setSent(true);
    setBusy(false);
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-[#06131a] px-4 py-10 text-white">
      <div className="w-full max-w-md rounded-3xl border border-teal-500/40 bg-[#07151d] p-7 shadow-2xl">
        <h1 className="text-3xl font-semibold">Reset password</h1>
        <p className="mt-2 text-sm text-slate-400">We will send a secure reset link to your email.</p>

        {sent ? (
          <div className="mt-6 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            If an account exists for that email, a reset link has been sent.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="h-12 w-full rounded-xl border border-slate-600 bg-[#0b1921] px-4 text-sm outline-none focus:border-teal-400" />
            {error ? <p className="text-sm text-red-300">{error}</p> : null}
            <button type="submit" disabled={busy} className="h-12 w-full rounded-xl bg-emerald-600 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-60">{busy ? "Sending..." : "Send reset link"}</button>
          </form>
        )}

        <Link href="/sign-in" className="mt-6 inline-block text-sm text-teal-300 hover:text-teal-200">Back to sign in</Link>
      </div>
    </main>
  );
}
