import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create a MunshiOS account and verify your email to start a workspace.",
  alternates: { canonical: "/sign-up" },
  robots: { index: false, follow: false, noarchive: true },
};

export default function SignUpLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
