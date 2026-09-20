import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Boxes, Check, Factory, PackageCheck, ShieldCheck, Warehouse } from "lucide-react";

export const metadata: Metadata = {
  title: "Manufacturing ERP Software Pakistan",
  description: "Manufacturing software for Pakistani factories with raw materials, BOMs, production runs, wastage, finished goods, warehouses, purchasing and accounting.",
  alternates: { canonical: "/industries/manufacturing" },
  openGraph: {
    title: "Manufacturing ERP Software Pakistan | MunshiOS",
    description: "Connect raw materials, BOMs, production, finished goods, warehouses and accounting in one system.",
    url: "/industries/manufacturing",
  },
};

const flows = [
  ["Raw material purchasing", "Create purchase orders, receive stock through GRN and keep supplier balances connected."],
  ["BOM control", "Define versioned bills of materials for the products you manufacture."],
  ["Production runs", "Consume materials, record finished output and capture wastage inside the production flow."],
  ["Warehouse stock", "Track stock movements, adjustments and transfers across managed warehouses."],
  ["Approvals and controls", "Use roles, permissions and approval steps around sensitive operational actions."],
  ["Connected accounting", "Keep receivables, payables, cash, bank and general ledger connected to business activity."],
];

export default function ManufacturingPage() {
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
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Manufacturing ERP Pakistan</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">Run purchasing, production, stock and accounting from one connected system.</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
              MunshiOS is built for factories and production businesses that need raw materials, BOMs, production runs, finished goods, wastage, warehouses and finance to stay connected.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/get-your-munshi" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white">
                Build my manufacturing Munshi <ArrowRight className="size-4" />
              </Link>
              <Link href="/pricing" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-800">See pricing</Link>
            </div>
          </div>

          <div className="rounded-[30px] border border-emerald-100 bg-emerald-50 p-6 sm:p-8">
            <Factory className="size-7 text-emerald-700" />
            <h2 className="mt-5 text-2xl font-semibold">Manufacturing workflow</h2>
            <div className="mt-6 space-y-3">
              {["Purchase raw materials", "Receive through GRN", "Move into warehouse stock", "Run BOM-based production", "Record output and wastage", "Update inventory and accounting"].map((item, index) => (
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
            const Icon = [PackageCheck, Boxes, Factory, Warehouse, ShieldCheck, Check][index];
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
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-400">Switch safely</p>
          <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-[-0.035em]">You can test MunshiOS beside your current Excel sheets or ERP during the free first month.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400">Set up products, suppliers, customers and opening balances first. Run real transactions before you decide whether to move your daily operation.</p>
          <Link href="/get-your-munshi" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-[#06151d]">
            Start the free month <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}
