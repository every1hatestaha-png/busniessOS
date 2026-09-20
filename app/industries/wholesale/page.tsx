import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CircleDollarSign, PackageCheck, ReceiptText, ShoppingCart, Warehouse } from "lucide-react";

export const metadata: Metadata = {
  title: "Wholesale Distribution Software Pakistan",
  description: "Wholesale and distribution software for Pakistani businesses with purchase orders, GRN, warehouse stock, credit sales, customer khata, supplier ledgers, GST and WHT.",
  alternates: { canonical: "/industries/wholesale" },
  openGraph: {
    title: "Wholesale Distribution Software Pakistan | MunshiOS",
    description: "Connect GRN, warehouses, credit sales, khata, supplier ledgers and accounting in one system.",
    url: "/industries/wholesale",
  },
};

const flows = [
  ["Purchasing and GRN", "Create purchase orders, receive goods through GRN and keep supplier balances connected."],
  ["Warehouse inventory", "Track stock movements, adjustments and transfers across managed warehouses."],
  ["Credit sales", "Create credit sales with discounts, due tracking, returns and cancellations."],
  ["Customer khata", "Keep customer balances connected to invoices, receipts, returns and opening balances."],
  ["Supplier ledgers", "Track purchases, payments, returns, opening balances and payable settlement."],
  ["GST and WHT", "Use tax fields and withholding workflows already supported inside MunshiOS."],
];

export default function WholesalePage() {
  return (
    <main className="min-h-screen bg-[#fbfcfa] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-6">
          <Link href="/" className="font-semibold tracking-tight">MunshiOS</Link>
          <div className="flex items-center gap-2">
            <Link href="/industries" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Industries</Link>
            <Link href="/get-your-munshi" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Start free</Link>
          </div>
        </div>
      </header>

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-6 sm:py-20 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Wholesale software Pakistan</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">Keep purchasing, GRN, stock, credit sales and khata connected.</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
              MunshiOS is built for wholesalers, distributors and trading businesses that depend on accurate stock, customer balances, supplier ledgers and tax workflows.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/get-your-munshi" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white">
                Build my wholesale Munshi <ArrowRight className="size-4" />
              </Link>
              <Link href="/pricing" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-800">See pricing</Link>
            </div>
          </div>

          <div className="rounded-[30px] border border-emerald-100 bg-emerald-50 p-6 sm:p-8">
            <Warehouse className="size-7 text-emerald-700" />
            <h2 className="mt-5 text-2xl font-semibold">Wholesale workflow</h2>
            <div className="mt-6 space-y-3">
              {["Purchase order", "Goods receipt", "Warehouse stock", "Credit sale", "Customer khata", "Receipt and accounting"].map((item, index) => (
                <div key={item} className="flex items-center gap-3 rounded-2xl bg-white p-4">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">{index + 1}</span>
                  <span className="text-sm font-medium text-slate-700">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {flows.map(([title, text], index) => {
            const Icon = [PackageCheck, Warehouse, ShoppingCart, ReceiptText, CircleDollarSign, ReceiptText][index];
            return (
              <article key={title} className="rounded-[26px] border border-slate-200 bg-white p-6">
                <Icon className="size-5 text-emerald-700" />
                <h2 className="mt-4 font-semibold">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
              </article>
            );
          })}
        </div>

        <div className="mt-14 rounded-[30px] bg-[#071821] p-7 text-white sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-400">Move without disruption</p>
          <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-[-0.035em]">Run MunshiOS beside your current software during the free first month.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400">Test purchasing, GRN, warehouse stock, credit sales and khata with real transactions before moving your operation.</p>
          <Link href="/get-your-munshi" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-[#06151d]">
            Start the free month <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}
