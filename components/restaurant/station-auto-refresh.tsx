"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play, RefreshCw } from "lucide-react";

/** Staff-friendly polling until a websocket channel is provisioned.
 * Never polls hidden tabs; does not mutate orders or financial records. */
export function RestaurantStationAutoRefresh({
  label,
  intervalSeconds = 15,
}: {
  label: string;
  intervalSeconds?: number;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(true);
  const [refreshing, startTransition] = useTransition();

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      startTransition(() => router.refresh());
    }, Math.max(10, intervalSeconds) * 1000);
    return () => window.clearInterval(timer);
  }, [enabled, intervalSeconds, router]);

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={`${label} refresh controls`}>
      <span role="status" className="text-xs text-slate-500">
        {enabled ? `Updates every ${intervalSeconds}s while visible` : "Updates paused"}
      </span>
      <button type="button" disabled={refreshing}
        onClick={() => startTransition(() => router.refresh())}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60"
        aria-label={`Refresh ${label}`}>
        <RefreshCw className="size-3.5" aria-hidden="true" />{refreshing ? "Refreshing…" : "Refresh"}
      </button>
      <button type="button" onClick={() => setEnabled((value) => !value)}
        aria-pressed={enabled}
        aria-label={enabled ? `Pause ${label} updates` : `Resume ${label} updates`}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-emerald-500">
        {enabled ? <Pause className="size-3.5" aria-hidden="true"/> : <Play className="size-3.5" aria-hidden="true"/>}
        {enabled ? "Pause" : "Resume"}
      </button>
    </div>
  );
}
