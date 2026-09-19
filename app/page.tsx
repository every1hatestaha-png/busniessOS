import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Building2,
  Check,
  ChevronRight,
  CircleDollarSign,
  Factory,
  Headphones,
  LayoutDashboard,
  LockKeyhole,
  MessageCircle,
  PackageCheck,
  ReceiptText,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Store,
  TrendingUp,
  UtensilsCrossed,
  Warehouse,
  Wrench,
  Zap,
} from "lucide-react";

const industries = [
  {
    icon: Store,
    title: "Retail",
    blurb: "Fast sales, stock visibility and khata without the ERP headache.",
    modules: ["Sales / POS", "Inventory", "Purchases", "Customer khata", "Supplier khata", "Expenses", "Daily reports"],
  },
  {
    icon: UtensilsCrossed,
    title: "Restaurant",
    blurb: "Orders, tables, ingredients, kitchen flow and closing in one place.",
    modules: ["POS & orders", "Tables", "Kitchen flow", "Recipes", "Ingredient stock", "Cash closing", "Daily sales"],
  },
  {
    icon: PackageCheck,
    title: "Wholesale",
    blurb: "Credit sales, GRNs, ledgers and purchasing built for trading businesses.",
    modules: ["Purchase orders", "GRN", "Inventory", "Credit sales", "Customer ledger", "Supplier ledger", "GST / WHT", "Returns"],
  },
  {
    icon: Factory,
    title: "Manufacturing",
    blurb: "Raw material to finished goods, with accounting connected underneath.",
    modules: ["Raw materials", "BOM", "Production", "Finished goods", "Wastage", "Warehouses", "Approvals", "Accounting"],
  },
  {
    icon: Wrench,
    title: "Services",
    blurb: "Clients, jobs, expenses and collections for workshops and service teams.",
    modules: ["Clients", "Quotations", "Billing", "Receipts", "Expenses", "Team access", "Reports"],
  },
];

const modules = [
  [Warehouse, "Inventory", "Live stock, movements, warehouses and valuation."],
  [ShoppingCart, "Sales & POS", "Billing, credit sales, discounts, returns and receipts."],
  [PackageCheck, "Purchases & GRN", "POs, receiving, supplier returns and landed workflows."],
  [CircleDollarSign, "Accounting", "Khata, WHT, receivables, payables and general ledger."],
  [BarChart3, "Reports", "Operational and financial visibility without spreadsheet cleanup."],
  [Building2, "Multi-branch", "Grow into multiple locations without splitting your records."],
  [Boxes, "Manufacturing", "BOM, production, raw materials, finished goods and wastage."],
  [Sparkles, "Custom workflows", "For the parts of your business that generic software misses."],
];

const pricing = [
  {
    name: "Munshi Core",
    price: "2,990",
    description: "For small businesses that want the essentials done properly.",
    features: ["Sales & purchases", "Customers & suppliers", "Khata & expenses", "Documents", "Basic reports"],
  },
  {
    name: "Custom Munshi",
    price: "Build yours",
    description: "Choose your industry and only add the operational modules you need.",
    features: ["Everything in Core", "Industry modules", "Live configurable pricing", "Add features as you grow", "Recommended setup"],
    featured: true,
  },
  {
    name: "Business+",
    price: "Custom",
    description: "For factories, complex trading setups and unique approval workflows.",
    features: ["Advanced workflows", "Custom reports", "Migration planning", "Priority onboarding", "Tailored implementation"],
  },
];

const faqs = [
  ["Is my company data private?", "Yes. Each company operates in its own workspace with separate users, permissions and business records."],
  ["Can you move data from Excel or my old system?", "Yes. We can plan imports for products, customers, suppliers, opening balances and other supported records depending on your source data."],
  ["Can I add or remove modules later?", "Yes. MunshiOS is designed around modular workspaces, so your setup can evolve as the business grows."],
  ["What if my workflow is different?", "Start with the closest industry setup, then customize it. Complex or unique workflows can be handled as a custom implementation."],
  ["Can I cancel?", "Paid billing terms and cancellation rules will be shown clearly before live checkout is enabled."],
  ["How do I get support?", "MunshiOS is being built with direct human support for Pakistani businesses, including WhatsApp once the support number is connected."],
];

function DashboardPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[720px] lg:translate-x-8">
      <div className="absolute -inset-10 -z-10 rounded-[44px] bg-[radial-gradient(circle_at_50%_40%,rgba(16,185,129,.22),transparent_65%)] blur-2xl" />
      <div className="rotate-[1.5deg] overflow-hidden rounded-[30px] border border-white/70 bg-white shadow-[0_35px_100px_-34px_rgba(15,23,42,.45)] transition duration-500 hover:rotate-0">
        <div className="flex min-h-[430px]">
          <aside className="hidden w-44 shrink-0 bg-[#071821] p-4 text-white sm:block">
            <div className="flex items-center gap-2 border-b border-white/10 pb-4">
              <Image src="/brand/munshios-mark.svg" alt="MunshiOS" width={34} height={34} />
              <span className="text-sm font-semibold">MunshiOS</span>
            </div>
            <div className="mt-5 space-y-1.5 text-xs text-slate-400">
              {[
                [LayoutDashboard, "Dashboard", true],
                [ReceiptText, "Sales"],
                [ShoppingCart, "Purchases"],
                [Warehouse, "Inventory"],
                [CircleDollarSign, "Accounting"],
                [PackageCheck, "GRN"],
                [BarChart3, "Reports"],
              ].map(([Icon, label, active]) => {
                const MenuIcon = Icon as typeof LayoutDashboard;
                return (
                  <div key={label as string} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 ${active ? "bg-emerald-500/15 text-emerald-300" : ""}`}>
                    <MenuIcon className="h-3.5 w-3.5" />
                    <span>{label as string}</span>
                  </div>
                );
              })}
            </div>
          </aside>

          <div className="min-w-0 flex-1 bg-[#f7faf9] p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-700">Business overview</p>
                <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">Good morning.</h3>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-[10px] font-bold text-white">AK</div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-3">
              {[
                ["Total sales", "Rs. 2.85M", "+12.4%"],
                ["Purchases", "Rs. 1.72M", "-2.8%"],
                ["Receivables", "Rs. 486K", "+6.1%"],
              ].map(([label, value, delta], i) => (
                <div key={label} className={`rounded-2xl border p-3.5 ${i === 0 ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
                  <p className="text-[10px] text-slate-500">{label}</p>
                  <p className="mt-2 text-base font-semibold tracking-tight text-slate-950">{value}</p>
                  <p className={`mt-1 text-[10px] ${i === 1 ? "text-amber-600" : "text-emerald-600"}`}>{delta} this month</p>
                </div>
              ))}
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-[1.35fr_.65fr]">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-900">Sales overview</p>
                    <p className="mt-1 text-[10px] text-slate-400">Last 8 months</p>
                  </div>
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="mt-5 flex h-28 items-end gap-2">
                  {[38, 53, 47, 61, 68, 57, 82, 96].map((height, i) => (
                    <div key={height + i} className="flex flex-1 flex-col justify-end">
                      <div className={`rounded-t-md ${i === 7 ? "bg-emerald-500" : "bg-emerald-100"}`} style={{ height: `${height}%` }} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold text-slate-900">Inventory</p>
                <div className="mx-auto mt-5 grid h-24 w-24 place-items-center rounded-full border-[12px] border-emerald-100 border-r-emerald-500 border-t-emerald-500">
                  <div className="text-center">
                    <p className="text-lg font-semibold">1,249</p>
                    <p className="text-[9px] text-slate-400">items</p>
                  </div>
                </div>
                <div className="mt-5 space-y-1.5 text-[9px] text-slate-500">
                  <div className="flex justify-between"><span>In stock</span><span className="font-medium text-slate-800">68%</span></div>
                  <div className="flex justify-between"><span>Low stock</span><span className="font-medium text-slate-800">22%</span></div>
                  <div className="flex justify-between"><span>Out of stock</span><span className="font-medium text-slate-800">10%</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-8 -left-3 hidden rounded-2xl border border-white/70 bg-white/95 p-4 shadow-xl backdrop-blur-xl md:block">
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">Connected records</p>
        <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-900"><Check className="h-4 w-4 text-emerald-600" /> PO → GRN → Stock → GL</div>
      </div>
    </div>
  );
}

export default function Home() {
  const whatsappNumber = process.env.NEXT_PUBLIC_MUNSHIOS_WHATSAPP?.replace(/\D/g, "");
  const whatsappHref = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent("Salam, I want to know more about MunshiOS.")}`
    : "/get-your-munshi?intent=contact";

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#fbfcfa] text-[#0b1720] selection:bg-emerald-200">
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/85 backdrop-blur-2xl">
        <div className="mx-auto flex h-[72px] max-w-[1400px] items-center justify-between px-4 sm:px-6 lg:px-10">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/brand/munshios-mark.svg" alt="MunshiOS" width={40} height={40} priority />
            <span className="text-[19px] font-bold tracking-[-0.03em]">MunshiOS</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 lg:flex">
            <a href="#features" className="transition hover:text-emerald-700">Features</a>
            <a href="#industries" className="transition hover:text-emerald-700">Industries</a>
            <a href="#pricing" className="transition hover:text-emerald-700">Pricing</a>
            <a href="#faq" className="transition hover:text-emerald-700">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/sign-in" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">Login</Link>
            <Link href="/get-your-munshi" className="group hidden items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_-10px_rgba(5,150,105,.75)] transition hover:-translate-y-0.5 hover:bg-emerald-700 sm:inline-flex">
              Get your Munshi <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-slate-200/70 bg-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_25%,rgba(16,185,129,.14),transparent_32%),radial-gradient(circle_at_20%_10%,rgba(52,211,153,.08),transparent_26%)]" />
        <div className="relative mx-auto grid max-w-[1400px] gap-12 px-5 pb-24 pt-14 sm:px-6 lg:grid-cols-[.88fr_1.12fr] lg:items-center lg:px-10 lg:pb-28 lg:pt-20">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-800">
              <Zap className="h-3.5 w-3.5" /> Pakistan&apos;s business operating system
            </div>
            <h1 className="mt-7 text-[52px] font-semibold leading-[.97] tracking-[-0.055em] sm:text-6xl lg:text-[72px]">
              Your business deserves its own <span className="text-emerald-600">Munshi.</span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-slate-600">
              A modern operating system for Pakistani businesses — sales, purchasing, inventory, khata, accounting and reporting configured around how you actually work.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/get-your-munshi" className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3.5 text-sm font-bold text-white shadow-[0_18px_35px_-18px_rgba(5,150,105,.8)] transition hover:-translate-y-0.5 hover:bg-emerald-700">
                Get your own Munshi <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </Link>
              <a href="#features" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-bold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300">
                <LayoutDashboard className="h-4 w-4 text-emerald-600" /> Explore product
              </a>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
              <span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600" /> From Rs 2,990/month</span>
              <span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600" /> Modular setup</span>
              <span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600" /> Built for Pakistan</span>
            </div>
          </div>
          <DashboardPreview />
        </div>
      </section>

      <section className="relative z-10 mx-auto -mt-7 max-w-[1320px] px-5 sm:px-6 lg:px-10">
        <div className="grid overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_50px_-30px_rgba(15,23,42,.3)] sm:grid-cols-2 lg:grid-cols-4">
          {[
            [ShieldCheck, "Private workspaces", "Separate company data & permissions"],
            [Headphones, "Local-first support", "A system backed by real people"],
            [Zap, "Fast setup", "Configure the modules you need"],
            [ReceiptText, "Pakistan-ready", "Khata, GST, WHT and credit flows"],
          ].map(([Icon, title, text], index) => {
            const TrustIcon = Icon as typeof ShieldCheck;
            return (
              <div key={title as string} className={`p-6 ${index ? "border-t border-slate-100 sm:border-l sm:border-t-0" : ""}`}>
                <TrustIcon className="h-5 w-5 text-emerald-700" />
                <p className="mt-3 text-sm font-bold">{title as string}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{text as string}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section id="industries" className="py-24 sm:py-28">
        <div className="mx-auto max-w-[1400px] px-5 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Built for every business</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">No matter your industry, your Munshi should fit it.</h2>
            <p className="mt-5 text-slate-600">Start with a recommended setup, then open each industry to see the actual workflows included.</p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {industries.map(({ icon: Icon, title, blurb, modules }) => (
              <details key={title} className="group rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_12px_35px_-28px_rgba(15,23,42,.35)] transition duration-300 open:sm:col-span-2 hover:-translate-y-1 hover:shadow-[0_20px_45px_-28px_rgba(15,23,42,.35)]">
                <summary className="cursor-pointer list-none">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><Icon className="h-5 w-5" /></div>
                  <h3 className="mt-6 text-lg font-bold tracking-tight">{title}</h3>
                  <p className="mt-2 min-h-16 text-sm leading-6 text-slate-500">{blurb}</p>
                  <div className="mt-5 flex items-center gap-1.5 text-xs font-bold text-emerald-700">See what&apos;s included <ChevronRight className="h-4 w-4 transition group-open:rotate-90" /></div>
                </summary>
                <div className="mt-5 grid gap-2 border-t border-slate-100 pt-5 sm:grid-cols-2">
                  {modules.map((item) => <div key={item} className="flex items-center gap-2 text-xs text-slate-600"><Check className="h-3.5 w-3.5 text-emerald-600" />{item}</div>)}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="border-y border-slate-200 bg-white py-24">
        <div className="mx-auto max-w-[1400px] px-5 sm:px-6 lg:px-10">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Powerful modules</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">Everything you need. Nothing you don&apos;t.</h2>
              <p className="mt-5 text-slate-600">The product grows with the business instead of forcing you into one giant generic package.</p>
            </div>
            <div className="inline-flex items-center gap-3 self-start rounded-full border border-slate-200 bg-[#fbfcfa] px-4 py-2 text-xs font-semibold text-slate-500 lg:self-auto"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_5px_rgba(16,185,129,.12)]" /> Modular · Flexible · Scalable</div>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {modules.map(([Icon, title, text]) => {
              const ModuleIcon = Icon as typeof Warehouse;
              return (
                <div key={title as string} className="group rounded-[24px] border border-slate-200 bg-[#fcfdfc] p-6 transition duration-300 hover:-translate-y-1 hover:border-emerald-200 hover:bg-emerald-50/40 hover:shadow-[0_18px_40px_-30px_rgba(5,150,105,.55)]">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-100 bg-white text-emerald-700 shadow-sm transition group-hover:scale-105"><ModuleIcon className="h-5 w-5" /></div>
                  <h3 className="mt-5 font-bold tracking-tight">{title as string}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{text as string}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#071821] py-24 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(16,185,129,.14),transparent_28%),radial-gradient(circle_at_88%_70%,rgba(16,185,129,.1),transparent_30%)]" />
        <div className="relative mx-auto grid max-w-[1400px] gap-12 px-5 sm:px-6 lg:grid-cols-[.8fr_1.2fr] lg:items-center lg:px-10">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">Connected by design</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">When one record changes, the business should still make sense.</h2>
            <p className="mt-6 max-w-xl leading-7 text-slate-400">MunshiOS connects operational records instead of making you manually reconcile disconnected screens.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            {["Purchase Order", "Goods Receipt", "Inventory", "Supplier / GL"].map((label, index) => (
              <div key={label} className="relative rounded-[22px] border border-white/10 bg-white/[0.055] p-5 backdrop-blur">
                <span className="text-xs font-bold text-emerald-400">0{index + 1}</span>
                <p className="mt-10 text-sm font-bold">{label}</p>
                {index < 3 && <ChevronRight className="absolute -right-5 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 text-emerald-500 sm:block" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="py-24 sm:py-28">
        <div className="mx-auto max-w-[1320px] px-5 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Simple, flexible pricing</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">Choose the Munshi your business actually needs.</h2>
            <p className="mt-5 text-slate-600">Start small, configure the right modules and grow without rebuilding your whole system.</p>
          </div>

          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {pricing.map((plan) => (
              <div key={plan.name} className={`relative rounded-[28px] border p-7 ${plan.featured ? "border-emerald-400 bg-white shadow-[0_26px_70px_-38px_rgba(5,150,105,.7)]" : "border-slate-200 bg-white"}`}>
                {plan.featured && <div className="absolute inset-x-6 -top-3 rounded-full bg-emerald-600 py-1.5 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-white">Recommended</div>}
                <p className="text-sm font-bold text-slate-950">{plan.name}</p>
                <p className={`mt-5 font-semibold tracking-[-0.05em] ${plan.price === "Build yours" ? "text-4xl" : "text-5xl"}`}>
                  {plan.price === "Build yours" || plan.price === "Custom" ? plan.price : <><span className="text-xl tracking-normal">Rs. </span>{plan.price}<span className="text-sm font-medium tracking-normal text-slate-400"> / month</span></>}
                </p>
                <p className="mt-4 min-h-14 text-sm leading-6 text-slate-500">{plan.description}</p>
                <div className="mt-7 space-y-3 border-t border-slate-100 pt-6">
                  {plan.features.map((feature) => <div key={feature} className="flex items-center gap-2.5 text-sm text-slate-700"><Check className="h-4 w-4 text-emerald-600" />{feature}</div>)}
                </div>
                <Link href="/get-your-munshi" className={`mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition ${plan.featured ? "bg-emerald-600 text-white hover:bg-emerald-700" : "border border-slate-200 text-slate-800 hover:bg-slate-50"}`}>
                  {plan.featured ? "Build my Munshi" : "Get started"} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1320px] px-5 pb-24 sm:px-6 lg:px-10">
        <div className="relative overflow-hidden rounded-[34px] bg-[linear-gradient(125deg,#06232a_0%,#075f50_58%,#0aa77c_100%)] p-8 text-white shadow-[0_26px_70px_-40px_rgba(5,150,105,.75)] sm:p-10 lg:p-12">
          <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full border border-white/10" />
          <div className="absolute -right-6 -top-6 h-44 w-44 rounded-full border border-white/10" />
          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-200">Your next system should feel made for you</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Tell us how your business works. MunshiOS will shape around it.</h2>
              <p className="mt-4 leading-7 text-emerald-50/80">Choose your industry, review recommended modules and see your setup before creating an account.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/get-your-munshi" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-emerald-800 transition hover:-translate-y-0.5">Get your Munshi <ArrowRight className="h-4 w-4" /></Link>
              <a href={whatsappHref} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-bold text-white backdrop-blur transition hover:bg-white/15"><MessageCircle className="h-4 w-4" /> WhatsApp us</a>
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="border-t border-slate-200 bg-white py-24">
        <div className="mx-auto grid max-w-[1320px] gap-12 px-5 sm:px-6 lg:grid-cols-[.72fr_1.28fr] lg:px-10">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Frequently asked questions</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">The questions you should ask before trusting business software.</h2>
            <div className="mt-7 rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
              <LockKeyhole className="h-5 w-5 text-emerald-700" />
              <p className="mt-3 text-sm font-bold text-slate-900">Company-scoped access</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">Separate workspaces, users and permissions are part of the product architecture.</p>
            </div>
          </div>
          <div className="divide-y divide-slate-200 rounded-[26px] border border-slate-200 px-5 sm:px-7">
            {faqs.map(([question, answer]) => (
              <details key={question} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold sm:text-base">
                  <span>{question}</span><ChevronRight className="h-5 w-5 shrink-0 text-slate-400 transition group-open:rotate-90" />
                </summary>
                <p className="max-w-3xl pt-3 text-sm leading-6 text-slate-600">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-[#06151d] text-white">
        <div className="mx-auto max-w-[1400px] px-5 py-12 sm:px-6 lg:px-10">
          <div className="grid gap-10 border-b border-white/10 pb-10 md:grid-cols-[1.35fr_.65fr_.65fr_.65fr]">
            <div className="max-w-sm">
              <div className="flex items-center gap-2.5"><Image src="/brand/munshios-mark.svg" alt="MunshiOS" width={40} height={40} /><span className="text-lg font-bold">MunshiOS</span></div>
              <p className="mt-4 text-sm leading-6 text-slate-400">Har karobar ka digital system — built around real Pakistani business workflows.</p>
            </div>
            <div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Product</p><div className="mt-4 space-y-3 text-sm text-slate-300"><a href="#features" className="block hover:text-white">Features</a><a href="#industries" className="block hover:text-white">Industries</a><a href="#pricing" className="block hover:text-white">Pricing</a></div></div>
            <div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Account</p><div className="mt-4 space-y-3 text-sm text-slate-300"><Link href="/sign-in" className="block hover:text-white">Login</Link><Link href="/get-your-munshi" className="block hover:text-white">Get your Munshi</Link></div></div>
            <div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Support</p><div className="mt-4 space-y-3 text-sm text-slate-300"><a href={whatsappHref} className="block hover:text-white">WhatsApp</a><a href="#faq" className="block hover:text-white">FAQ</a><Link href="/privacy" className="block hover:text-white">Privacy</Link><Link href="/terms" className="block hover:text-white">Terms</Link></div></div>
          </div>
          <div className="flex flex-col gap-3 pt-7 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between"><span>© 2026 MunshiOS. All rights reserved.</span><div className="flex flex-wrap gap-4"><Link href="/privacy" className="hover:text-slate-300">Privacy</Link><Link href="/terms" className="hover:text-slate-300">Terms</Link><span>Built for Pakistani businesses.</span></div></div>
        </div>
      </footer>

      <a href={whatsappHref} aria-label="Talk to MunshiOS" className="fixed bottom-5 right-5 z-50 grid h-14 w-14 place-items-center rounded-full border border-white/30 bg-emerald-600 text-white shadow-[0_12px_30px_-10px_rgba(5,150,105,.8)] transition hover:-translate-y-1 hover:bg-emerald-700">
        <MessageCircle className="h-6 w-6" />
      </a>
    </main>
  );
}
