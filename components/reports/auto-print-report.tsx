"use client";

import { useEffect } from "react";

import { waitForPrintableAssets } from "@/lib/print-assets";

export function AutoPrintReport({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    void (async () => {
      await waitForPrintableAssets();
      if (!cancelled) window.print();
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return null;
}
