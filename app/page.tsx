import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronRight,
  Factory,
  Headphones,
  LockKeyhole,
  MessageCircle,
  PackageCheck,
  PlayCircle,
  ReceiptText,
  ShieldCheck,
  Store,
  UtensilsCrossed,
  Warehouse,
  Zap,
} from "lucide-react";

const businesses = [
  {
    icon: Store,
    title: "Retail",
    description: "For stores, showrooms, pharmacies and growing retailers.",
    modules: ["Sales / POS", "Inventory", "Purchases", "Customer khata", "Supplier khata", "Expenses", "Daily reports"],
  },
  {
    icon: UtensilsCrossed,
    title: "Restaurants",
    description: "For restaurants, cafes, bakeries and food businesses.",
    modules: ["POS & orders", "Tables", "Kitchen workflow", "Recipes", "Ingredient stock", "Cash closing", "Daily sales"],
  },
  {
    icon: PackageCheck,
    title: "Wholesale",
    description: "For distributors, traders, auto-parts and wholesale businesses.",
    modules: ["Purchase orders", "GRN", "Inventory", "Credit sales", "Customer ledger", "Supplier ledger", "GST / WHT", "Returns"],
  },
  {
    icon: Factory,
    title: "Manufacturing",
    description: "For factories, production units and engineering businesses.",
    modules: ["Raw materials", "BOM", "Production", "Finished goods", "Wastage", "Warehouses", "Approvals", "Accounting"],
  },
];

const coreFeatures = [
  "Sales & purchases",
  "Customers & suppliers",
  "Khata, payments & expenses",
  "Professional documents",
  "Roles & permissions",
  "Business reports",
];

const priceExamples = [
  ["Munshi Core", "Rs 2,990", "Sales, purchases, parties, khata, expenses, documents, reports"],
  ["Retail setup", "From Rs 4,490", "Core + inventory & warehouse"],
  ["Wholesale setup", "From Rs 7,990", "Core + inventory + distribution + advanced accounting"],
  ["Restaurant setup", "From Rs 8,490", "Core + inventory + restaurant operations"],
  ["Manufacturing setup", "From Rs 13,990", "Core + inventory + distribution + manufacturing + accounting"],
];

const faqs = [
  ["Is my company data private?", "Yes. Each company operates in its own workspace with separate users, permissions and business data. Access to app routes is authenticated and workspace-scoped."],
  ["Can you move data from my old software or Excel?", "Yes. We can plan imports for products, customers, suppliers, opening balances and other supported records. The exact migration depends on the quality and format of your existing data."],
  ["Can I add or remove features later?", "Yes. MunshiOS is designed around modules. Your setup can grow as your business adds inventory, branches, accounting, manufacturing or other workflows."],
  ["What if my business works differently?", "Choose the closest industry setup and customize it. For genuinely unique workflows, MunshiOS can support a custom implementation rather than forcing your business into a generic template."],
  ["Can I cancel?", "Subscription cancellation and billing terms will be shown clearly before paid checkout. We do not want customers trapped in a plan they no longer need."],
  ["How do I get support?", "Support will be available through the MunshiOS team, with WhatsApp as a primary channel for Pakistani businesses once the support number is connected."],
];

