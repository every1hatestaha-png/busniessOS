"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useSignIn } from "@clerk/nextjs";

export default function ForgotPasswordPage() {
  const { signIn, fetchStatus } = useSignIn();
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code" | "password">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const busy = fetchStatus === "fetching";

  async function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setCode("");

    await signIn.reset();
    const { error: createError } = await signIn.create({ identifier: email.trim() });
    if (createError) {
      setError(createError.message || "We could not find that account.");
      return;
    }

    const { error: sendError } = await signIn.resetPasswordEmailCode.sendCode();
    if (sendError) {
      setError(sendError.message || "We could not send the reset code.");
      return;
    }

    setStep("code");
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const { error: verifyError } = await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() });
    if (verifyError) {
      setError(verifyError.message || "That reset code is invalid or expired.");
      return;
    }

    setStep("password");
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      setError(passwordError.message || "We could not update the password.");
      return;
    }

    if (signIn.status === "complete") {
      const { error: finalizeError } = await signIn.finalize({
        navigate: ({ session, decorateUrl }) => {
          if (session?.currentTask) return;
          const url = decorateUrl("/dashboard");
          if (url.startsWith("http")) window.location.href = url;
          else router.push(url);
        },
      });
      if (finalizeError) setError("Password changed, but sign-in could not be finalized. Go back to sign in and use the new password.");
      return;
    }

    setError("Password was updated. Return to sign in and use the new password.");
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-[#06131a] px-5 py-10 text-white">
      <section className="w-full max-w-lg rounded-[28px] border border-teal-500/50 bg-[#07151d] p-7 shadow-2xl sm:p-10">
        <button type="button" onClick={() => router.push("/sign-in")} className="mb-6 text-sm text-slate-400 hover:text-white">← Back to sign in</button>
        <h1 className="text-3xl font-semibold tracking-[-0.03em]">Reset your password</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          {step === "email" ? "Enter your account email and we will send a password reset code." : step === "code" ? `Enter the code sent to ${email}.` : "Choose a new password for your MunshiOS account."}
        </p>

        {step === "email" && (
          <form onSubmit={sendCode} className="mt-8 space-y-5">
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="h-12 w-full rounded-xl border border-slate-600/80 bg-[#0b1921] px-4 text-sm text-white outline-none focus:border-teal-400" />
            {error && <p className="text-sm text-rose-300">{error}</p>}
            <button disabled={busy} className="h-12 w-full rounded-xl bg-gradient-to-r from-[#18c4ad] to-[#10967f] text-sm font-semibold disabled:opacity-60">{busy ? "Sending..." : "Send reset code"}</button>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={verifyCode} className="mt-8 space-y-5">
            <input inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="Reset code" className="h-12 w-full rounded-xl border border-slate-600/80 bg-[#0b1921] px-4 text-sm tracking-[0.25em] text-white outline-none focus:border-teal-400" />
            {error && <p className="text-sm text-rose-300">{error}</p>}
            <button disabled={busy} className="h-12 w-full rounded-xl bg-gradient-to-r from-[#18c4ad] to-[#10967f] text-sm font-semibold disabled:opacity-60">{busy ? "Verifying..." : "Verify code"}</button>
          </form>
        )}

        {step === "password" && (
          <form onSubmit={submitPassword} className="mt-8 space-y-5">
            <input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" className="h-12 w-full rounded-xl border border-slate-600/80 bg-[#0b1921] px-4 text-sm text-white outline-none focus:border-teal-400" />
            <input type="password" autoComplete="new-password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" className="h-12 w-full rounded-xl border border-slate-600/80 bg-[#0b1921] px-4 text-sm text-white outline-none focus:border-teal-400" />
            {error && <p className="text-sm text-rose-300">{error}</p>}
            <button disabled={busy} className="h-12 w-full rounded-xl bg-gradient-to-r from-[#18c4ad] to-[#10967f] text-sm font-semibold disabled:opacity-60">{busy ? "Updating..." : "Set new password"}</button>
          </form>
        )}
      </section>
    </main>
  );
}
