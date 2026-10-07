import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Headphones, RefreshCw, ShieldCheck, Wrench } from "lucide-react";
import { MarketingHeader, MarketingFooter, CTA } from "@/components/marketing/site";

export const metadata: Metadata = {
  title: "Pricing",
  description: "MunshiOS pricing: PKR 29,000 one-time implementation and PKR 5,000 per month.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage(){
  return <main className="min-h-screen bg-[#fbfcfa] text-slate-950">
    <MarketingHeader/>

    <section className="bg-white"><div className="mx-auto max-w-[1180px] px-5 py-16 text-center sm:px-6 sm:py-20"><div className="mx-auto flex w-fit items-center gap-2 text-[11px] font-bold uppercase tracking-[.16em] text-emerald-800"><span className="h-px w-6 bg-emerald-500"/>Pricing</div><h1 className="mx-auto mt-5 max-w-4xl text-5xl font-semibold leading-[.98] tracking-[-.058em] sm:text-6xl">Set the system up properly once. Keep it running every month.</h1><p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-slate-600">MunshiOS is implemented around your business first, then kept active on one clear monthly subscription.</p></div></section>

    <section className="border-y border-slate-200 bg-white py-16 sm:py-20"><div className="mx-auto max-w-[1120px] px-5 sm:px-6">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-stretch">
        <article className="rounded-[30px] border border-slate-200 bg-[#fbfcfa] p-7 sm:p-9"><div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">Step 01 · Implementation</p><p className="mt-4 text-5xl font-semibold tracking-[-.055em]">PKR 29,000</p><p className="mt-1 text-sm text-slate-500">one time</p></div><div className="grid size-12 place-items-center rounded-2xl bg-white text-emerald-700 ring-1 ring-slate-200"><Wrench className="size-5"/></div></div><p className="mt-6 text-sm leading-7 text-slate-600">Configure the workspace around the way the business actually operates instead of handing over a blank ERP login.</p><div className="mt-7 space-y-3 border-t border-slate-200 pt-6">{["Business workspace setup","Industry workflow configuration","Users and role structure","Products / customers / suppliers structure","Guided onboarding"].map(x=><p key={x} className="flex items-start gap-2 text-sm text-slate-700"><Check className="mt-0.5 size-4 shrink-0 text-emerald-600"/>{x}</p>)}</div></article>
        <div className="hidden items-center justify-center lg:flex"><ArrowRight className="size-5 text-slate-300"/></div>
        <article className="rounded-[30px] bg-[#061D2E] p-7 text-white sm:p-9"><div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-emerald-300">Step 02 · Ongoing software</p><p className="mt-4 text-5xl font-semibold tracking-[-.055em]">PKR 5,000</p><p className="mt-1 text-sm text-slate-500">per month</p></div><div className="grid size-12 place-items-center rounded-2xl bg-white/10 text-emerald-300"><RefreshCw className="size-5"/></div></div><p className="mt-6 text-sm leading-7 text-slate-400">Keep the configured workspace active, updated and available to the team after implementation.</p><div className="mt-7 space-y-3 border-t border-white/10 pt-6">{["Ongoing MunshiOS access","Configured business workspace","Product updates","Operational modules included in setup","Standard support"].map(x=><p key={x} className="flex items-start gap-2 text-sm text-slate-300"><Check className="mt-0.5 size-4 shrink-0 text-emerald-400"/>{x}</p>)}</div></article>
      </div>
      <div className="mt-9 text-center"><Link href="/sign-up" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#061D2E] px-6 py-3 text-sm font-bold text-white">Start implementation <ArrowRight className="size-4"/></Link></div>
    </div></section>

    <section className="py-16 sm:py-20"><div className="mx-auto grid max-w-[1180px] gap-10 px-5 sm:px-6 lg:grid-cols-[.72fr_1.28fr]"><div><p className="text-[11px] font-bold uppercase tracking-[.16em] text-emerald-700">What implementation means</p><h2 className="mt-4 text-4xl font-semibold tracking-[-.05em] sm:text-5xl">The fee is for getting the software into a usable business state.</h2><p className="mt-5 text-sm leading-7 text-slate-600">The implementation phase is about fitting the operating model, not selling another license tier.</p></div><div className="divide-y divide-slate-200 border-y border-slate-200">{[[Wrench,"Configure","Business type, workflows, users and operating structure."],[ShieldCheck,"Validate","Check the transactions and modules the team will actually use."],[Headphones,"Onboard","Give the team a configured starting point instead of a blank screen."]].map(([Icon,a,b])=>{const I=Icon as typeof Wrench;return <div key={a as string} className="flex gap-5 py-6"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><I className="size-4"/></div><div><h3 className="font-bold">{a as string}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{b as string}</p></div></div>})}</div></div></section>

    <CTA title="Set up the system once. Run the business every day."/>
    <MarketingFooter/>
  </main>;
}