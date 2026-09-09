"use client";

import { useEffect } from "react";

export function PrintOnLoad() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("autoprint") === "0") return;
    window.print();
  }, []);
  return null;
}
