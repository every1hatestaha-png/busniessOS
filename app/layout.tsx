import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MunshiOS",
  applicationName: "MunshiOS",
  description: "Har karobar ka digital system, modern operating system for Pakistani businesses",
  icons: {
    icon: "/brand/munshios-mark.svg",
    shortcut: "/brand/munshios-mark.svg",
    apple: "/brand/munshios-mark.svg",
  },
};

const clerkLocalization = {
  signIn: {
    start: {
      title: "Sign in to MunshiOS",
      titleCombined: "Continue to MunshiOS",
    },
  },
  signUp: {
    start: {
      title: "Create your MunshiOS account",
    },
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider afterSignOutUrl="/sign-in" localization={clerkLocalization}>
      <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
        <body className="flex min-h-full flex-col">{children}</body>
      </html>
    </ClerkProvider>
  );
}
