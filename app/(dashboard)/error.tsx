"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Dashboard route error", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-red-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-red-600">Something did not load</p>
      <h2 className="mt-2 text-xl font-semibold text-slate-950">This page hit a temporary error.</h2>
      <p className="mt-2 text-sm text-slate-600">Your data was not changed by this error. Retry the page, and if it keeps happening the server logs will contain the failure reference.</p>
      {error.digest && <p className="mt-3 font-mono text-xs text-slate-400">Reference: {error.digest}</p>}
      <Button type="button" onClick={reset} className="mt-5">Retry page</Button>
    </div>
  );
}
