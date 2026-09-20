import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

export const metadata: Metadata = {
  title: "Pricing | MunshiOS",
  description: "MunshiOS pricing for Pakistani businesses, with a 30-day trial and configurable modules.",
};

const plans = [
  { name: "Munshi Core", price: "Rs. 2,990 / month", description: "For small businesses that need a reliable connected foundation.", features: ["Sales & purchases", "Customers & suppliers", "Khata & expenses", "Inventory", "Core reports"] },
  { name: "Custom Munshi", price: "Build yours", description: "Choose your business type and enable only the modules you need.", features: ["Everything in Core", "Industry modules", "Configurable workspace", "Module-based setup", "30-day trial"] },
  { name: "Business+", price: "Custom", description: "For more complex workflows, larger teams and implementation support.", features: ["Advanced workflows", "Custom reports", "Migration planning", "Priority onboarding", "Tailored implementation"] },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[#fbfcfa] text-slate-950">
      <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-6"><Link href="/" className="font-semibold tracking-tight">MunshiOS</Link><div className="flex items-center gap-2"><Link href="/" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Back to website</Link><Link href="/get-your-munshi" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Start free</Link></div></div></header>
      <section className="border-b border-slate-200 bg-white"><div className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20"><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Pricing</p><h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">Use MunshiOS free for 30 days. Then choose the plan your business needs.</h1><p className="mt-6 max-w-3xl text-lg leading-8 text-slate-600">No card is charged during the 30-day trial. You review your modules and price before creating your account.</p></div></section>
      <section className="mx-auto max-w-6xl px-5 py-14 sm:px-6">
        <div className="grid gap-5 lg:grid-cols-3">{plans.map((plan, index) => <article key={plan.name} className={`rounded-[28px] border bg-white p-7 ${index === 1 ? "border-emerald-400 shadow-[0_24px_65px_-38px_rgba(5,150,105,.65)]" : "border-slate-200"}`}><p className="text-sm font-bold">{plan.name}</p><p className="mt-5 text-3xl font-semibold tracking-tight">{plan.price}</p><p className="mt-4 min-h-16 text-sm leading-6 text-slate-600">{plan.description}</p><div className="mt-6 space-y-3 border-t border-slate-100 pt-5">{plan.features.map((feature) => <div key={feature} className="flex items-center gap-2 text-sm text-slate-700"><Check className="size-4 text-emerald-600" />{feature}</div>)}</div><Link href="/get-your-munshi" className={`mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold ${index === 1 ? "bg-emerald-600 text-white" : "border border-slate-200 text-slate-800"}`}>Start 30-day trial <ArrowRight className="size-4" /></Link></article>)}</div>
        <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950"><strong>Billing note:</strong> your module price is shown before account creation. Paid activation happens after the 30-day trial.</div>
      </section>
    </main>
  );
}
