"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useClerk, useSignIn } from "@clerk/nextjs";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
const LOGIN_VISUAL = "/auth/faisal-mosque.webp";

function signInDestination() {
  if (typeof window === "undefined") return "/dashboard";
  const current = new URLSearchParams(window.location.search);
  const redirectUrl = current.get("redirect_url");
  if (redirectUrl?.startsWith("/") && !redirectUrl.startsWith("//") && !redirectUrl.startsWith("/sign-in")) {
    return redirectUrl;
  }

  const onboarding = new URLSearchParams();
  for (const key of ["business", "modules", "billing"] as const) {
    const value = current.get(key);
    if (value) onboarding.set(key, value);
  }
  const query = onboarding.toString();
  return query ? `/onboarding?${query}` : "/dashboard";
}

function signUpDestination() {
  if (typeof window === "undefined") return "/sign-up";
  const current = new URLSearchParams(window.location.search);
  const next = new URLSearchParams();
  for (const key of ["business", "modules", "billing"] as const) {
    const value = current.get(key);
    if (value) next.set(key, value);
  }
  const query = next.toString();
  return query ? `/sign-up?${query}` : "/sign-up";
}

type VerificationStrategy = "email_code_first_factor" | "email_code" | "phone_code" | "totp" | "backup_code";

export default function SignInPage() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const { signOut } = useClerk();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [verificationStrategy, setVerificationStrategy] = useState<VerificationStrategy | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  const busy = fetchStatus === "fetching" || actionBusy;

  async function runOnce(action: () => Promise<void>) {
    if (busy) return;
    setActionBusy(true);
    try {
      await action();
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "Something went wrong. Please try again.");
    } finally {
      setActionBusy(false);
    }
  }

  async function finishSignIn(target = signInDestination()) {
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

  async function beginSecondFactor(preferDeviceTrustEmail = false) {
    const supported = new Set((signIn.supportedSecondFactors ?? []).map((factor) => factor.strategy));
    let strategy: VerificationStrategy | null = null;

    if (preferDeviceTrustEmail && supported.has("email_code")) strategy = "email_code";
    else if (supported.has("email_code")) strategy = "email_code";
    else if (supported.has("phone_code")) strategy = "phone_code";
    else if (supported.has("totp")) strategy = "totp";
    else if (supported.has("backup_code")) strategy = "backup_code";

    if (!strategy) {
      setLocalError("This account requires a verification method that is not available. Use account recovery or contact the administrator.");
      return;
    }

    if (strategy === "email_code") {
      const { error } = await signIn.mfa.sendEmailCode();
      if (error) {
        setLocalError("We could not send the verification email. Please try again.");
        return;
      }
    } else if (strategy === "phone_code") {
      const { error } = await signIn.mfa.sendPhoneCode();
      if (error) {
        setLocalError("We could not send the verification code. Please try again.");
        return;
      }
    }

    setCode("");
    setVerificationStrategy(strategy);
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runOnce(async () => {
      setLocalError("");
      setVerificationStrategy(null);
      const identifier = email.trim().toLowerCase();
      if (!identifier || !password) {
        setLocalError("Enter your email and password.");
        return;
      }

      const { error } = await signIn.password({ emailAddress: identifier, password });
      if (error) {
        setLocalError(errors.fields.identifier?.message || errors.fields.password?.message || "Email or password is incorrect. You can also sign in with an email code below.");
        return;
      }

      if (signIn.status === "complete") {
        await finishSignIn();
        return;
      }

      if (signIn.status === "needs_client_trust") {
        await beginSecondFactor(true);
        return;
      }

      if (signIn.status === "needs_second_factor") {
        await beginSecondFactor(false);
        return;
      }

      if (signIn.status === "needs_new_password") {
        setLocalError("This account needs a new password. Use Forgot password to continue securely.");
        return;
      }

      setLocalError("We could not sign you in. Please try again.");
    });
  }

  async function handleEmailCodeSignIn() {
    await runOnce(async () => {
      setLocalError("");
      setVerificationStrategy(null);
      const identifier = email.trim().toLowerCase();
      if (!identifier) {
        setLocalError("Enter your email address first.");
        return;
      }

      await signIn.reset();
      const { error } = await signIn.emailCode.sendCode({ emailAddress: identifier });
      if (error) {
        setLocalError(errors.fields.identifier?.message || "We could not send a sign-in code. Check the email address and try again.");
        return;
      }

      setCode("");
      setVerificationStrategy("email_code_first_factor");
    });
  }

  async function handleVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runOnce(async () => {
      setLocalError("");
      const value = code.trim();
      if (!value || !verificationStrategy) {
        setLocalError("Enter the verification code.");
        return;
      }

      let error: unknown = null;
      if (verificationStrategy === "email_code_first_factor") ({ error } = await signIn.emailCode.verifyCode({ code: value }));
      else if (verificationStrategy === "email_code") ({ error } = await signIn.mfa.verifyEmailCode({ code: value }));
      else if (verificationStrategy === "phone_code") ({ error } = await signIn.mfa.verifyPhoneCode({ code: value }));
      else if (verificationStrategy === "totp") ({ error } = await signIn.mfa.verifyTOTP({ code: value }));
      else ({ error } = await signIn.mfa.verifyBackupCode({ code: value }));

      if (error) {
        setLocalError("That verification code is not valid.");
        return;
      }

      if (signIn.status === "complete") {
        await finishSignIn();
        return;
      }

      if (signIn.status === "needs_client_trust") {
        await beginSecondFactor(true);
        return;
      }

      if (signIn.status === "needs_second_factor") {
        await beginSecondFactor(false);
        return;
      }

      setLocalError("More verification is required. Please try again.");
    });
  }

  async function resendVerificationCode() {
    await runOnce(async () => {
      setLocalError("");
      if (verificationStrategy === "email_code_first_factor") {
        const { error } = await signIn.emailCode.sendCode();
        if (error) setLocalError("We could not send another code yet. Please wait a moment and try again.");
      } else if (verificationStrategy === "email_code") {
        const { error } = await signIn.mfa.sendEmailCode();
        if (error) setLocalError("We could not send another code yet. Please wait a moment and try again.");
      } else if (verificationStrategy === "phone_code") {
        const { error } = await signIn.mfa.sendPhoneCode();
        if (error) setLocalError("We could not send another code yet. Please wait a moment and try again.");
      }
    });
  }

  async function startOver() {
    await runOnce(async () => {
      await signIn.reset();
      setVerificationStrategy(null);
      setCode("");
      setPassword("");
      setLocalError("");
    });
  }

  async function resetSavedSession() {
    await runOnce(async () => {
      await signIn.reset();
      await signOut({ redirectUrl: "/sign-in" });
    });
  }

  const verificationActive = verificationStrategy !== null;
  const fieldError = errors.fields.identifier?.message || errors.fields.password?.message || errors.fields.code?.message || localError;
  const verificationTitle = verificationStrategy === "totp" ? "Authenticator verification" : verificationStrategy === "backup_code" ? "Backup code verification" : "Verify your account";
  const verificationHelp = verificationStrategy === "email_code_first_factor" || verificationStrategy === "email_code" ? "Enter the verification code sent to your email." : verificationStrategy === "phone_code" ? "Enter the verification code sent to your phone." : verificationStrategy === "totp" ? "Enter the code from your authenticator app." : "Enter one of your unused backup codes.";

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
            {!verificationActive ? (
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
                      <button type="button" disabled={busy} onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-2 text-slate-500 hover:text-slate-300 disabled:opacity-50">
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

                <div className="my-5 flex items-center gap-4"><div className="h-px flex-1 bg-slate-700/70" /><span className="text-xs text-slate-500">or</span><div className="h-px flex-1 bg-slate-700/70" /></div>
                <button type="button" disabled={busy} onClick={() => void handleEmailCodeSignIn()} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-teal-500/50 bg-teal-500/10 text-sm font-semibold text-teal-200 transition hover:bg-teal-500/15 disabled:cursor-not-allowed disabled:opacity-60">
                  <Mail className="size-4" />
                  {busy ? "Sending code..." : "Sign in with email code"}
                </button>
                <p className="mt-3 text-center text-xs text-slate-500">Use this if your account was migrated or you do not have a password yet.</p>

                <div className="my-7 flex items-center gap-4"><div className="h-px flex-1 bg-slate-700/70" /><span className="text-xs text-slate-500">or</span><div className="h-px flex-1 bg-slate-700/70" /></div>
                <p className="text-center text-sm text-slate-400">New to MunshiOS? <Link href="/sign-up" onClick={(event) => { event.preventDefault(); router.push(signUpDestination()); }} className="font-medium text-teal-300 hover:text-teal-200">Create account</Link></p>
                <button type="button" disabled={busy} onClick={() => void resetSavedSession()} className="mt-4 w-full text-center text-xs text-slate-500 transition hover:text-slate-300 disabled:opacity-50">Login stuck in this browser? Reset saved session</button>
              </>
            ) : (
              <>
                <div className="mb-8">
                  <h1 className="text-3xl font-semibold tracking-[-0.03em]">{verificationTitle}</h1>
                  <p className="mt-2 text-sm text-slate-400">{verificationHelp}</p>
                </div>
                <form onSubmit={handleVerification} className="space-y-5">
                  <div>
                    <label htmlFor="verification-code" className="mb-2 block text-sm font-medium text-slate-100">Verification code</label>
                    <input id="verification-code" inputMode={verificationStrategy === "backup_code" ? "text" : "numeric"} autoComplete="one-time-code" required disabled={busy} value={code} onChange={(e) => setCode(e.target.value)} className="h-12 w-full rounded-xl border border-slate-600/80 bg-[#0b1921] px-4 text-sm tracking-[0.18em] text-white outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400 disabled:opacity-60" />
                  </div>
                  {fieldError && <p className="text-sm text-rose-300">{fieldError}</p>}
                  <button disabled={busy} className="h-12 w-full rounded-xl bg-gradient-to-r from-[#18c4ad] to-[#10967f] text-sm font-semibold disabled:opacity-60">{busy ? "Verifying..." : "Verify and continue"}</button>
                  {(verificationStrategy === "email_code_first_factor" || verificationStrategy === "email_code" || verificationStrategy === "phone_code") && <button type="button" disabled={busy} onClick={() => void resendVerificationCode()} className="w-full text-center text-sm text-teal-300 disabled:opacity-60">Send another code</button>}
                  <button type="button" disabled={busy} onClick={() => void startOver()} className="w-full text-center text-sm text-slate-400 hover:text-slate-200 disabled:opacity-60">Start over</button>
                </form>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
