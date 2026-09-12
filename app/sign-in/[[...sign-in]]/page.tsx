"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useSignIn } from "@clerk/nextjs";
import { ArrowLeft, ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import visual0 from "./login-visual-v2-0";
import visual1 from "./login-visual-v2-1";
import visual2 from "./login-visual-v2-2";
import visual3 from "./login-visual-v2-3";

type Mode = "sign-in" | "forgot";
type RecoveryStep = "email" | "code" | "choice";

const LOGIN_VISUAL = `data:image/webp;base64,${visual0}${visual1}${visual2}${visual3}`;

export default function SignInPage() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("sign-in");
  const [recoveryStep, setRecoveryStep] = useState<RecoveryStep>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState("");

  const busy = fetchStatus === "fetching";

  async function finishSignIn(target = "/dashboard") {
    const { error } = await signIn.finalize({
      navigate: ({ session, decorateUrl }) => {
        if (session?.currentTask) return;
        const url = decorateUrl(target);
        if (url.startsWith("http")) window.location.href = url;
        else router.push(url);
      },
    });

    if (error) setLocalError("We could not finish signing you in. Please try again.");
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError("");

    const { error } = await signIn.password({
      emailAddress: email.trim(),
      password,
    });

    if (error) {
      setLocalError("Email or password is incorrect.");
      return;
    }

    if (signIn.status === "complete") {
      await finishSignIn();
      return;
    }

    if (signIn.status === "needs_client_trust") {
      const emailFactor = signIn.supportedSecondFactors.find((factor) => factor.strategy === "email_code");
      if (emailFactor) {
        await signIn.mfa.sendEmailCode();
        setCode("");
        setLocalError("");
        return;
      }
    }

    if (signIn.status === "needs_second_factor") {
      setLocalError("Additional verification is required for this account.");
      return;
    }

    setLocalError("We could not sign you in. Please try again.");
  }

  async function handleTrustCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError("");

    const { error } = await signIn.mfa.verifyEmailCode({ code: code.trim() });
    if (error) {
      setLocalError("That verification code is not valid.");
      return;
    }

    if (signIn.status === "complete") await finishSignIn();
  }

  async function sendRecoveryCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError("");
    setCode("");

    await signIn.reset();
    const { error: createError } = await signIn.create({ identifier: email.trim() });
    if (createError) {
      setLocalError("We could not start account recovery for that email.");
      return;
    }

    const { error } = await signIn.emailCode.sendCode();
    if (error) {
      setLocalError("We could not send the verification code. Please try again.");
      return;
    }

    setRecoveryStep("code");
  }

  async function verifyRecoveryCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError("");

    const { error } = await signIn.emailCode.verifyCode({ code: code.trim() });
    if (error) {
      setLocalError("That verification code is invalid or has expired.");
      return;
    }

    if (signIn.status !== "complete") {
      setLocalError("We could not complete email verification. Please request a new code.");
      return;
    }

    setRecoveryStep("choice");
  }

  async function resendRecoveryCode() {
    setLocalError("");
    const { error } = await signIn.emailCode.sendCode();
    if (error) setLocalError("We could not send another code yet. Please wait a moment and try again.");
  }

  async function continueWithoutPassword() {
    setLocalError("");
    await finishSignIn("/dashboard");
  }

  async function continueToNewPassword() {
    setLocalError("");
    await finishSignIn("/recovery/new-password");
  }

  function backToSignIn() {
    void signIn.reset();
    setMode("sign-in");
    setRecoveryStep("email");
    setCode("");
    setPassword("");
    setLocalError("");
  }

  const trustCheck = signIn.status === "needs_client_trust" && mode === "sign-in";
  const fieldError =
    errors.fields.identifier?.message ||
    errors.fields.password?.message ||
    errors.fields.code?.message ||
    localError;

  return (
    <main className="min-h-dvh w-full overflow-x-hidden bg-[#06131a] text-white">
      <div className="grid min-h-dvh w-full lg:grid-cols-[52.7%_47.3%]">
        <section className="relative hidden min-h-dvh overflow-hidden lg:block" aria-hidden="true">
          <img src={LOGIN_VISUAL} alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#06131a]/10 via-transparent to-[#06131a]/55" />
        </section>

        <section className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden px-5 py-8 sm:px-8 lg:px-10 xl:px-14">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_85%,rgba(13,148,136,0.23),transparent_34%),linear-gradient(180deg,#06131a_0%,#07161e_100%)]" />

          <div className="relative w-full max-w-[646px] rounded-[28px] border border-teal-500/50 bg-[#07151d]/88 px-6 py-9 shadow-[0_28px_80px_rgba(0,0,0,0.3)] backdrop-blur-xl sm:px-10 sm:py-11 lg:px-12 xl:px-14">
            {mode === "sign-in" && !trustCheck && (
              <>
                <div className="mb-8">
                  <h1 className="text-4xl font-semibold tracking-[-0.04em] text-white sm:text-[42px]">Welcome back</h1>
                  <p className="mt-2 text-base text-slate-400 sm:text-lg">Sign in to manage your business</p>
                </div>

                <form onSubmit={handleSignIn} className="space-y-5">
                  <div>
                    <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-100">Email address</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                      <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="h-12 w-full rounded-xl border border-slate-600/80 bg-[#0b1921] pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-teal-400 focus:ring-1 focus:ring-teal-400" />
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-4">
                      <label htmlFor="password" className="text-sm font-medium text-slate-100">Password</label>
                      <button type="button" onClick={() => { setMode("forgot"); setRecoveryStep("email"); setLocalError(""); }} className="text-xs font-medium text-teal-300 hover:text-teal-200">Forgot password?</button>
                    </div>
                    <div className="relative">
                      <LockKeyhole className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                      <input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" className="h-12 w-full rounded-xl border border-slate-600/80 bg-[#0b1921] pl-11 pr-11 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-teal-400 focus:ring-1 focus:ring-teal-400" />
                      <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-2 text-slate-500 hover:text-slate-300">
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </div>

                  {fieldError && <p className="text-sm text-rose-300">{fieldError}</p>}
                  <button disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#18c4ad] to-[#10967f] text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60">
                    {busy ? "Signing in..." : "Sign in"}
                    {!busy && <ArrowRight className="size-4" />}
                  </button>
                </form>

                <div className="my-7 flex items-center gap-4">
                  <div className="h-px flex-1 bg-slate-700/70" />
                  <span className="text-xs text-slate-500">or</span>
                  <div className="h-px flex-1 bg-slate-700/70" />
                </div>

                <p className="text-center text-sm text-slate-400">New to MunshiOS? <Link href="/sign-up" className="font-medium text-teal-300 hover:text-teal-200">Create account</Link></p>
              </>
            )}

            {trustCheck && (
              <>
                <div className="mb-8">
                  <h1 className="text-3xl font-semibold tracking-[-0.03em]">Verify this device</h1>
                  <p className="mt-2 text-sm text-slate-400">Enter the verification code sent to your email.</p>
                </div>
                <form onSubmit={handleTrustCode} className="space-y-5">
                  <div>
                    <label htmlFor="trust-code" className="mb-2 block text-sm font-medium text-slate-100">Verification code</label>
                    <input id="trust-code" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} className="h-12 w-full rounded-xl border border-slate-600/80 bg-[#0b1921] px-4 text-sm tracking-[0.25em] text-white outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400" />
                  </div>
                  {fieldError && <p className="text-sm text-rose-300">{fieldError}</p>}
                  <button disabled={busy} className="h-12 w-full rounded-xl bg-gradient-to-r from-[#18c4ad] to-[#10967f] text-sm font-semibold disabled:opacity-60">{busy ? "Verifying..." : "Verify and continue"}</button>
                  <button type="button" onClick={() => void signIn.mfa.sendEmailCode()} className="w-full text-center text-sm text-teal-300">Send another code</button>
                </form>
              </>
            )}

            {mode === "forgot" && (
              <>
                {recoveryStep !== "choice" && (
                  <button type="button" onClick={backToSignIn} className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
                    <ArrowLeft className="size-4" /> Back to sign in
                  </button>
                )}

                <div className="mb-8">
                  <h1 className="text-3xl font-semibold tracking-[-0.03em]">
                    {recoveryStep === "email" ? "Recover your account" : recoveryStep === "code" ? "Check your email" : "Email verified"}
                  </h1>
                  <p className="mt-2 text-sm text-slate-400">
                    {recoveryStep === "email"
                      ? "We will send a one-time verification code to your email."
                      : recoveryStep === "code"
                        ? `Enter the verification code sent to ${email.trim() || "your email"}.`
                        : "Your identity has been verified. Choose how you want to continue."}
                  </p>
                </div>

                {recoveryStep === "email" && (
                  <form onSubmit={sendRecoveryCode} className="space-y-5">
                    <div>
                      <label htmlFor="recovery-email" className="mb-2 block text-sm font-medium text-slate-100">Email address</label>
                      <input id="recovery-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="h-12 w-full rounded-xl border border-slate-600/80 bg-[#0b1921] px-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-teal-400 focus:ring-1 focus:ring-teal-400" />
                    </div>
                    {fieldError && <p className="text-sm text-rose-300">{fieldError}</p>}
                    <button disabled={busy} className="h-12 w-full rounded-xl bg-gradient-to-r from-[#18c4ad] to-[#10967f] text-sm font-semibold disabled:opacity-60">{busy ? "Sending..." : "Send verification code"}</button>
                  </form>
                )}

                {recoveryStep === "code" && (
                  <form onSubmit={verifyRecoveryCode} className="space-y-5">
                    <div>
                      <label htmlFor="recovery-code" className="mb-2 block text-sm font-medium text-slate-100">Verification code</label>
                      <input id="recovery-code" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} className="h-12 w-full rounded-xl border border-slate-600/80 bg-[#0b1921] px-4 text-sm tracking-[0.25em] text-white outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400" />
                    </div>
                    {fieldError && <p className="text-sm text-rose-300">{fieldError}</p>}
                    <button disabled={busy} className="h-12 w-full rounded-xl bg-gradient-to-r from-[#18c4ad] to-[#10967f] text-sm font-semibold disabled:opacity-60">{busy ? "Verifying..." : "Verify code"}</button>
                    <button type="button" disabled={busy} onClick={() => void resendRecoveryCode()} className="w-full text-center text-sm text-teal-300 disabled:opacity-60">Send another code</button>
                  </form>
                )}

                {recoveryStep === "choice" && (
                  <div className="space-y-4">
                    {fieldError && <p className="text-sm text-rose-300">{fieldError}</p>}
                    <button type="button" disabled={busy} onClick={() => void continueWithoutPassword()} className="flex min-h-14 w-full items-center justify-between rounded-xl bg-gradient-to-r from-[#18c4ad] to-[#10967f] px-5 text-left text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-60">
                      <span>
                        <span className="block">Continue to MunshiOS</span>
                        <span className="mt-0.5 block text-xs font-normal text-white/75">Sign in now without changing your password</span>
                      </span>
                      <ArrowRight className="size-4" />
                    </button>

                    <button type="button" disabled={busy} onClick={() => void continueToNewPassword()} className="flex min-h-14 w-full items-center justify-between rounded-xl border border-slate-600 bg-[#0b1921] px-5 text-left text-sm font-semibold text-white transition hover:border-teal-400 disabled:opacity-60">
                      <span>
                        <span className="block">Create a new password</span>
                        <span className="mt-0.5 block text-xs font-normal text-slate-400">Stay signed in and replace the forgotten password</span>
                      </span>
                      <LockKeyhole className="size-4 text-teal-300" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
