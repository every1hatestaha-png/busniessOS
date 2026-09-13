"use client";

import { useEffect } from "react";

export default function PlatformError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Platform route error", error);
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center bg-[#fafaf8] px-5 py-10 text-slate-950">
      <section className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-600">MunshiOS Control Plane</p>
        <h1 className="mt-2 text-2xl font-semibold">Admin action could not finish</h1>
        <p className="mt-2 text-sm text-slate-600">The request failed safely. Retry once. Repeated failures can be traced from the reference below without exposing internal details.</p>
        {error.digest && <p className="mt-3 font-mono text-xs text-slate-400">Reference: {error.digest}</p>}
        <button type="button" onClick={reset} className="mt-5 rounded-lg bg-[#059669] px-4 py-2 text-sm font-semibold text-white hover:bg-[#047857]">Retry admin page</button>
      </section>
    </main>
  );
}
