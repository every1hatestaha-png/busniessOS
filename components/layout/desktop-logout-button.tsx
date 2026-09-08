"use client";

import { useRef, useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { LogOut, UserRoundCog, UserRoundPlus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function DesktopAccountMenu() {
  const clerk = useClerk();
  const { user } = useUser();
  const busy = useRef(false);
  const [pendingAction, setPendingAction] = useState<"switch" | "signout" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAction(action: "switch" | "signout") {
    console.info(`[D7][account] action selected=${action}`);
    if (busy.current) return;
    busy.current = true;
    setPendingAction(action);
    setError(null);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stage = "bridge";
    try {
      const desktop = window.businessOSDesktop;
      if (!desktop?.signOut || !desktop.switchAccount) throw new Error("Desktop bridge unavailable");
      if (action === "switch") {
        stage = "Electron";
        if (await desktop.switchAccount() !== true) throw new Error("Desktop account switch did not complete");
        return;
      }
      stage = "Clerk";
      console.info(`[D7][account] Clerk signOut starting action=${action}`);
      // The callback takes ownership of navigation; Clerk must not redirect
      // before Electron has removed its independent OAuth credentials.
      await Promise.race([
        clerk.signOut(() => {}),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Clerk sign-out timed out")), 8000);
        }),
      ]);
      clearTimeout(timer);
      console.info(`[D7][account] Clerk signOut completed action=${action}`);
      stage = "storage";
      window.localStorage.clear();
      window.sessionStorage.clear();
      stage = "Electron";
      if (await desktop.signOut() !== true) throw new Error("Desktop sign out did not complete");
    } catch (cause) {
      // Do not print arbitrary SDK errors, which may contain request details.
      console.error(`[D6][logout] failed stage=${stage} name=${cause instanceof Error ? cause.name : "unknown"}`);
      setError(`Account action could not finish (${stage}). Please retry. If it persists, check the desktop log.`);
    } finally {
      clearTimeout(timer);
      busy.current = false;
      setPendingAction(null);
    }
  }

  return (
    <div className="relative ml-1 flex items-center border-l pl-3">
      <DropdownMenu>
        <DropdownMenuTrigger type="button" className={buttonVariants({ variant: "ghost", size: "icon", className: "text-muted-foreground" })} aria-label="Open account menu" title="Account" disabled={pendingAction !== null}>
          <UserRoundCog className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="px-2 py-1.5">
              <span className="block truncate text-xs font-semibold text-foreground">{user?.fullName || "Current account"}</span>
              {user?.primaryEmailAddress?.emailAddress && <span className="block truncate text-[11px] font-normal">{user.primaryEmailAddress.emailAddress}</span>}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void runAction("switch")} disabled={pendingAction !== null}>
            <UserRoundCog />
            Switch account
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void runAction("switch")} disabled={pendingAction !== null}>
            <UserRoundPlus />
            Sign in with another account
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => void runAction("signout")} disabled={pendingAction !== null}>
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {error && <p role="alert" className="absolute right-4 top-full max-w-sm rounded border bg-white p-3 text-sm text-destructive">{error}</p>}
    </div>
  );
}
