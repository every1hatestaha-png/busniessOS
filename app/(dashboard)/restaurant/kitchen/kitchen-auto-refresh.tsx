"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Refresh the scoped kitchen queue while the board is visible. */
export function KitchenAutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [router]);

  return <span className="text-xs font-medium text-slate-500">Updates every 15 seconds</span>;
}
