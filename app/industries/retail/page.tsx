import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, ReceiptText, ShoppingCart, Store, Users, Warehouse } from "lucide-react";

export const metadata: Metadata = {
  title: "Retail Accounting & Inventory Software Pakistan",
  description: "Retail software for Pakistani shops with sales, inventory, purchases, customer khata, supplier balances, expenses and daily reporting.",
  alternates: { canonical: "/industries/retail" },
};

const flows = [
  [ReceiptText, "Sales & receipts", "Record sales, discounts, receipts and returns in the same workspace."],
  [Warehouse, "Inventory", "Track stock on hand, adjustments and warehouse movements."],
  [ShoppingCart, "Purchasing", "Receive purchases through GRN and keep supplier balances connected."],
  [Users, "Customer khata", "See customer balances and payment history without maintaining a separate register."],
  [Check, "Daily control", "Review expenses, receivables, payables and core reports from one system."],
];

export default function RetailPage() {
  return <main className="min-h-screen bg-[#fbfcfa] text-slate-950"><header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-6"><Link href="/" className="font-semibold tracking-tight">MunshiOS</Link><Link href="/get-your-munshi" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Start your free month</Link></div></header><section className="border-b border-slate-200 bg-white"><div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-6 sm:py-20 lg:grid-cols-[.9fr_1.1fr] lg:items-center"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Retail software Pakistan</p><h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">Keep sales, stock, khata and purchasing in one place.</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">MunshiOS helps growing retailers replace disconnected registers and spreadsheets with one connected business workspace.</p><Link href="/get-your-munshi" className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white">Start your free month <ArrowRight className="size-4" /></Link></div><div className="rounded-[30px] border border-emerald-100 bg-emerald-50 p-6 sm:p-8"><Store className="size-7 text-emerald-700" /><h2 className="mt-5 text-2xl font-semibold">Retail workflow</h2><div className="mt-6 space-y-3">{["Sell", "Update stock", "Track customer balance", "Receive purchases", "Review daily reports"].map((item,index) => <div key={item} className="flex items-center gap-3 rounded-2xl bg-white p-4"><span className="grid size-8 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">{index+1}</span><span className="text-sm font-medium text-slate-700">{item}</span></div>)}</div></div></div></section><section className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20"><div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{flows.map(([Icon,title,text]) => { const FlowIcon = Icon as typeof Store; return <article key={title as string} className="rounded-[26px] border border-slate-200 bg-white p-6"><FlowIcon className="size-5 text-emerald-700" /><h2 className="mt-4 font-semibold">{title as string}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{text as string}</p></article>; })}</div></section></main>;
}
