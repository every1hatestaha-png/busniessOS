import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Factory,
  PackageCheck,
  Store,
  UtensilsCrossed,
  Wrench,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Industries | MunshiOS",
  description: "See how MunshiOS adapts to retail, restaurants, wholesale and distribution, manufacturing, and service businesses in Pakistan.",
};

const industries = [
  {
    icon: Store,
    title: "Retail",
    description: "A fast day-to-day operating system for shops, pharmacies, showrooms and growing retail businesses.",
    workflows: ["Sales & POS", "Inventory", "Purchases", "Customer khata", "Supplier khata", "Expenses", "Daily reporting"],
  },
  {
    icon: UtensilsCrossed,
    title: "Restaurant",
    description: "A modular setup for cafes, bakeries and food businesses that need front-counter and back-office control.",
    workflows: ["Orders & POS", "Tables", "Kitchen flow", "Recipes", "Ingredient stock", "Cash closing", "Daily sales"],
  },
  {
    icon: PackageCheck,
    title: "Wholesale & Distribution",
    description: "Built around the workflows trading businesses actually use: credit, GRNs, warehouses, settlements and ledgers.",
    workflows: ["Purchase orders", "GRN", "Warehouses", "Credit sales", "Customer ledger", "Supplier ledger", "GST / WHT", "Returns"],
  },
  {
    icon: Factory,
    title: "Manufacturing",
    description: "Connect raw materials, production and finished goods to the same accounting and inventory foundation.",
    workflows: ["Raw materials", "BOM", "Production", "Finished goods", "Wastage", "Warehouses", "Approvals", "Accounting"],
  },
  {
    icon: Wrench,
    title: "Services",
    description: "For workshops, agencies and service teams that need clients, jobs, expenses, collections and reporting.",
    workflows: ["Clients", "Quotations", "Billing", "Receipts", "Expenses", "Team access", "Reports"],
  },
];

export default function IndustriesPage() {
  return (
    <main className="min-h-screen bg-[#fbfcfa] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-6">
          <Link href="/" className="font-semibold tracking-tight">MunshiOS</Link>
          <div className="flex items-center gap-2">
            <Link href="/" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Back to website</Link>
            <Link href="/get-your-munshi" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Get your Munshi</Link>
          </div>
        </div>
      </header>

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Industries</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">One business platform, shaped around how your industry actually works.</h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-600">MunshiOS uses a shared accounting, inventory and access foundation, then enables the modules and workflows your business needs instead of forcing every company into the same screen set.</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14 sm:px-6 sm:py-18">
        <div className="grid gap-5 lg:grid-cols-2">
          {industries.map(({ icon: Icon, title, description, workflows }, index) => (
            <article key={title} className={`rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_-38px_rgba(15,23,42,.35)] ${index === 2 ? "lg:col-span-2" : ""}`}>
              <div className="flex items-start gap-4">
                <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><Icon className="size-5" /></div>
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
                </div>
              </div>
              <div className={`mt-6 grid gap-2 border-t border-slate-100 pt-5 ${index === 2 ? "sm:grid-cols-4" : "sm:grid-cols-2"}`}>
                {workflows.map((workflow) => <div key={workflow} className="flex items-center gap-2 text-sm text-slate-700"><Check className="size-4 text-emerald-600" />{workflow}</div>)}
              </div>
            </article>
          ))}
        </div>

        <div className="mt-10 rounded-[30px] bg-[#071821] p-7 text-white sm:p-9">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-400">Not a perfect match?</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">Build the closest setup, then enable only the modules you need.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">The goal is one connected platform, not one rigid template for every business.</p>
            </div>
            <Link href="/get-your-munshi" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700">Build my Munshi <ArrowRight className="size-4" /></Link>
          </div>
        </div>
      </section>
    </main>
  );
}
