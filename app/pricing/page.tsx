import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Wrench, RefreshCw, ShieldCheck, Headphones } from "lucide-react";
import { MarketingHeader, MarketingFooter, SectionTitle, CTA } from "@/components/marketing/site";

export const metadata: Metadata = {
  title: "Pricing | MunshiOS",
  description: "MunshiOS pricing: PKR 29,000 one-time implementation and PKR 5,000 per month.",
  alternates: { canonical: "/pricing" },
};

const setupIncludes = [
  "Business workspace setup",
  "Industry workflow configuration",
  "Users, roles and initial permissions",
  "Products / customers / suppliers structure",
  "Guided onboarding and implementation support",
] as const;

const monthlyIncludes = [
  "Ongoing MunshiOS access",
  "Configured business workspace",
  "Product updates",
  "Operational modules included in your setup",
  "Standard support",
] as const;

export default function PricingPage() {
  return <main className="min-h-screen bg-[#fbfcfa] text-slate-950">
    <MarketingHeader/>
    <section className="relative overflow-hidden border-b border-slate-200 bg-white py-16 sm:py-24">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(16,185,129,.13),transparent_35%)]"/>
      <div className="relative mx-auto max-w-4xl px-5 text-center sm:px-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Pricing</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] sm:text-6xl">Simple pricing for a serious business system.</h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-600">No three-plan maze. MunshiOS is implemented around your business, then runs on one clear monthly subscription.</p>
      </div>
    </section>

    <section className="py-16 sm:py-20"><div className="mx-auto max-w-[1180px] px-5 sm:px-6">
      <div className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-[30px] border border-slate-200 bg-white p-7 sm:p-9">
          <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">One-time implementation</p><p className="mt-4 text-5xl font-semibold tracking-[-0.05em]">PKR 29,000</p></div><div className="grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><Wrench className="size-5"/></div></div>
          <p className="mt-5 text-sm leading-7 text-slate-600">This is the setup phase where MunshiOS is configured around the way your business actually works.</p>
          <div className="mt-7 space-y-3 border-t border-slate-100 pt-6">{setupIncludes.map(x=><p key={x} className="flex items-start gap-2 text-sm text-slate-700"><Check className="mt-0.5 size-4 shrink-0 text-emerald-600"/>{x}</p>)}</div>
        </article>
        <article className="rounded-[30px] bg-[#071821] p-7 text-white sm:p-9">
          <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-400">Monthly subscription</p><p className="mt-4 text-5xl font-semibold tracking-[-0.05em]">PKR 5,000</p><p className="mt-1 text-xs text-slate-400">per month</p></div><div className="grid size-12 place-items-center rounded-2xl bg-white/10 text-emerald-300"><RefreshCw className="size-5"/></div></div>
          <p className="mt-5 text-sm leading-7 text-slate-400">After implementation, the monthly subscription keeps your configured workspace active and updated.</p>
          <div className="mt-7 space-y-3 border-t border-white/10 pt-6">{monthlyIncludes.map(x=><p key={x} className="flex items-start gap-2 text-sm text-slate-300"><Check className="mt-0.5 size-4 shrink-0 text-emerald-400"/>{x}</p>)}</div>
        </article>
      </div>
      <div className="mt-8 flex justify-center"><Link href="/sign-up" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white">Start with MunshiOS <ArrowRight className="size-4"/></Link></div>
    </div></section>

    <section className="border-y border-slate-200 bg-white py-16 sm:py-20"><div className="mx-auto max-w-[1180px] px-5 sm:px-6">
      <SectionTitle eyebrow="What you are paying for" title="Implementation first. Software second." body="The goal is not to hand you a login and disappear. The implementation fee covers getting MunshiOS into a usable business state."/>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        <article className="rounded-[24px] border border-slate-200 bg-[#fbfcfa] p-6"><Wrench className="size-5 text-emerald-700"/><h3 className="mt-4 font-bold">Configure</h3><p className="mt-2 text-sm leading-6 text-slate-600">Business type, workflows, users and operating structure are set up around your use case.</p></article>
        <article className="rounded-[24px] border border-slate-200 bg-[#fbfcfa] p-6"><ShieldCheck className="size-5 text-emerald-700"/><h3 className="mt-4 font-bold">Validate</h3><p className="mt-2 text-sm leading-6 text-slate-600">The workspace is checked with the transactions and modules your team will actually use.</p></article>
        <article className="rounded-[24px] border border-slate-200 bg-[#fbfcfa] p-6"><Headphones className="size-5 text-emerald-700"/><h3 className="mt-4 font-bold">Onboard</h3><p className="mt-2 text-sm leading-6 text-slate-600">Your team gets a configured starting point instead of a blank ERP screen.</p></article>
      </div>
    </div></section>
    <CTA title="Set up the system once. Run the business every day."/>
    <MarketingFooter/>
  </main>;
}