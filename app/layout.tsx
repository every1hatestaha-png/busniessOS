import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./auth-visual.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://business-os-one-gules.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "MunshiOS | Business software for Pakistan",
    template: "%s | MunshiOS",
  },
  applicationName: "MunshiOS",
  description: "Sales, purchases, inventory, khata, accounting, manufacturing and business operations in one connected system for Pakistani businesses.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    title: "MunshiOS | Business software for Pakistan",
    description: "Sales, purchases, stock, khata and accounting in one connected system. First month free.",
    siteName: "MunshiOS",
  },
  twitter: {
    card: "summary",
    title: "MunshiOS | Business software for Pakistan",
    description: "Sales, purchases, stock, khata and accounting in one connected system. First month free.",
  },
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
