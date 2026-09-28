"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type RecoveryStep = "email" | "code" | "choice";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<RecoveryStep>("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const verifiedByLink = new URLSearchParams(window.location.search).get("verified") === "1";
    if (!verifiedByLink) return;

    let active = true;
    void supabase.auth.getUser().then(({ data, error: authError }) => {
      if (!active) return;
      if (!authError && data.user) setStep("choice");
    });
    return () => {
      active = false;
    };
  }, [supabase]);

  async function sendRecoveryCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (busy) return;

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
        setError("Too many recovery attempts. Wait a moment and try again.");
        return;
      }

      if (!response.ok) {
        setError("We could not send a recovery code right now. Please try again.");
        return;
      }

      setEmail(identifier);
      setCode("");
      setStep("code");
    } catch {
      setError("We could not send a recovery code right now. Please try again.");
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

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: identifier,
      token,
      type: "email",
    });

    setBusy(false);

    if (verifyError) {
      setError("That confirmation code is invalid or has expired.");
      return;
    }

    setStep("choice");
  }

  function continueWithoutChangingPassword() {
    window.location.assign("/dashboard");
  }

  function changePassword() {
    router.push("/recovery/new-password");
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-[#06131a] px-4 py-10 text-white">
      <div className="w-full max-w-md rounded-3xl border border-teal-500/40 bg-[#07151d] p-7 shadow-2xl">
        <h1 className="text-3xl font-semibold">Recover or activate your account</h1>

        {step === "email" ? (
          <>
            <p className="mt-2 text-sm leading-6 text-slate-400">Enter the email already attached to your MunshiOS account. Existing customers from the previous login system can use this once to activate Supabase access without losing any business data.</p>
            <form onSubmit={sendRecoveryCode} className="mt-6 space-y-4">
              <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="h-12 w-full rounded-xl border border-slate-600 bg-[#0b1921] px-4 text-sm outline-none focus:border-teal-400" />
              {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
              <button type="submit" disabled={busy} className="h-12 w-full rounded-xl bg-emerald-600 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-60">{busy ? "Sending..." : "Send confirmation code"}</button>
            </form>
          </>
        ) : null}

        {step === "code" ? (
          <>
            <p className="mt-2 text-sm text-slate-400">If this email belongs to a MunshiOS account, a confirmation code has been sent to {email.trim().toLowerCase()}.</p>
            <form onSubmit={verifyRecoveryCode} className="mt-6 space-y-4">
              <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={8} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="Confirmation code" className="h-12 w-full rounded-xl border border-slate-600 bg-[#0b1921] px-4 text-center text-lg tracking-[0.28em] outline-none focus:border-teal-400" />
              {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
              <button type="submit" disabled={busy} className="h-12 w-full rounded-xl bg-emerald-600 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-60">{busy ? "Verifying..." : "Verify code"}</button>
              <button type="button" disabled={busy} onClick={() => void sendRecoveryCode()} className="h-11 w-full rounded-xl border border-slate-600 text-sm font-medium text-slate-200 hover:border-teal-400 disabled:opacity-60">Resend code</button>
              <button type="button" disabled={busy} onClick={() => { setStep("email"); setCode(""); setError(""); }} className="w-full text-sm text-slate-400 hover:text-white">Use another email</button>
            </form>
          </>
        ) : null}

        {step === "choice" ? (
          <>
            <p className="mt-2 text-sm text-slate-400">Email verified. Your existing MunshiOS account is now authenticated with Supabase.</p>
            <div className="mt-5 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-50">
              For permanent email + password login, choose <strong>Change password</strong> once. Your previous Clerk password is not transferred to Supabase. You can still continue to the dashboard now if you prefer.
            </div>
            <div className="mt-6 space-y-3">
              <button type="button" onClick={continueWithoutChangingPassword} className="h-12 w-full rounded-xl bg-emerald-600 text-sm font-semibold hover:bg-emerald-500">Continue to dashboard</button>
              <button type="button" onClick={changePassword} className="h-12 w-full rounded-xl border border-teal-500/50 bg-[#0b1921] text-sm font-semibold text-teal-100 hover:border-teal-400">Change password for permanent login</button>
            </div>
          </>
        ) : null}

        <Link href="/sign-in" className="mt-6 inline-block text-sm text-teal-300 hover:text-teal-200">Back to sign in</Link>
      </div>
    </main>
  );
}
