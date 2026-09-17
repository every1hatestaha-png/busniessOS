import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Check,
  Factory,
  Layers3,
  LockKeyhole,
  PackageCheck,
  ReceiptText,
  Store,
  UtensilsCrossed,
} from "lucide-react";
import { redirect } from "next/navigation";

import { getCurrentWorkspace } from "@/lib/server/auth";

const businesses = [
  {
    icon: Store,
    title: "Retail",
    description: "POS, inventory, purchases, khata and daily reporting.",
  },
  {
    icon: UtensilsCrossed,
    title: "Restaurants",
    description: "Orders, tables, kitchen workflow, recipes and stock.",
  },
  {
    icon: PackageCheck,
    title: "Wholesale",
    description: "GRNs, credit sales, supplier balances and receivables.",
  },
  {
    icon: Factory,
    title: "Manufacturing",
    description: "Raw materials, production, wastage and finished goods.",
  },
];

const coreFeatures = [
  "Sales & purchasing",
  "Customers & suppliers",
  "Khata, payments & expenses",
  "Professional documents",
  "Roles & permissions",
  "Business reports",
];

export default async function Home() {
  const context = await getCurrentWorkspace();
  if (context) redirect("/dashboard");

  return (
    <main className="min-h-screen bg-[#fafaf8] text-slate-950">
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-[#fafaf8]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
          <Link href="/" className="flex items-center gap-3 font-semibold tracking-tight">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-950 text-sm font-bold text-white">M</span>
            <span className="text-lg">MunshiOS</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-slate-600 md:flex">
            <a href="#how-it-works" className="transition hover:text-slate-950">How it works</a>
            <a href="#industries" className="transition hover:text-slate-950">Industries</a>
            <a href="#pricing" className="transition hover:text-slate-950">Pricing</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/sign-in" className="rounded-xl px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-white">Login</Link>
            <Link href="/get-your-munshi" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700">
              Get your Munshi
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 -z-0 h-[520px] bg-[radial-gradient(circle_at_50%_0%,rgba(16,185,129,0.12),transparent_58%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-14 px-5 pb-20 pt-20 lg:grid-cols-[1.08fr_.92fr] lg:px-8 lg:pb-28 lg:pt-28">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
              <Layers3 className="h-3.5 w-3.5" /> Built around your business
            </div>
            <h1 className="text-balance text-5xl font-semibold tracking-[-0.045em] text-slate-950 sm:text-6xl lg:text-7xl">
              Your business deserves its own Munshi.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
              Tell us how your business works. MunshiOS recommends the right modules, removes what you do not need, and gives your team one simple system to run the business.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/get-your-munshi" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800">
                Build my Munshi <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/sign-in" className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300">
                I already have a Munshi
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
              <span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600" /> From Rs 2,990/month</span>
              <span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600" /> Add modules anytime</span>
              <span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600" /> One secure workspace</span>
            </div>
          </div>

          <div className="relative lg:pt-3">
            <div className="rounded-[28px] border border-slate-200 bg-white p-3 shadow-[0_28px_80px_-35px_rgba(15,23,42,.28)]">
              <div className="rounded-[22px] border border-slate-100 bg-slate-950 p-6 text-white">
                <div className="flex items-center justify-between border-b border-white/10 pb-5">
                  <div>
                    <p className="text-xs text-slate-400">Your Munshi</p>
                    <p className="mt-1 text-xl font-semibold">Wholesale & Distribution</p>
                  </div>
                  <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-medium text-emerald-300">Ready</span>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  {[
                    ["Sales today", "Rs 482,400"],
                    ["Receivables", "Rs 1.82m"],
                    ["Stock value", "Rs 4.36m"],
                    ["Payables", "Rs 910,200"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                      <p className="text-xs text-slate-400">{label}</p>
                      <p className="mt-2 text-lg font-semibold tracking-tight">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-2xl bg-white p-4 text-slate-950">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-500">Recommended modules</p>
                      <p className="mt-1 font-semibold">Built for how you trade</p>
                    </div>
                    <span className="text-xs font-semibold text-emerald-700">8 enabled</span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    {["Inventory", "GRN", "Khata", "GST", "WHT", "Returns"].map((item) => (
                      <span key={item} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-slate-600">{item}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="industries" className="border-y border-slate-200 bg-white py-20">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-emerald-700">One platform. Different Munshis.</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">A restaurant should not run like a wholesaler.</h2>
            <p className="mt-4 text-slate-600">Start with an industry setup, then switch features on or off as your business actually needs them.</p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {businesses.map(({ icon: Icon, title, description }) => (
              <div key={title} className="rounded-2xl border border-slate-200 bg-[#fafaf8] p-6">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-white shadow-sm"><Icon className="h-5 w-5 text-emerald-700" /></div>
                <h3 className="mt-5 font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="py-24">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr]">
            <div>
              <p className="text-sm font-semibold text-emerald-700">Get your own Munshi</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Software that asks about your business first.</h2>
              <p className="mt-4 leading-7 text-slate-600">No ERP jargon. Answer a few practical questions and MunshiOS prepares the right setup for you.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ["01", "Choose your business", "Restaurant, retail, wholesale, manufacturing or another business type."],
                ["02", "Customize your Munshi", "Review recommended modules and turn features on or off."],
                ["03", "Pay & start", "See one clear monthly price, create your account and enter your workspace."],
              ].map(([step, title, text]) => (
                <div key={step} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <span className="text-xs font-bold text-emerald-700">{step}</span>
                  <h3 className="mt-7 font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="bg-slate-950 py-24 text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 lg:grid-cols-[1fr_.9fr] lg:px-8">
          <div>
            <p className="text-sm font-semibold text-emerald-400">Simple base. Powerful add-ons.</p>
            <h2 className="mt-3 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">Start small. Pay more only when your business needs more.</h2>
            <p className="mt-5 max-w-xl leading-7 text-slate-400">Munshi Core covers everyday business operations. Industry modules add deeper workflows such as restaurant operations, distribution, manufacturing and multi-branch control.</p>
            <Link href="/get-your-munshi" className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400">
              Calculate my price <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-7">
            <div className="flex items-end justify-between gap-4 border-b border-white/10 pb-6">
              <div>
                <p className="text-sm text-slate-400">Munshi Core</p>
                <p className="mt-2 text-4xl font-semibold tracking-tight">Rs 2,990<span className="text-base font-normal text-slate-400"> / month</span></p>
              </div>
              <ReceiptText className="h-7 w-7 text-emerald-400" />
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {coreFeatures.map((feature) => (
                <div key={feature} className="flex items-center gap-2 text-sm text-slate-300"><Check className="h-4 w-4 text-emerald-400" /> {feature}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="rounded-[28px] border border-emerald-200 bg-emerald-50 p-8 sm:p-12">
            <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-center">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><LockKeyhole className="h-4 w-4" /> Your business stays your business</div>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight">One MunshiOS. A private workspace for every company.</h2>
                <p className="mt-4 text-slate-600">Your team, data, modules, permissions and custom workflows live inside your own workspace. Another company gets its own completely separate setup.</p>
              </div>
              <Link href="/get-your-munshi" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 py-3.5 text-sm font-semibold text-white">
                Get your Munshi <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <div className="flex items-center gap-2"><Building2 className="h-4 w-4" /> MunshiOS — Har karobar ka digital system.</div>
          <div className="flex gap-5"><Link href="/sign-in">Login</Link><Link href="/get-your-munshi">Get your Munshi</Link></div>
        </div>
      </footer>
    </main>
  );
}
