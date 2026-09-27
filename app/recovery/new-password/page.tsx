"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function RecoveryNewPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setBusy(false);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-[#06131a] px-4 py-10 text-white">
      <div className="w-full max-w-md rounded-3xl border border-teal-500/40 bg-[#07151d] p-7 shadow-2xl">
        <ShieldCheck className="size-10 text-emerald-400" />
        <h1 className="mt-4 text-3xl font-semibold">Choose a new password</h1>
        <p className="mt-2 text-sm text-slate-400">Use at least 8 characters.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="relative">
            <LockKeyhole className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
            <input type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" className="h-12 w-full rounded-xl border border-slate-600 bg-[#0b1921] pl-11 pr-11 text-sm outline-none focus:border-teal-400" />
            <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-slate-400" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
          </div>
          <input type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" className="h-12 w-full rounded-xl border border-slate-600 bg-[#0b1921] px-4 text-sm outline-none focus:border-teal-400" />
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          <button type="submit" disabled={busy} className="h-12 w-full rounded-xl bg-emerald-600 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-60">{busy ? "Updating..." : "Update password"}</button>
        </form>
      </div>
    </main>
  );
}