export default function Home() {
  const whatsappNumber = process.env.NEXT_PUBLIC_MUNSHIOS_WHATSAPP?.replace(/\D/g, "");
  const whatsappHref = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent("Salam, I want to know more about MunshiOS.")}`
    : "/get-your-munshi?intent=contact";

  return (
    <main className="min-h-screen bg-[#fafaf8] text-slate-950">
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-[#fafaf8]/92 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-5 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <Image src="/brand/munshios-mark.svg" alt="MunshiOS" width={38} height={38} priority />
            <span className="text-lg">MunshiOS</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-slate-600 lg:flex">
            <a href="#product" className="transition hover:text-slate-950">Product</a>
            <a href="#industries" className="transition hover:text-slate-950">Industries</a>
            <a href="#pricing" className="transition hover:text-slate-950">Pricing</a>
            <a href="#faq" className="transition hover:text-slate-950">FAQ</a>
          </nav>
          <div className="flex items-center gap-1 sm:gap-2">
            <Link href="/sign-in" className="rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-white sm:px-4">Login</Link>
            <Link href="/get-your-munshi" className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 sm:px-4">
              Get your Munshi
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[560px] bg-[radial-gradient(circle_at_50%_0%,rgba(16,185,129,0.13),transparent_60%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-5 pb-20 pt-16 lg:grid-cols-[1.08fr_.92fr] lg:px-8 lg:pb-28 lg:pt-24">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
              <Zap className="h-3.5 w-3.5" /> Built around the way your business actually works
            </div>
            <h1 className="text-balance text-5xl font-semibold tracking-[-0.045em] sm:text-6xl lg:text-7xl">
              Har karobar ka apna Munshi.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
              Sales, purchases, inventory, khata, payments and reporting — configured for your industry instead of forcing every business into the same software.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/get-your-munshi" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800">
                Get your Munshi <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#product" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300">
                <PlayCircle className="h-4 w-4" /> See product tour
              </a>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
              <span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600" /> From Rs 2,990/month</span>
              <span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600" /> Add modules as you grow</span>
              <span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600" /> Private company workspace</span>
            </div>
          </div>

          <div className="relative lg:pt-3">
            <div className="rounded-[28px] border border-slate-200 bg-white p-3 shadow-[0_28px_80px_-35px_rgba(15,23,42,.28)]">
              <div className="rounded-[22px] bg-slate-950 p-5 text-white sm:p-6">
                <div className="flex items-center gap-3 border-b border-white/10 pb-5">
                  <Image src="/brand/munshios-mark.svg" alt="MunshiOS mark" width={42} height={42} />
                  <div>
                    <p className="text-xs text-slate-400">Inside MunshiOS</p>
                    <p className="mt-0.5 text-lg font-semibold">Wholesale workspace</p>
                  </div>
                  <span className="ml-auto rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-medium text-emerald-300">Configured</span>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {[
                    [ReceiptText, "Sales & invoices", "Credit sales, discounts, GST and receipts"],
                    [PackageCheck, "Purchasing & GRN", "PO, receiving, supplier flows and returns"],
                    [Warehouse, "Inventory", "Live stock movements tied to business records"],
                    [BadgeCheck, "Accounting", "Khata, WHT, receivables, payables and GL"],
                  ].map(([Icon, title, text]) => {
                    const FeatureIcon = Icon as typeof ReceiptText;
                    return (
                      <div key={title as string} className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                        <FeatureIcon className="h-4 w-4 text-emerald-400" />
                        <p className="mt-3 text-sm font-semibold">{title as string}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-400">{text as string}</p>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-4 text-xs leading-5 text-slate-500">Product workflow preview — no made-up revenue or customer-count claims.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-px bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [ShieldCheck, "Workspace isolation", "Each company gets its own users, data and permissions."],
            [PackageCheck, "Real operational flows", "PO → GRN → stock → supplier and accounting impact."],
            [ReceiptText, "Pakistan-ready finance", "GST, withholding tax, khata and credit workflows."],
            [Headphones, "Human support", "A business system backed by people, not just documentation."],
          ].map(([Icon, title, text]) => {
            const TrustIcon = Icon as typeof ShieldCheck;
            return (
              <div key={title as string} className="bg-white px-6 py-7">
                <TrustIcon className="h-5 w-5 text-emerald-700" />
                <p className="mt-3 text-sm font-semibold">{title as string}</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">{text as string}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section id="product" className="py-24">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[.85fr_1.15fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold text-emerald-700">One system, connected records</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">When one record changes, the rest of the business should make sense too.</h2>
              <p className="mt-5 leading-7 text-slate-600">MunshiOS is being built around connected sales, purchasing, inventory and accounting workflows — not isolated screens that leave you fixing balances manually.</p>
              <div className="mt-7 space-y-3 text-sm text-slate-700">
                {["Purchases and GRNs affect stock and supplier balances", "Sales, receipts, WHT and customer balances stay connected", "Returns and reversals are treated as accounting events", "Roles and permissions control who can do what"].map((item) => (
                  <div key={item} className="flex gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><span>{item}</span></div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <div className="flex items-center justify-between border-b border-slate-100 pb-5">
                <div><p className="text-xs font-medium text-slate-500">Example workflow</p><p className="mt-1 font-semibold">Purchase to accounting</p></div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Connected</span>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-4">
                {["Purchase Order", "Goods Receipt", "Inventory", "Supplier / GL"].map((item, index) => (
                  <div key={item} className="relative rounded-2xl border border-slate-200 bg-[#fafaf8] p-4">
                    <span className="text-xs font-bold text-emerald-700">0{index + 1}</span>
                    <p className="mt-5 text-sm font-semibold">{item}</p>
                    {index < 3 && <ChevronRight className="absolute -right-5 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 text-slate-300 sm:block" />}
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-2xl bg-slate-950 p-5 text-sm leading-6 text-slate-300">For launch, we will replace this guided workflow preview with approved real-product screenshots / video captures — without exposing any customer's private business data.</div>
            </div>
          </div>
        </div>
      </section>

      <section id="industries" className="border-y border-slate-200 bg-white py-20">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-emerald-700">One platform. Different Munshis.</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">A restaurant should not run like a wholesaler.</h2>
            <p className="mt-4 text-slate-600">Choose your industry, see the recommended setup, then switch modules on or off before your account is created.</p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {businesses.map(({ icon: Icon, title, description, modules }) => (
              <details key={title} className="group rounded-2xl border border-slate-200 bg-[#fafaf8] p-6 open:bg-white open:shadow-sm">
                <summary className="cursor-pointer list-none">
                  <div className="flex items-start gap-4">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white shadow-sm"><Icon className="h-5 w-5 text-emerald-700" /></div>
                    <div className="min-w-0 flex-1"><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{description}</p><p className="mt-3 text-xs font-semibold text-emerald-700">See what&apos;s included</p></div>
                    <ChevronRight className="mt-2 h-5 w-5 text-slate-400 transition group-open:rotate-90" />
                  </div>
                </summary>
                <div className="mt-5 grid gap-2 border-t border-slate-200 pt-5 sm:grid-cols-2">
                  {modules.map((module) => <div key={module} className="flex items-center gap-2 text-sm text-slate-600"><Check className="h-4 w-4 text-emerald-600" />{module}</div>)}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="bg-slate-950 py-24 text-white">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-emerald-400">Simple base. Meaningful modules.</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Know how the price grows before you commit.</h2>
              <p className="mt-5 leading-7 text-slate-400">Start with Munshi Core, then add the operational depth your business actually needs. Final price is shown in the configurator.</p>
            </div>
            <Link href="/get-your-munshi" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400">Get your exact setup <ArrowRight className="h-4 w-4" /></Link>
          </div>

          <div className="mt-10 overflow-hidden rounded-3xl border border-white/10">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-white/[0.05] text-slate-300"><tr><th className="px-6 py-4 font-medium">Setup</th><th className="px-6 py-4 font-medium">Monthly starting price</th><th className="px-6 py-4 font-medium">Typical coverage</th></tr></thead>
                <tbody className="divide-y divide-white/10">
                  {priceExamples.map(([name, price, coverage]) => <tr key={name}><td className="px-6 py-5 font-semibold text-white">{name}</td><td className="px-6 py-5 text-emerald-300">{price}</td><td className="px-6 py-5 text-slate-400">{coverage}</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">These are configuration examples, not fixed packages. The configurator shows the live total based on selected modules.</p>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[28px] border border-emerald-200 bg-emerald-50 p-8 sm:p-10">
              <LockKeyhole className="h-6 w-6 text-emerald-800" />
              <h2 className="mt-5 text-2xl font-semibold tracking-tight">Your company gets its own workspace.</h2>
              <p className="mt-3 leading-7 text-slate-600">Your team, modules, permissions and business records stay inside your company workspace. Other businesses get their own separate setup.</p>
            </div>
            <div id="demo" className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
              <MessageCircle className="h-6 w-6 text-emerald-700" />
              <h2 className="mt-5 text-2xl font-semibold tracking-tight">Want to talk before configuring?</h2>
              <p className="mt-3 leading-7 text-slate-600">Start with a free setup conversation. Tell us what your business does and we&apos;ll point you toward the right Munshi configuration.</p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <a href={whatsappHref} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white"><MessageCircle className="h-4 w-4" /> WhatsApp us</a>
                <Link href="/get-your-munshi?intent=demo" className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-800">Build my setup</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="border-t border-slate-200 bg-white py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 lg:grid-cols-[.65fr_1.35fr] lg:px-8">
          <div><p className="text-sm font-semibold text-emerald-700">FAQ</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">Before you trust us with your business.</h2><p className="mt-4 leading-7 text-slate-600">The important questions should be answered before checkout, not hidden after it.</p></div>
          <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 px-5 sm:px-6">
            {faqs.map(([question, answer]) => <details key={question} className="group py-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold"><span>{question}</span><ChevronRight className="h-5 w-5 shrink-0 text-slate-400 transition group-open:rotate-90" /></summary><p className="max-w-3xl pt-3 text-sm leading-6 text-slate-600">{answer}</p></details>)}
          </div>
        </div>
      </section>

      <section className="bg-[#fafaf8] py-20">
        <div className="mx-auto max-w-4xl px-5 text-center">
          <Image src="/brand/munshios-mark.svg" alt="MunshiOS" width={58} height={58} className="mx-auto" />
          <h2 className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">Tell MunshiOS how your business works.</h2>
          <p className="mx-auto mt-4 max-w-2xl leading-7 text-slate-600">Choose your business type, review recommended modules and see your price before creating an account.</p>
          <Link href="/get-your-munshi" className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-6 py-3.5 text-sm font-semibold text-white">Get your Munshi <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <div className="flex items-center gap-2.5"><Image src="/brand/munshios-mark.svg" alt="MunshiOS" width={28} height={28} /><span>MunshiOS — Har karobar ka apna Munshi.</span></div>
          <div className="flex flex-wrap gap-x-5 gap-y-2"><a href="#industries">Industries</a><a href="#pricing">Pricing</a><a href="#faq">FAQ</a><Link href="/sign-in">Login</Link></div>
        </div>
      </footer>

      <a href={whatsappHref} aria-label="Talk to MunshiOS on WhatsApp" className="fixed bottom-5 right-5 z-50 grid h-14 w-14 place-items-center rounded-full bg-emerald-600 text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-emerald-700">
        <MessageCircle className="h-6 w-6" />
      </a>
    </main>
  );
}
