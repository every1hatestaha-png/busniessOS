"use client";

import { ClerkProvider } from "@clerk/nextjs";

const previewPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "pk_test_Zml4dHVyZS5jbGVyay5hY2NvdW50cy5kZXYk";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider dynamic publishableKey={previewPublishableKey} afterSignOutUrl="/platform/sign-in">
      {children}
    </ClerkProvider>
  );
}
