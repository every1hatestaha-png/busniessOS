"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useSignUp } from "@clerk/nextjs";
import { ArrowRight, BarChart3, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, PackageCheck, ShieldCheck, Sparkles } from "lucide-react";

export default function SignUpPage() {
  const { signUp, errors, fetchStatus } = useSignUp();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [code, setCode] = useState("");
  const [verificationActive, setVerificationActive] = useState(false);
  const [localError, setLocalError] = useState("");

  const busy = fetchStatus === "fetching";

  async function finishSignUp() {
    const { error } = await signUp.finalize({
      navigate: ({ session, decorateUrl }) => {
        if (session?.currentTask) return;
        const url = decorateUrl("/onboarding");
        if (url.startsWith("http")) window.location.href = url;
        else router.push(url);
      },
    });
    if (error) setLocalError("We could not finish creating your account. Please try again.");
  }

  async function handleCreateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError("");
    const identifier = email.trim().toLowerCase();
    if (!identifier || !password || !confirmPassword) {
      setLocalError("Enter your email and both password fields.");
      return;
    }
    if (password !== confirmPassword) {
      setLocalError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setLocalError("Use a password with at least 8 characters.");
      return;
    }
    const { error } = await signUp.password({ emailAddress: identifier, password });
    if (error) {
      setLocalError(errors.fields.emailAddress?.message || errors.fields.password?.message || "We could not create your account.");
      return;
    }
    if (signUp.status === "complete") {
      await finishSignUp();
      return;
    }
    const { error: sendError } = await signUp.verifications.sendEmailCode();
    if (sendError) {
      setLocalError("Your account was started, but we could not send the verification email. Please try again.");
      return;
    }
    setVerificationActive(true);
  }

  async function handleVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError("");
    const value = code.trim();
    if (!value) {
      setLocalError("Enter the verification code sent to your email.");
      return;
    }
    const { error } = await signUp.verifications.verifyEmailCode({ code: value });
    if (error) {
      setLocalError(errors.fields.code?.message || "That verification code is not valid.");
      return;
    }
    if (signUp.status === "complete") {
      await finishSignUp();
      return;
    }
    setLocalError("More verification is required before we can continue.");
  }

  async function resendCode() {
    setLocalError("");
    const { error } = await signUp.verifications.sendEmailCode();
    if (error) setLocalError("We could not send another code yet. Please wait a moment and try again.");
  }

  const fieldError = errors.fields.emailAddress?.message || errors.fields.password?.message || errors.fields.code?.message || localError;

  return (
    <main className="min-h-dvh w-full overflow-x-hidden bg-[#06131a] text-white">
      <div className="grid min-h-dvh w-full lg:grid-cols-[52.7%_47.3%]">
        <section className="relative hidden min-h-dvh overflow-hidden border-r border-white/10 bg-[#07161e] lg:flex lg:items-center lg:justify-center" aria-hidden="true">
          <div className="pointer-events-none absolute -left-32 top-10 h-96 w-96 rounded-full bg-teal-400/10 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 right-0 h-[28rem] w-[28rem] rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="relative w-full max-w-2xl px-12 xl:px-16">
            <div className="mb-10 inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur">
              <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-teal-300 to-emerald-500 text-slate-950"><Sparkles className="size-5" /></div>
              <div><p className="font-semibold">MunshiOS</p><p className="text-xs text-slate-400">Har karobar ka digital system</p></div>
            </div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-teal-300">Your business, configured your way</p>
            <h2 className="mt-4 max-w-xl text-5xl font-semibold leading-[1.04] tracking-[-0.045em]">Your Munshi is almost ready.</h2>
            <p className="mt-5 max-w-lg text-lg leading-8 text-slate-400">Create your secure account, then continue with payment and business setup. Your selected Munshi configuration stays with you.</p>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 backdrop-blur"><PackageCheck className="size-5 text-teal-300" /><p className="mt-3 text-sm font-medium">Configured modules</p><p className="mt-1 text-xs leading-5 text-slate-500">Only the tools your business needs.</p></div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 backdrop-blur"><BarChart3 className="size-5 text-teal-300" /><p className="mt-3 text-sm font-medium">Live business view</p><p className="mt-1 text-xs leading-5 text-slate-500">Sales, stock and accounts together.</p></div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 backdrop-blur"><ShieldCheck className="size-5 text-teal-300" /><p className="mt-3 text-sm font-medium">Private workspace</p><p className="mt-1 text-xs leading-5 text-slate-500">Built around your team and permissions.</p></div>
            </div>

            <div className="mt-8 rounded-3xl border border-teal-400/15 bg-gradient-to-br from-teal-400/[0.08] to-white/[0.025] p-5 shadow-2xl shadow-black/20">
              <div className="flex items-center justify-between"><div><p className="text-xs text-slate-500">Next</p><p className="mt-1 font-medium">Account → Payment → Business setup</p></div><div className="grid size-10 place-items-center rounded-full bg-teal-400/10 text-teal-300"><ArrowRight className="size-4" /></div></div>
            </div>
          </div>
        </section>

        <section className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden px-5 py-8 sm:px-8 lg:px-10 xl:px-14">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_85%,rgba(13,148,136,0.23),transparent_34%),linear-gradient(180deg,#06131a_0%,#07161e_100%)]" />
          <div className="relative w-full max-w-[646px] rounded-[28px] border border-teal-500/50 bg-[#07151d]/88 px-6 py-9 shadow-[0_28px_80px_rgba(0,0,0,0.3)] backdrop-blur-xl sm:px-10 sm:py-11 lg:px-12 xl:px-14">
            {!verificationActive ? (
              <>
                <div className="mb-8"><h1 className="text-4xl font-semibold tracking-[-0.04em] text-white sm:text-[42px]">Create your Munshi</h1><p className="mt-2 text-base text-slate-400 sm:text-lg">One account for your business and your team</p></div>
                <form onSubmit={handleCreateAccount} className="space-y-5">
                  <div><label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-100">Email address</label><div className="relative"><Mail className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500" /><input id="email" type="email" autoComplete="email" required disabled={busy} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="h-12 w-full rounded-xl border border-slate-600/80 bg-[#0b1921] pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-teal-400 focus:ring-1 focus:ring-teal-400 disabled:opacity-60" /></div></div>
                  <PasswordField label="Password" id="password" value={password} onChange={setPassword} show={showPassword} onToggle={() => setShowPassword((value) => !value)} autoComplete="new-password" disabled={busy} />
                  <PasswordField label="Confirm password" id="confirm-password" value={confirmPassword} onChange={setConfirmPassword} show={showConfirmPassword} onToggle={() => setShowConfirmPassword((value) => !value)} autoComplete="new-password" disabled={busy} />
                  {fieldError && <p className="text-sm text-rose-300">{fieldError}</p>}
                  <button disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#18c4ad] to-[#10967f] text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60">{busy ? "Creating account..." : "Create account & continue"}{!busy && <ArrowRight className="size-4" />}</button>
                </form>
                <div className="my-7 flex items-center gap-4"><div className="h-px flex-1 bg-slate-700/70" /><span className="text-xs text-slate-500">or</span><div className="h-px flex-1 bg-slate-700/70" /></div>
                <p className="text-center text-sm text-slate-400">Already have an account? <Link href="/sign-in" className="font-medium text-teal-300 hover:text-teal-200">Sign in</Link></p>
              </>
            ) : (
              <>
                <div className="mb-8"><div className="mb-5 grid size-12 place-items-center rounded-2xl bg-teal-400/10 text-teal-300"><CheckCircle2 className="size-6" /></div><h1 className="text-3xl font-semibold tracking-[-0.03em]">Verify your email</h1><p className="mt-2 text-sm leading-6 text-slate-400">We sent a verification code to <span className="font-medium text-slate-200">{email}</span>.</p></div>
                <form onSubmit={handleVerification} className="space-y-5">
                  <div><label htmlFor="verification-code" className="mb-2 block text-sm font-medium text-slate-100">Verification code</label><input id="verification-code" inputMode="numeric" autoComplete="one-time-code" required disabled={busy} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter code" className="h-12 w-full rounded-xl border border-slate-600/80 bg-[#0b1921] px-4 text-sm tracking-[0.18em] text-white outline-none placeholder:tracking-normal placeholder:text-slate-500 focus:border-teal-400 focus:ring-1 focus:ring-teal-400 disabled:opacity-60" /></div>
                  {fieldError && <p className="text-sm text-rose-300">{fieldError}</p>}
                  <button disabled={busy} className="h-12 w-full rounded-xl bg-gradient-to-r from-[#18c4ad] to-[#10967f] text-sm font-semibold disabled:opacity-60">{busy ? "Verifying..." : "Verify & continue"}</button>
                  <button type="button" disabled={busy} onClick={() => void resendCode()} className="w-full text-center text-sm text-teal-300 disabled:opacity-60">Send another code</button>
                </form>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function PasswordField({ label, id, value, onChange, show, onToggle, autoComplete, disabled }: { label: string; id: string; value: string; onChange: (value: string) => void; show: boolean; onToggle: () => void; autoComplete: string; disabled: boolean }) {
  return <div><label htmlFor={id} className="mb-2 block text-sm font-medium text-slate-100">{label}</label><div className="relative"><LockKeyhole className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500" /><input id={id} type={show ? "text" : "password"} autoComplete={autoComplete} required disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} placeholder={label} className="h-12 w-full rounded-xl border border-slate-600/80 bg-[#0b1921] pl-11 pr-11 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-teal-400 focus:ring-1 focus:ring-teal-400 disabled:opacity-60" /><button type="button" disabled={disabled} onClick={onToggle} aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-2 text-slate-500 hover:text-slate-300 disabled:opacity-50">{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></div>;
}
