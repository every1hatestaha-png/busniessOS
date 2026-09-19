import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, Boxes, Building2, CircleDollarSign, PackageCheck, ShieldCheck, ShoppingCart, Sparkles, Warehouse } from "lucide-react";

export const metadata: Metadata = {
  title: "Features | MunshiOS",
  description: "Explore MunshiOS modules for sales, purchases, inventory, accounting, reporting, warehouses and business workflows.",
};

const features = [
  [Warehouse, "Inventory & warehouses", "Live stock, stock movements, adjustments, transfers, weighted valuation and multi-warehouse control."],
  [ShoppingCart, "Sales & customer accounts", "Credit sales, per-unit discounts, receipts, returns, cancellations, customer khata and due tracking."],
  [PackageCheck, "Purchases & GRN", "Purchase orders, weighted receiving, supplier balances, WHT, returns, reversals and payable settlement."],
  [CircleDollarSign, "Accounting", "Connected ledgers, cash and bank accounts, expenses, receivables, payables, general ledger and reversals."],
  [BarChart3, "Reports & action center", "Aaj ka Munshi, aging, statements, P&L, stock movement, cash/bank reporting and operational alerts."],
  [Building2, "Multi-business setup", "Configurable modules, business-specific workspaces, roles, permissions and secure workspace isolation."],
  [Boxes, "Industry modules", "Retail, restaurant, wholesale, manufacturing and service workflows on one shared platform foundation."],
  [ShieldCheck, "Controls & audit", "MFA-protected platform controls, audit trails, safe reversals, rate limiting and tenant-scoped authorization."],
];

export default function FeaturesPage() {
  return (
    <main className="min-h-screen bg-[#fbfcfa] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-6">
          <Link href="/" className="font-semibold tracking-tight">MunshiOS</Link>
          <div className="flex items-center gap-2"><Link href="/" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Back to website</Link><Link href="/get-your-munshi" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Get your Munshi</Link></div>
        </div>
      </header>
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Features</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">A connected business system, not a collection of disconnected screens.</h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-600">MunshiOS links sales, purchasing, stock, khata and accounting so one operational action updates the rest of the business correctly.</p>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-5 py-14 sm:px-6">
        <div className="grid gap-5 md:grid-cols-2">
          {features.map(([Icon, title, description]) => {
            const FeatureIcon = Icon as typeof Warehouse;
            return <article key={title as string} className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-[0_16px_45px_-36px_rgba(15,23,42,.35)]"><div className="grid size-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><FeatureIcon className="size-5" /></div><h2 className="mt-5 text-lg font-semibold">{title as string}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{description as string}</p></article>;
          })}
        </div>
        <div className="mt-10 rounded-[30px] bg-[#071821] p-7 text-white sm:p-9"><Sparkles className="size-5 text-emerald-400" /><h2 className="mt-4 text-2xl font-semibold">Build only what your business needs.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Use Get Your Munshi to choose an industry, select modules and create a workspace around your operation.</p><Link href="/get-your-munshi" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white">Build my Munshi <ArrowRight className="size-4" /></Link></div>
      </section>
    </main>
  );
}
