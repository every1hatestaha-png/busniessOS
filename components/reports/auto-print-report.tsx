"use client";

import { useEffect } from "react";

export function AutoPrintReport({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(timer);
  }, [enabled]);

  return null;
}
