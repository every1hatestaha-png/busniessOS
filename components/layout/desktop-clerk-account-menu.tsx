"use client";

import { ClerkProvider } from "@clerk/nextjs";

import { DesktopAccountMenu } from "@/components/layout/desktop-logout-button";

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "pk_test_Zml4dHVyZS5jbGVyay5hY2NvdW50cy5kZXYk";

export function DesktopClerkAccountMenu() {
  return (
    <ClerkProvider dynamic publishableKey={publishableKey}>
      <DesktopAccountMenu />
    </ClerkProvider>
  );
}
