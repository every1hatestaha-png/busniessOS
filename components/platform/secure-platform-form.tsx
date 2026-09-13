"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { useReverification } from "@clerk/nextjs";

export function SecurePlatformForm({
  action,
  className,
  children,
}: {
  action: (formData: FormData) => Promise<unknown>;
  className?: string;
  children: ReactNode;
}) {
  const verifiedAction = useReverification(action);
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);

  return (
    <form
      className={className}
      aria-busy={pending}
      action={async (formData) => {
        if (inFlight.current) return;
        inFlight.current = true;
        setPending(true);
        try {
          await verifiedAction(formData);
        } finally {
          inFlight.current = false;
          setPending(false);
        }
      }}
    >
      <fieldset disabled={pending} className="contents disabled:pointer-events-none disabled:opacity-60">
        {children}
      </fieldset>
    </form>
  );
}
