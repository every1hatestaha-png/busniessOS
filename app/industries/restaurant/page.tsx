import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, ReceiptText, UtensilsCrossed, Warehouse } from "lucide-react";

export const metadata: Metadata = {
  title: "Restaurant Inventory & Operations Software Pakistan",
  description: "Restaurant software for Pakistani businesses with tables, recipes, kitchen flow, ingredient stock, purchases and cash closing.",
  alternates: { canonical: "/industries/restaurant" },
};

const flows = [
  [UtensilsCrossed, "Tables & orders", "Keep table service and order activity inside the same operating workspace."],
  [ReceiptText, "Kitchen flow", "Move orders into kitchen ticket workflows without rebuilding them elsewhere."],
  [Warehouse, "Ingredient stock", "Connect ingredient usage, receiving and stock tracking to daily operations."],
  [Check, "Cash closing", "Bring sales, expenses and closing activity together for daily review."],
];

export default function RestaurantPage() {
  return <main className="min-h-screen bg-[#fbfcfa] text-slate-950"><header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-6"><Link href="/" className="font-semibold tracking-tight">MunshiOS</Link><Link href="/get-your-munshi" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Start your free month</Link></div></header><section className="border-b border-slate-200 bg-white"><div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-6 sm:py-20 lg:grid-cols-[.9fr_1.1fr] lg:items-center"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Restaurant software Pakistan</p><h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">Connect orders, recipes, ingredient stock and closing.</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">MunshiOS gives restaurant teams one place to manage operational flow instead of splitting orders, stock and cash control across separate tools.</p><Link href="/get-your-munshi" className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white">Start your free month <ArrowRight className="size-4" /></Link></div><div className="rounded-[30px] border border-emerald-100 bg-emerald-50 p-6 sm:p-8"><UtensilsCrossed className="size-7 text-emerald-700" /><h2 className="mt-5 text-2xl font-semibold">Restaurant workflow</h2><div className="mt-6 space-y-3">{["Take order", "Send kitchen ticket", "Consume ingredients", "Update stock", "Close the day"].map((item,index) => <div key={item} className="flex items-center gap-3 rounded-2xl bg-white p-4"><span className="grid size-8 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">{index+1}</span><span className="text-sm font-medium text-slate-700">{item}</span></div>)}</div></div></div></section><section className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20"><div className="grid gap-5 md:grid-cols-2">{flows.map(([Icon,title,text]) => { const FlowIcon = Icon as typeof UtensilsCrossed; return <article key={title as string} className="rounded-[26px] border border-slate-200 bg-white p-6"><FlowIcon className="size-5 text-emerald-700" /><h2 className="mt-4 font-semibold">{title as string}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{text as string}</p></article>; })}</div></section></main>;
}
