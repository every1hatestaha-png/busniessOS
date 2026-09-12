"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getDedicatedPrintRoute } from "@/lib/print-routing";

export function PrintShortcutRouter() {
  const pathname = usePathname();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== "p") return;

      const printRoute = getDedicatedPrintRoute(pathname);
      if (!printRoute) return;

      event.preventDefault();
      window.location.assign(printRoute);
    }

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [pathname]);

  return null;
}
