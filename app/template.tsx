"use client";

import type { ReactNode } from "react";

export default function AppTemplate({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none motion-reduce:transform-none">
      {children}
    </div>
  );
}
