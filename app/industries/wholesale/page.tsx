import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, Check, CircleDollarSign, PackageCheck, ReceiptText, ShoppingCart, Warehouse } from "lucide-react";
import { MarketingHeader, MarketingFooter, CTA } from "@/components/marketing/site";
import { WholesaleVisual } from "@/components/marketing/premium-visuals";

export const metadata: Metadata = {
  title: "Wholesale Distribution Software Pakistan",
  description: "Wholesale software for Pakistani businesses with purchasing, GRN, stock, credit sales, receivables, cash and reporting.",
  alternates: { canonical: "/industries/wholesale" },
};

const flow = [
  ["01","Purchase","Create the supplier order"],
  ["02","GRN","Receive stock against the order"],
  ["03","Inventory","Warehouse quantities change"],
  ["04","Credit sale","Customer balance opens"],
  ["05","Collection","Payment reduces receivable"],
  ["06","Cash / Bank","Money lands in the right account"],
  ["07","Ledger","Customer / supplier context stays intact"],
  ["08","Reports","Same records, no rebuild"],
] as const;

export default function WholesalePage(){
  return <main className="min-h-screen bg-[#fbfcfa] text-slate-950">
    <MarketingHeader/>

    <section className="bg-white"><div className="mx-auto grid max-w-[1400px] gap-12 px-5 py-14 sm:px-6 lg:grid-cols-[.76fr_1.24fr] lg:items-center lg:px-10 lg:py-20"><div className="max-w-xl"><div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.16em] text-emerald-800"><span className="h-px w-6 bg-emerald-500"/>Wholesale operations</div><h1 className="mt-6 text-5xl font-semibold leading-[.98] tracking-[-.058em] sm:text-6xl">Stop chasing numbers across the business.</h1><p className="mt-6 text-base leading-8 text-slate-600 sm:text-lg">Purchasing, receiving, stock, credit sales, receivables, collections, cash and reporting in one wholesale operating flow.</p><div className="mt-8 flex flex-col gap-3 sm:flex-row"><Link href="/sign-up" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#061D2E] px-5 py-3 text-sm font-bold text-white">Get MunshiOS <ArrowRight className="size-4"/></Link><Link href="/pricing" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold">See pricing</Link></div></div><WholesaleVisual/></div></section>

    <section className="bg-[#061D2E] py-16 text-white sm:py-20"><div className="mx-auto grid max-w-[1320px] gap-10 px-5 sm:px-6 lg:grid-cols-[.72fr_1.28fr] lg:items-center lg:px-10"><div><p className="text-[11px] font-bold uppercase tracking-[.16em] text-emerald-300">Customer case study</p><h2 className="mt-5 text-5xl font-semibold leading-[1] tracking-[-.055em] sm:text-6xl">Ahmad Traders</h2><p className="mt-4 text-2xl font-semibold text-emerald-300">“Sab kuch aik hi jagah.”</p><p className="mt-6 max-w-lg text-sm leading-7 text-slate-400">The problem was not the lack of another screen. It was the lack of one connected operational story. Sales, stock, receivables, payments and reports were being treated like separate jobs.</p><div className="mt-8 grid grid-cols-3 gap-3">{[["Sales","Connected"],["Stock","Traceable"],["Collections","Visible"]].map(([a,b])=><div key={a} className="border-t border-white/15 pt-3"><p className="text-[9px] uppercase tracking-[.12em] text-slate-500">{a}</p><p className="mt-1 text-xs font-bold">{b}</p></div>)}</div></div><div className="grid gap-4 sm:grid-cols-2"><div className="border-t border-white/15 pt-5"><p className="text-xs font-bold text-rose-300">Before</p><div className="mt-4 space-y-4">{[["Sale recorded","Stock checked elsewhere"],["Customer due","Separate khata follow-up"],["Payment received","Hard to trace back"],["Report needed","Rebuild from multiple places"]].map(([a,b])=><div key={a}><p className="text-sm font-semibold">{a}</p><p className="mt-1 text-xs text-slate-500">{b}</p></div>)}</div></div><div className="border-t border-emerald-400/30 pt-5"><p className="text-xs font-bold text-emerald-300">With MunshiOS</p><div className="mt-4 space-y-4">{[["Credit sale","Receivable opens in context"],["Stock movement","Warehouse quantity changes"],["Collection","Customer balance reduces"],["Reports","Same source records"]].map(([a,b])=><div key={a}><p className="text-sm font-semibold">{a}</p><p className="mt-1 text-xs text-slate-400">{b}</p></div>)}</div></div></div></div></section>

    <section className="py-16 sm:py-20"><div className="mx-auto max-w-[1320px] px-5 sm:px-6 lg:px-10"><div className="grid gap-10 lg:grid-cols-[.7fr_1.3fr]"><div><p className="text-[11px] font-bold uppercase tracking-[.16em] text-emerald-700">The operating chain</p><h2 className="mt-4 text-4xl font-semibold tracking-[-.05em] sm:text-5xl">From supplier purchase to final report without losing the trail.</h2><p className="mt-5 text-sm leading-7 text-slate-600">Each step changes something real in the business. The value is keeping those consequences connected.</p></div><div className="grid gap-x-5 gap-y-0 sm:grid-cols-2">{flow.map(([n,a,b],i)=><div key={a} className="relative border-t border-slate-200 py-5 sm:pr-5"><div className="flex items-start gap-4"><span className={`text-[10px] font-bold ${i===flow.length-1?"text-emerald-700":"text-slate-400"}`}>{n}</span><div><p className="text-sm font-bold">{a}</p><p className="mt-1 text-xs leading-5 text-slate-500">{b}</p></div></div></div>)}</div></div></div></section>

    <section className="border-y border-slate-200 bg-white py-16 sm:py-20"><div className="mx-auto max-w-[1320px] px-5 sm:px-6 lg:px-10"><div className="grid gap-10 lg:grid-cols-[1.15fr_.85fr] lg:items-center"><WholesaleVisual/><div><p className="text-[11px] font-bold uppercase tracking-[.16em] text-emerald-700">What the operator keeps checking</p><h2 className="mt-4 text-4xl font-semibold tracking-[-.05em]">Not modules. Questions.</h2><div className="mt-7 divide-y divide-slate-200 border-y border-slate-200">{[["Who owes us money?","Receivables + collection priority",CircleDollarSign],["What came in?","Purchasing + GRN",PackageCheck],["What do we actually have?","Warehouse inventory",Warehouse],["What sold on credit?","Sales + customer balance",ShoppingCart],["Where did the money land?","Cash & Bank",ReceiptText],["What changed today?","Reports",BarChart3]].map(([q,a,Icon])=>{const I=Icon as typeof Warehouse;return <div key={q as string} className="flex items-center gap-4 py-4"><I className="size-4 shrink-0 text-emerald-700"/><div><p className="text-sm font-bold">{q as string}</p><p className="mt-1 text-xs text-slate-500">{a as string}</p></div></div>})}</div></div></div></div></section>

    <section className="py-16 sm:py-20"><div className="mx-auto max-w-[1180px] px-5 text-center sm:px-6"><p className="text-[11px] font-bold uppercase tracking-[.16em] text-slate-400">The wholesale promise</p><h2 className="mx-auto mt-5 max-w-4xl text-4xl font-semibold tracking-[-.05em] sm:text-6xl">A wholesaler should be able to answer “what happened?” without opening five different records.</h2><div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm text-slate-600">{["Purchases","GRN","Stock","Credit sales","Receivables","Collections","Cash / Bank","Reports"].map(x=><span key={x} className="flex items-center gap-2"><Check className="size-4 text-emerald-600"/>{x}</span>)}</div></div></section>

    <CTA title="Run wholesale without chasing the records."/>
    <MarketingFooter/>
  </main>;
}