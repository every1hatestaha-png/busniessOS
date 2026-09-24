"use client";

import { useEffect } from "react";

import { waitForPrintableAssets } from "@/lib/print-assets";

export function PrintOnLoad() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("autoprint") === "0") return;

    let cancelled = false;
    void (async () => {
      await waitForPrintableAssets();
      if (!cancelled) window.print();
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
