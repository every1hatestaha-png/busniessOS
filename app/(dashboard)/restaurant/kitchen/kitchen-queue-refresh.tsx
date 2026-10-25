"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play, RefreshCw } from "lucide-react";

const POLL_INTERVAL_MS = 12_000;

/**
 * Poll server-rendered kitchen data without introducing a new API, websocket,
 * or tenant-scoped subscription channel. Hidden tabs never poll.
 */
export function KitchenQueueRefresh() {
  const router = useRouter();
  const [enabled, setEnabled] = useState(true);
  const [refreshing, startTransition] = useTransition();

  useEffect(() => {
    if (!enabled) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      startTransition(() => router.refresh());
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [enabled, router]);

  return (
    <div aria-label="Kitchen queue refresh controls" className="flex flex-wrap items-center gap-2">
      <span role="status" className="text-xs font-medium text-slate-500">
        {enabled ? "Updates every 12 seconds while this tab is visible" : "Automatic updates paused"}
      </span>
      <button
        type="button"
        aria-label="Refresh kitchen orders"
        disabled={refreshing}
        onClick={() => startTransition(() => router.refresh())}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
      >
        <RefreshCw className="size-3.5" aria-hidden="true" />
        {refreshing ? "Refreshing…" : "Refresh now"}
      </button>
      <button
        type="button"
        aria-label={enabled ? "Pause automatic kitchen refresh" : "Resume automatic kitchen refresh"}
        aria-pressed={enabled}
        onClick={() => setEnabled((current) => !current)}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        {enabled ? <Pause className="size-3.5" aria-hidden="true" /> : <Play className="size-3.5" aria-hidden="true" />}
        {enabled ? "Pause" : "Resume"}
      </button>
    </div>
  );
}
