import type { Metadata } from "next";
import { MarketingHeader, MarketingFooter } from "@/components/marketing/site";
import { MunshiBuilder } from "./munshi-builder";

export const metadata: Metadata = {
  title: "Configure your MunshiOS",
  description: "Choose your business type and configure the MunshiOS modules that fit your operations.",
  alternates: { canonical: "/get-your-munshi" },
  openGraph: {
    title: "Configure your MunshiOS",
    description: "Build a MunshiOS workspace around your retail, restaurant, wholesale, manufacturing, or services business.",
    url: "/get-your-munshi",
    type: "website",
  },
};

export default function GetYourMunshiPage() {
  return (
    <main className="min-h-screen bg-[#fbfcfa] text-slate-950">
      <MarketingHeader />
      <MunshiBuilder />
      <MarketingFooter />
    </main>
  );
}
