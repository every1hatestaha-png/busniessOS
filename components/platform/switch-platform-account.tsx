"use client";

import { useMemo, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function SwitchPlatformAccount() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function switchAccount() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      if (signOutError) throw signOutError;
      window.location.replace("/sign-in?redirect_url=%2Fplatform");
    } catch {
      setError("Could not switch accounts. Use the business dashboard sign-out control and retry.");
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={switchAccount}
        disabled={busy}
        className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Switching account..." : "Sign in with platform owner account"}
      </button>
      {error ? <p className="mt-2 text-sm text-red-700" role="alert">{error}</p> : null}
    </div>
  );
}
