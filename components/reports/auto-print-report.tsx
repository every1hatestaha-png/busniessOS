"use client";

import { useEffect } from "react";

async function waitForPrintableAssets() {
  const images = Array.from(document.querySelectorAll<HTMLImageElement>("[data-print-surface] img, [data-document] img"));
  await Promise.all(images.map(async (image) => {
    if (!image.complete) {
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        image.addEventListener("load", done, { once: true });
        image.addEventListener("error", done, { once: true });
      });
    }
    if (typeof image.decode === "function") {
      await image.decode().catch(() => undefined);
    }
  }));

  if ("fonts" in document) {
    await document.fonts.ready.catch(() => undefined);
  }
}

export function AutoPrintReport({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    void (async () => {
      await waitForPrintableAssets();
      if (cancelled) return;
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (!cancelled) window.print();
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return null;
}
