import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset password",
  description: "Complete a verified MunshiOS password recovery.",
  alternates: { canonical: "/recovery/new-password" },
  robots: { index: false, follow: false, noarchive: true },
};

export default function RecoveryLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
