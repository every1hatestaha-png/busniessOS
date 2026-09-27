"use client";

import { useMemo, useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { LogOut, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function WebAccountMenu() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { signOut: clerkSignOut } = useClerk();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    await supabase.auth.signOut();
    try {
      await clerkSignOut();
    } catch {
      // Clerk is a temporary fallback during the migration. Supabase logout
      // must still succeed if Clerk is unavailable.
    }
    window.location.assign("/sign-in");
  }

  return (
    <div className="ml-1 flex items-center gap-1 border-l pl-3">
      <span className="grid size-8 place-items-center rounded-full bg-slate-100 text-slate-600" aria-hidden="true"><UserRound className="size-4" /></span>
      <Button type="button" variant="ghost" size="icon" onClick={signOut} disabled={busy} aria-label="Sign out">
        <LogOut className="size-4" />
      </Button>
    </div>
  );
}
