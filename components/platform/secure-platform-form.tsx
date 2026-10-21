"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";

export function SecurePlatformForm({
  action,
  className,
  children,
}: {
  action: (formData: FormData) => Promise<unknown>;
  className?: string;
  children: ReactNode;
}) {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  return (
    <form
      className={className}
      aria-busy={pending}
      action={async (formData) => {
        if (inFlight.current) return;
        inFlight.current = true;
        setPending(true);
        setMessage(null);
        setFailed(false);
        try {
          await action(formData);
          setMessage("Saved");
        } catch (error) {
          console.error("Platform action failed", error);
          setFailed(true);
          setMessage("Action blocked. Verify a fresh authenticator code under Security, then retry.");
        } finally {
          inFlight.current = false;
          setPending(false);
        }
      }}
    >
      <fieldset disabled={pending} className="contents disabled:pointer-events-none disabled:opacity-60">
        {children}
      </fieldset>
      {pending && <span className="basis-full text-[11px] font-medium text-slate-500">Working…</span>}
      {message && !pending && (
        <span className={`basis-full text-[11px] font-medium ${failed ? "text-red-600" : "text-emerald-700"}`} role={failed ? "alert" : "status"}>
          {message}
        </span>
      )}
    </form>
  );
}
