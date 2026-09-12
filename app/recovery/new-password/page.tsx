"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useReverification, useUser } from "@clerk/nextjs";
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";

export default function RecoveryNewPasswordPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const updatePassword = useReverification(async (newPassword: string) => {
    if (!user) throw new Error("User is unavailable.");
    return user.updatePassword({
      newPassword,
      signOutOfOtherSessions: true,
    });
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Use at least 8 characters for your new password.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      await updatePassword(password);
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("We could not update your password. Please try a stronger password or verify again if requested.");
    } finally {
      setBusy(false);
    }
  }

  if (!isLoaded) {
    return <main className="grid min-h-dvh place-items-center bg-[#06131a] text-sm text-slate-400">Loading secure recovery...</main>;
  }

  if (!isSignedIn || !user) {
    router.replace("/sign-in");
    return null;
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-[#06131a] px-5 py-10 text-white">
      <section className="w-full max-w-lg rounded-[28px] border border-teal-500/50 bg-[#07151d] p-7 shadow-2xl sm:p-10">
        <div className="mb-8 flex size-12 items-center justify-center rounded-2xl bg-teal-400/10 text-teal-300">
          <ShieldCheck className="size-6" />
        </div>

        <h1 className="text-3xl font-semibold tracking-[-0.03em]">Create a new password</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">Your email verification is complete. Choose a new password and we will keep you signed in to MunshiOS.</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="new-password" className="mb-2 block text-sm font-medium text-slate-100">New password</label>
            <div className="relative">
              <LockKeyhole className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
              <input id="new-password" type={showPassword ? "text" : "password"} autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="h-12 w-full rounded-xl border border-slate-600/80 bg-[#0b1921] pl-11 pr-11 text-sm text-white outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400" />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-2 text-slate-500 hover:text-slate-300">
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="confirm-password" className="mb-2 block text-sm font-medium text-slate-100">Confirm new password</label>
            <input id="confirm-password" type={showPassword ? "text" : "password"} autoComplete="new-password" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="h-12 w-full rounded-xl border border-slate-600/80 bg-[#0b1921] px-4 text-sm text-white outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400" />
          </div>

          {error && <p className="text-sm text-rose-300">{error}</p>}

          <button disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#18c4ad] to-[#10967f] text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-60">
            {busy ? "Updating password..." : "Save password and continue"}
            {!busy && <ArrowRight className="size-4" />}
          </button>

          <button type="button" disabled={busy} onClick={() => router.replace("/dashboard")} className="w-full text-center text-sm text-slate-400 transition hover:text-white disabled:opacity-60">Skip for now</button>
        </form>
      </section>
    </main>
  );
}
