import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "FAQ | MunshiOS",
  description: "Frequently asked questions about MunshiOS, paid onboarding, business data, modules, migration, support and subscriptions.",
};

const faqs = [
  ["Is my company data private?", "Each company operates in its own workspace with separate users, permissions and business records."],
  ["Is there a free trial?", "No. New customers must pay before a workspace can be created. Account registration alone does not activate the ERP."],
  ["Can I move data from Excel or another system?", "MunshiOS is designed to support structured migration for products, customers, suppliers, opening balances and supported records. The final migration flow depends on the source data."],
  ["Can I change modules later?", "Yes. MunshiOS uses configurable workspace modules so the setup can evolve as the business grows."],
  ["What happens if my subscription expires?", "Business data is retained, but normal transactions are restricted until renewal or verified activation."],
  ["How do I renew?", "Open the Subscription page, choose the plan and billing cycle you want, and send an activation request to the MunshiOS owner console."],
  ["Is online payment live?", "Not yet. New customers register and arrange the initial payment directly with MunshiOS. An MFA-verified administrator confirms the credited transaction before any business workspace can be created."],
  ["Does MunshiOS support Pakistani workflows?", "The product includes khata-style customer and supplier balances, credit days, opening balances, WHT, GRN workflows and PKR-first business flows."],
  ["Can posted financial records be deleted?", "Posted financial history is generally preserved and corrected through cancellation, void or reversal flows rather than destructive deletion."],
  ["Can I use MunshiOS on desktop?", "MunshiOS includes a Windows desktop client alongside the web experience. Desktop packaging and release hardening continue as part of the release process."],
];

export default function FaqPage() {
  return (
    <main className="min-h-screen bg-[#fbfcfa] text-slate-950">
      <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-6"><Link href="/" className="font-semibold tracking-tight">MunshiOS</Link><Link href="/get-your-munshi" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Get your Munshi</Link></div></header>
      <section className="border-b border-slate-200 bg-white"><div className="mx-auto max-w-5xl px-5 py-16 sm:px-6 sm:py-20"><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">FAQ</p><h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">Questions worth asking before trusting your business software.</h1><p className="mt-6 max-w-3xl text-lg leading-8 text-slate-600">Straight answers about access, billing, data, workflows and how MunshiOS is built.</p></div></section>
      <section className="mx-auto max-w-5xl px-5 py-14 sm:px-6"><div className="divide-y divide-slate-200 overflow-hidden rounded-[28px] border border-slate-200 bg-white px-5 sm:px-7">{faqs.map(([question, answer]) => <details key={question} className="group py-5"><summary className="cursor-pointer list-none text-base font-semibold">{question}</summary><p className="max-w-3xl pt-3 text-sm leading-6 text-slate-600">{answer}</p></details>)}</div><div className="mt-8 text-center text-sm text-slate-600">Still deciding? <Link href="/get-your-munshi" className="font-semibold text-emerald-700 hover:underline">Build your setup</Link>.</div></section>
    </main>
  );
}
