"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function WorkspaceSwitcher({ activeId, workspaces }: { activeId: string; workspaces: Array<{ workspaceId: string; workspace: { name: string } }> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function switchWorkspace(workspaceId: string) {
    if (busy || workspaceId === activeId) return;
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/v1/workspace/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });

      if (!response.ok) {
        let errorMessage = "Could not switch workspace. Please try again.";
        try {
          const body = await response.json();
          errorMessage = body.error?.message ?? errorMessage;
        } catch {
          // Keep the safe fallback when an upstream error returns non-JSON content.
        }
        setMessage(errorMessage);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setMessage("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      {workspaces.length > 1 && <select
        aria-label="Active workspace"
        aria-busy={busy}
        aria-describedby={message ? "workspace-switch-error" : undefined}
        disabled={busy}
        value={activeId}
        onChange={(event) => void switchWorkspace(event.target.value)}
        className="h-8 max-w-48 rounded-md border bg-white px-2 text-xs font-medium text-slate-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60"
      >
        <option disabled>Workspace</option>
        {workspaces.map((item) => (
          <option key={item.workspaceId} value={item.workspaceId}>{item.workspace.name}</option>
        ))}
      </select>}
      <Link href="/onboarding?mode=new" className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border bg-white px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50" aria-label="Add another business">
        <Plus className="h-3.5 w-3.5" /><span className="hidden sm:inline">Add business</span>
      </Link>
      {message && <span id="workspace-switch-error" role="alert" className="max-w-56 text-[10px] text-red-600">{message}</span>}
    </div>
  );
}
