import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Password recovery",
  description: "Request a secure MunshiOS password recovery link.",
  alternates: { canonical: "/forgot-password" },
  robots: { index: false, follow: false, noarchive: true },
};

export default function ForgotPasswordLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
