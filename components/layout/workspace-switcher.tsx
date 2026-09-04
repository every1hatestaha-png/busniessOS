"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function WorkspaceSwitcher({ activeId, workspaces }: { activeId: string; workspaces: Array<{ workspaceId: string; workspace: { name: string } }> }) {
  const router = useRouter(); const [busy, setBusy] = useState(false);
  if (workspaces.length < 2) return null;
  return <select aria-label="Active workspace" disabled={busy} value={activeId} onChange={async (event) => { setBusy(true); const response = await fetch("/api/v1/workspace/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: event.target.value }) }); if (response.ok) { router.push("/dashboard"); router.refresh(); } else setBusy(false); }} className="h-8 max-w-48 rounded-md border bg-white px-2 text-xs font-medium text-slate-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60"><option disabled>Workspace</option>{workspaces.map((item) => <option key={item.workspaceId} value={item.workspaceId}>{item.workspace.name}</option>)}</select>;
}
