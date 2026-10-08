import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in securely to your MunshiOS workspace.",
  alternates: { canonical: "/sign-in" },
  robots: { index: false, follow: false, noarchive: true },
};

export default function SignInLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
