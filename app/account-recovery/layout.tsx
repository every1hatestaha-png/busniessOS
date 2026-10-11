import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Account recovery",
  description: "Recover access to a MunshiOS account.",
  alternates: { canonical: "/account-recovery" },
  robots: { index: false, follow: false, noarchive: true },
};

export default function AccountRecoveryLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
