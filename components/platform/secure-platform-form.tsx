"use client";

import type { ReactNode } from "react";
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

  return (
    <form
      className={className}
      action={async (formData) => {
        await verifiedAction(formData);
      }}
    >
      {children}
    </form>
  );
}
