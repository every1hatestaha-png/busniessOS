"use client";

import { useEffect } from "react";

function waitForImage(image: HTMLImageElement) {
  if (image.complete) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      image.removeEventListener("load", finish);
      image.removeEventListener("error", finish);
      resolve();
    };
    image.addEventListener("load", finish, { once: true });
    image.addEventListener("error", finish, { once: true });
    window.setTimeout(finish, 2000);
  });
}

function nextPaint() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
}

export function AutoPrintReport({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const printWhenReady = async () => {
      try {
        await document.fonts?.ready;
      } catch {
        // Printing should still work if a remote font fails to settle.
      }

      const images = Array.from(
        document.querySelectorAll<HTMLImageElement>("[data-print-surface] img, [data-document] img"),
      );
      await Promise.all(images.map(waitForImage));

      // Give layout two paints after fonts/images settle so print preview does
      // not capture a half-laid-out header, logo, or financial table.
      await nextPaint();
      await nextPaint();

      if (!cancelled) window.print();
    };

    void printWhenReady();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return null;
}
