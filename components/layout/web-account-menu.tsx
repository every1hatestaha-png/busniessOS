"use client";

import { useMemo, useState } from "react";
import { LogOut, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function WebAccountMenu() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      window.location.assign("/sign-in");
    } catch {
      setError("Sign out failed. Please retry.");
      setBusy(false);
    }
  }

  return (
    <div className="ml-1 flex items-center gap-1 border-l pl-3">
      <span className="grid size-8 place-items-center rounded-full bg-slate-100 text-slate-600" aria-hidden="true"><UserRound className="size-4" /></span>
      <Button type="button" variant="ghost" size="icon" onClick={signOut} disabled={busy} aria-label="Sign out">
        <LogOut className="size-4" />
      </Button>
      {error ? <span role="alert" className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
