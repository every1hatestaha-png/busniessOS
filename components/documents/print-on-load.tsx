"use client";

import { useEffect } from "react";

import { waitForPrintableAssets } from "@/lib/print-assets";

export function PrintOnLoad({ format }: { format?: "thermal" }) {
  useEffect(() => {
    const root = document.documentElement;
    if (format) root.dataset.printFormat = format;

    let cancelled = false;
    if (new URLSearchParams(window.location.search).get("autoprint") !== "0") {
      void (async () => {
        await waitForPrintableAssets();
        if (!cancelled) window.print();
      })();
    }

    return () => {
      cancelled = true;
      if (format && root.dataset.printFormat === format) {
        delete root.dataset.printFormat;
      }
    };
  }, [format]);

  return null;
}
