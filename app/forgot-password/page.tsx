"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useClerk, useSignIn } from "@clerk/nextjs";

export default function ForgotPasswordPage() {
  const { signIn, fetchStatus } = useSignIn();
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code" | "password">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [sessionPreparationFailed, setSessionPreparationFailed] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const sessionPreparing = !sessionPreparationFailed && (!isLoaded || Boolean(isSignedIn));
  const busy = fetchStatus === "fetching" || actionBusy || sessionPreparing;

  useEffect(() => {
    if (!isLoaded || !isSignedIn || sessionPreparationFailed) return;

    let cancelled = false;

    void signOut({ redirectUrl: "/forgot-password?recovery=1" }).catch(() => {
      if (cancelled) return;
      setSessionPreparationFailed(true);
      setError("We could not prepare password recovery. Please refresh this page and try again.");
    });

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, sessionPreparationFailed, signOut]);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setInterval(() => setResendSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  async function runOnce(action: () => Promise<void>) {
    if (busy) return;
    setActionBusy(true);
    try {
      await action();
    } catch {
      setError("Something went wrong. Please wait a moment and try again.");
    } finally {
      setActionBusy(false);
    }
  }

  async function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runOnce(async () => {
      setError("");
      setCode("");

      const identifier = email.trim().toLowerCase();
      if (!identifier) {
        setError("Enter your account email.");
        return;
      }

      await signIn.reset();
      const { error: createError } = await signIn.create({ identifier });
      if (createError) {
        const message = typeof createError === "object" && createError && "message" in createError
          ? String(createError.message)
          : "";
        setError(message || "We could not start password recovery. Please refresh the page and try again.");
        return;
      }

      const { error: sendError } = await signIn.resetPasswordEmailCode.sendCode();
      if (sendError) {
        const message = typeof sendError === "object" && sendError && "message" in sendError
          ? String(sendError.message)
          : "";
        setError(message || "We could not send a reset code right now. Please wait before trying again.");
        return;
      }

      setEmail(identifier);
      setResendSeconds(60);
      setStep("code");
    });
  }

  async function resendCode() {
    if (resendSeconds > 0 || busy) return;
    await runOnce(async () => {
      setError("");
      const { error: sendError } = await signIn.resetPasswordEmailCode.sendCode();
      if (sendError) {
        setError("We could not resend a code right now. Please wait and try again.");
        return;
      }
      setCode("");
      setResendSeconds(60);
    });
  }

  async function restartRecovery() {
    if (busy) return;
    await runOnce(async () => {
      await signIn.reset();
      setCode("");
      setPassword("");
      setConfirmPassword("");
      setError("");
      setResendSeconds(0);
      setStep("email");
    });
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runOnce(async () => {
      setError("");
      const enteredCode = code.trim();
      if (!enteredCode) {
        setError("Enter the reset code from your email.");
        return;
      }

      const { error: verifyError } = await signIn.resetPasswordEmailCode.verifyCode({ code: enteredCode });
      if (verifyError) {
        setError("That reset code is invalid or expired.");
        return;
      }

      setStep("password");
    });
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runOnce(async () => {
      setError("");

      if (password.length < 8) {
        setError("Use at least 8 characters for the new password.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }

      const { error: passwordError } = await signIn.resetPasswordEmailCode.submitPassword({
        password,
        signOutOfOtherSessions: true,
      });
      if (passwordError) {
        setError("We could not update the password. Please restart password recovery and try again.");
        return;
      }

      if (signIn.status === "complete") {
        const { error: finalizeError } = await signIn.finalize({
          navigate: ({ session, decorateUrl }) => {
            if (session?.currentTask) return;
            const url = decorateUrl("/platform/sign-in?reauth=1");
            if (url.startsWith("http")) window.location.href = url;
            else router.push(url);
          },
        });
        if (finalizeError) {
          setError("Password changed. Return to owner sign in and use the new password.");
        }
        return;
      }

      router.push("/platform/sign-in?reauth=1");
    });
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-[#06131a] px-5 py-10 text-white">
      <section className="w-full max-w-lg rounded-[28px] border border-teal-500/50 bg-[#07151d] p-7 shadow-2xl sm:p-10">
        <button type="button" disabled={busy} onClick={() => router.push("/platform/sign-in")} className="mb-6 text-sm text-slate-400 hover:text-white disabled:opacity-50">← Back to owner sign in</button>
        <h1 className="text-3xl font-semibold tracking-[-0.03em]">Reset your password</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          {sessionPreparing ? "Preparing secure password recovery..." : step === "email" ? "Enter your account email and we will send a password reset code." : step === "code" ? `Enter the code sent to ${email}.` : "Choose a new password for your MunshiOS account."}
        </p>

        {sessionPreparing && <div className="mt-8 rounded-xl border border-slate-700 bg-[#0b1921] px-4 py-4 text-sm text-slate-300">Signing out the current session so Clerk can start a clean password recovery attempt...</div>}

        {!sessionPreparing && step === "email" && (
          <form onSubmit={sendCode} className="mt-8 space-y-5">
            <input type="email" autoComplete="email" required disabled={busy} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="h-12 w-full rounded-xl border border-slate-600/80 bg-[#0b1921] px-4 text-sm text-white outline-none focus:border-teal-400 disabled:opacity-60" />
            {error && <p className="text-sm text-rose-300">{error}</p>}
            <button type="submit" disabled={busy} className="h-12 w-full rounded-xl bg-gradient-to-r from-[#18c4ad] to-[#10967f] text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60">{busy ? "Sending..." : "Send reset code"}</button>
          </form>
        )}

        {!sessionPreparing && step === "code" && (
          <form onSubmit={verifyCode} className="mt-8 space-y-5">
            <input inputMode="numeric" autoComplete="one-time-code" required disabled={busy} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Reset code" className="h-12 w-full rounded-xl border border-slate-600/80 bg-[#0b1921] px-4 text-sm tracking-[0.25em] text-white outline-none focus:border-teal-400 disabled:opacity-60" />
            {error && <p className="text-sm text-rose-300">{error}</p>}
            <button type="submit" disabled={busy} className="h-12 w-full rounded-xl bg-gradient-to-r from-[#18c4ad] to-[#10967f] text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60">{busy ? "Verifying..." : "Verify code"}</button>
            <div className="flex items-center justify-between gap-3 text-xs">
              <button type="button" disabled={busy || resendSeconds > 0} onClick={resendCode} className="text-teal-300 hover:text-teal-200 disabled:cursor-not-allowed disabled:text-slate-500">{resendSeconds > 0 ? `Resend in ${resendSeconds}s` : "Resend code"}</button>
              <button type="button" disabled={busy} onClick={restartRecovery} className="text-slate-400 hover:text-white disabled:opacity-50">Use a different email</button>
            </div>
          </form>
        )}

        {!sessionPreparing && step === "password" && (
          <form onSubmit={submitPassword} className="mt-8 space-y-5">
            <input type="password" autoComplete="new-password" required disabled={busy} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" className="h-12 w-full rounded-xl border border-slate-600/80 bg-[#0b1921] px-4 text-sm text-white outline-none focus:border-teal-400 disabled:opacity-60" />
            <input type="password" autoComplete="new-password" required disabled={busy} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" className="h-12 w-full rounded-xl border border-slate-600/80 bg-[#0b1921] px-4 text-sm text-white outline-none focus:border-teal-400 disabled:opacity-60" />
            {error && <p className="text-sm text-rose-300">{error}</p>}
            <button type="submit" disabled={busy} className="h-12 w-full rounded-xl bg-gradient-to-r from-[#18c4ad] to-[#10967f] text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60">{busy ? "Updating..." : "Set new password"}</button>
          </form>
        )}
      </section>
    </main>
  );
}
