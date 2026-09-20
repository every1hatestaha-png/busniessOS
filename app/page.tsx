import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Check,
  ChevronRight,
  CircleDollarSign,
  Factory,
  LayoutDashboard,
  LockKeyhole,
  MessageCircle,
  PackageCheck,
  ReceiptText,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Store,
  UtensilsCrossed,
  Warehouse,
  Wrench,
  Zap,
} from "lucide-react";

const focusIndustries = [
  {
    icon: Factory,
    title: "Manufacturing",
    badge: "Our focus",
    blurb: "Raw materials, BOMs, production runs, finished goods, wastage, warehouses and accounting in one system.",
    modules: ["Raw materials", "BOMs", "Production runs", "Wastage", "Warehouses", "Approvals", "Accounting"],
  },
  {
    icon: PackageCheck,
    title: "Wholesale",
    badge: "Our focus",
    blurb: "Purchasing, GRN, credit sales, customer and supplier ledgers, returns and tax workflows.",
    modules: ["Purchase orders", "GRN", "Inventory", "Credit sales", "Customer khata", "Supplier khata", "GST / WHT"],
  },
];

const otherIndustries = [
  {
    icon: Store,
    title: "Retail",
    blurb: "Sales, stock, purchases, customer accounts, supplier accounts, expenses and daily reporting.",
  },
  {
    icon: UtensilsCrossed,
    title: "Restaurant",
    blurb: "Tables, recipes, kitchen tickets, ingredient stock and cash closing connected to the same workspace.",
  },
  {
    icon: Wrench,
    title: "Services",
    blurb: "Clients, quotations, jobs, billing, expenses, collections and reporting for service teams.",
  },
];

const modules = [
  { icon: Warehouse, title: "Inventory & warehouses", text: "Stock movements, adjustments, warehouse transfers and stock reporting." },
  { icon: ShoppingCart, title: "Sales & customer accounts", text: "Credit sales, discounts, receipts, returns, cancellations and customer khata." },
  { icon: PackageCheck, title: "Purchases & GRN", text: "Purchase orders, receiving, supplier balances, returns and payable settlement." },
  { icon: CircleDollarSign, title: "Accounting", text: "Cash and bank accounts, expenses, receivables, payables, GST, WHT and general ledger." },
  { icon: Boxes, title: "Manufacturing", text: "Versioned BOMs, production runs, material consumption, output and wastage." },
  { icon: UtensilsCrossed, title: "Restaurant operations", text: "Tables, recipes, kitchen ticket flow and ingredient consumption." },
  { icon: BarChart3, title: "Reports", text: "Financial and operational reports for stock, ledgers, payables and receivables." },
  { icon: Sparkles, title: "Modular setup", text: "Choose the modules that match the way your business works." },
];

const faqs = [
  ["Is there a free trial?", "Yes. Your first month is free, so you can use MunshiOS with your business before deciding whether to continue on a paid plan."],
  ["Can I use it alongside Excel?", "Yes. During your first month you can keep your current process running while you test MunshiOS with real workflows."],
  ["Can you help move my existing data?", "We can help set up products, customers, suppliers and opening balances. The exact migration approach depends on the format and condition of your current data."],
  ["Is my company data separated from other companies?", "Yes. MunshiOS uses company-scoped workspaces with separate business records and user permissions."],
  ["Does MunshiOS work on phones?", "The public website works on phones. The business application is designed for laptop and desktop use, where larger business screens are easier to manage."],
  ["Does MunshiOS support FBR e-invoicing?", "MunshiOS has tax and FBR-related product fields, but this website does not claim live FBR e-invoicing until that integration is fully verified for production use."],
];

function DashboardPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[720px] lg:translate-x-6">
      <div className="absolute -inset-8 -z-10 rounded-[44px] bg-[radial-gradient(circle_at_50%_40%,rgba(16,185,129,.2),transparent_65%)] blur-2xl" />
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_35px_100px_-34px_rgba(15,23,42,.38)]">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
            <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
            <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
          </div>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700">Sample data</span>
        </div>

        <div className="flex min-h-[390px]">
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
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-700">Business overview</p>
            <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">Your business at a glance</h3>

            <div className="mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-3">
              {[
                ["Sales", "Rs. 2.85M"],
                ["Purchases", "Rs. 1.72M"],
                ["Receivables", "Rs. 486K"],
              ].map(([label, value], index) => (
                <div key={label} className={`rounded-2xl border p-3.5 ${index === 0 ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
                  <p className="text-[10px] text-slate-500">{label}</p>
                  <p className="mt-2 text-base font-semibold tracking-tight text-slate-950">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-[1.35fr_.65fr]">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold text-slate-900">Connected business flow</p>
                <div className="mt-5 space-y-3">
                  {["Purchase order", "Goods receipt", "Inventory", "Supplier ledger"].map((label, index) => (
                    <div key={label} className="flex items-center gap-3">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-50 text-[10px] font-bold text-emerald-700">{index + 1}</span>
                      <div className="h-px flex-1 bg-slate-100" />
                      <span className="w-28 text-right text-[10px] font-medium text-slate-600">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold text-slate-900">Inventory</p>
                <div className="mt-5 space-y-3 text-[10px]">
                  <div className="rounded-xl bg-emerald-50 p-3"><p className="text-slate-500">In stock</p><p className="mt-1 text-lg font-semibold text-slate-950">1,249</p></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-amber-50 p-2.5"><p className="text-slate-500">Low</p><p className="mt-1 font-semibold">18</p></div>
                    <div className="rounded-xl bg-slate-50 p-2.5"><p className="text-slate-500">Warehouses</p><p className="mt-1 font-semibold">3</p></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const whatsappNumber = process.env.NEXT_PUBLIC_MUNSHIOS_WHATSAPP?.replace(/\D/g, "");
  const whatsappHref = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent("Salam, I want to know more about MunshiOS and the free first month.")}`
    : "/get-your-munshi?intent=contact";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://business-os-one-gules.vercel.app";
  const laptopShareHref = `https://wa.me/?text=${encodeURIComponent(`Open MunshiOS on your laptop: ${siteUrl}`)}`;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#fbfcfa] pb-20 text-[#0b1720] selection:bg-emerald-200 lg:pb-0">
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-2xl">
        <div className="mx-auto flex h-[68px] max-w-[1400px] items-center justify-between px-4 sm:px-6 lg:px-10">
          <Link href="/" className="flex items-center gap-2.5" aria-label="MunshiOS home">
            <Image src="/brand/munshios-mark.svg" alt="" width={38} height={38} priority />
            <span className="text-[18px] font-bold tracking-[-0.03em]">MunshiOS</span>
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 lg:flex" aria-label="Main navigation">
            <a href="#why-switch" className="transition hover:text-emerald-700">Why switch</a>
            <a href="#industries" className="transition hover:text-emerald-700">Industries</a>
            <a href="#features" className="transition hover:text-emerald-700">Features</a>
            <a href="#pricing" className="transition hover:text-emerald-700">Pricing</a>
            <a href="#faq" className="transition hover:text-emerald-700">FAQ</a>
          </nav>

          <div className="flex items-center gap-2">
            <Link href="/sign-in" className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Login</Link>
            <Link href="/get-your-munshi" className="hidden items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 sm:inline-flex">
              Start your free month <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-slate-200/70 bg-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_25%,rgba(16,185,129,.13),transparent_32%),radial-gradient(circle_at_20%_10%,rgba(52,211,153,.07),transparent_26%)]" />
        <div className="relative mx-auto grid max-w-[1400px] gap-12 px-5 pb-20 pt-12 sm:px-6 lg:grid-cols-[.88fr_1.12fr] lg:items-center lg:px-10 lg:pb-28 lg:pt-20">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-800">
              <Zap className="h-3.5 w-3.5" /> Built for Pakistani businesses
            </div>

            <h1 className="mt-6 text-[46px] font-semibold leading-[.98] tracking-[-0.055em] sm:text-6xl lg:text-[72px]">
              Your business deserves its own <span className="text-emerald-600">Munshi.</span>
            </h1>

            <p className="mt-6 max-w-xl text-[17px] leading-8 text-slate-600 sm:text-lg">
              Sales, purchases, stock, khata and accounting in one connected system, built for Pakistani manufacturers, wholesalers and growing businesses. Your first month is free.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/get-your-munshi" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3.5 text-sm font-bold text-white shadow-[0_18px_35px_-18px_rgba(5,150,105,.8)] transition hover:-translate-y-0.5 hover:bg-emerald-700">
                Start your free month <ArrowRight className="h-4 w-4" />
              </Link>
              <a href={whatsappHref} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-bold text-slate-800 transition hover:border-slate-300">
                <MessageCircle className="h-4 w-4 text-emerald-600" /> WhatsApp us
              </a>
            </div>

            <div className="mt-7 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
              <span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600" /> First month free</span>
              <span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600" /> From Rs 2,990/month after trial</span>
              <span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600" /> Laptop and desktop business app</span>
              <span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600" /> Company-scoped workspaces</span>
            </div>
          </div>

          <div className="hidden sm:block">
            <DashboardPreview />
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto -mt-5 max-w-[1320px] px-5 sm:px-6 lg:px-10">
        <div className="grid overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_50px_-30px_rgba(15,23,42,.3)] sm:grid-cols-2 lg:grid-cols-4">
          {[
            [ShieldCheck, "Separate workspaces", "Company data and user access stay scoped to each workspace."],
            [Warehouse, "Warehouse control", "Track stock, movements and transfers across managed warehouses."],
            [Factory, "Real manufacturing flow", "BOMs, production, wastage and approvals are built into the product."],
            [ReceiptText, "Pakistan workflows", "Khata, GST, WHT, credit sales and supplier payments are supported."],
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

      <section className="py-20 sm:py-24">
        <div className="mx-auto max-w-[1320px] px-5 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Who MunshiOS is for</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">Built for businesses with real operational work.</h2>
            <p className="mt-5 text-slate-600">MunshiOS is strongest when sales, purchasing, stock, customer balances and accounting need to stay connected.</p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-4">
            {[
              ["Manufacturers", "Raw material, BOM, production, warehouses and finished goods."],
              ["Wholesalers", "GRN, credit sales, customer and supplier ledgers, returns and tax."],
              ["Distributors", "Purchasing, stock movement, customer balances and collections."],
              ["Growing shops", "Sales, purchases, stock, khata and expenses in one workspace."],
            ].map(([title, text]) => (
              <div key={title} className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>
              </div>
            ))}
          </div>

          <p className="mx-auto mt-6 max-w-3xl text-center text-sm text-slate-500">If you only need simple personal bookkeeping, MunshiOS may be more than you need.</p>
        </div>
      </section>

      <section id="why-switch" className="border-y border-slate-200 bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-[1320px] px-5 sm:px-6 lg:px-10">
          <div className="grid gap-10 lg:grid-cols-[.72fr_1.28fr] lg:items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Already using Excel or another system?</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">You do not have to switch everything on day one.</h2>
              <p className="mt-5 text-sm leading-7 text-slate-600">Use the free first month to set up your business, run MunshiOS beside your current process and move when your team is comfortable.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ["01", "Set up your records", "Add products, customers, suppliers and opening balances."],
                ["02", "Run side by side", "Keep Excel or your current software while your team tests MunshiOS."],
                ["03", "Move when ready", "Use real workflows before deciding whether to continue on a paid plan."],
              ].map(([number, title, text]) => (
                <div key={number} className="rounded-[24px] border border-slate-200 bg-[#fbfcfa] p-5">
                  <p className="text-xs font-bold text-emerald-700">{number}</p>
                  <h3 className="mt-5 font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10 overflow-x-auto rounded-3xl border border-slate-200">
            <table className="min-w-[760px] w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-slate-900">
                <tr>
                  <th className="p-4 font-bold">Workflow</th>
                  <th className="p-4 font-bold">Excel / paper registers</th>
                  <th className="p-4 font-bold">Traditional standalone software</th>
                  <th className="p-4 font-bold text-emerald-800">MunshiOS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-slate-600">
                {[
                  ["PO to GRN to inventory to ledger", "Usually manual", "Depends on setup", "Connected workflow"],
                  ["Warehouse transfers", "Manual tracking", "Depends on product", "Built in"],
                  ["Manufacturing BOM and production", "Manual sheets", "Depends on product", "Built in"],
                  ["Customer and supplier khata", "Separate sheets", "Often available", "Connected to transactions"],
                  ["Use from a browser", "File based", "Often device based", "Yes"],
                ].map((row) => (
                  <tr key={row[0]}>
                    {row.map((cell, index) => <td key={cell} className={`p-4 ${index === 0 ? "font-medium text-slate-900" : ""} ${index === 3 ? "bg-emerald-50/40 font-semibold text-emerald-900" : ""}`}>{cell}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="industries" className="py-20 sm:py-24">
        <div className="mx-auto max-w-[1400px] px-5 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Industry fit</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">Start with the workflows your business already uses.</h2>
          </div>

          <div className="mt-12 grid gap-5 lg:grid-cols-2">
            {focusIndustries.map(({ icon: Icon, title, badge, blurb, modules: items }) => (
              <div key={title} className="rounded-[28px] border border-emerald-200 bg-white p-6 shadow-[0_18px_50px_-38px_rgba(5,150,105,.6)]">
                <div className="flex items-center justify-between gap-4">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><Icon className="h-5 w-5" /></div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700">{badge}</span>
                </div>
                <h3 className="mt-6 text-2xl font-bold tracking-tight">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-500">{blurb}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {items.map((item) => <span key={item} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">{item}</span>)}
                </div>
                <Link href={title === "Manufacturing" ? "/industries/manufacturing" : "/industries/wholesale"} className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-emerald-700">Explore {title.toLowerCase()} <ArrowRight className="size-4" /></Link>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {otherIndustries.map(({ icon: Icon, title, blurb }) => (
              <div key={title} className="rounded-[24px] border border-slate-200 bg-white p-5">
                <Icon className="h-5 w-5 text-emerald-700" />
                <h3 className="mt-4 font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{blurb}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="border-y border-slate-200 bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-[1400px] px-5 sm:px-6 lg:px-10">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">What is live</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">The parts of your business that need to stay connected.</h2>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {modules.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-[24px] border border-slate-200 bg-[#fcfdfc] p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-100 bg-white text-emerald-700"><Icon className="h-5 w-5" /></div>
                <h3 className="mt-5 font-bold tracking-tight">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#071821] py-20 text-white sm:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(16,185,129,.14),transparent_28%),radial-gradient(circle_at_88%_70%,rgba(16,185,129,.1),transparent_30%)]" />
        <div className="relative mx-auto grid max-w-[1400px] gap-12 px-5 sm:px-6 lg:grid-cols-[.8fr_1.2fr] lg:items-center lg:px-10">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">Connected by design</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">One transaction should update the records that depend on it.</h2>
            <p className="mt-6 max-w-xl leading-7 text-slate-400">MunshiOS connects purchasing, receiving, inventory and accounting so your team does less duplicate entry and reconciliation.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            {["Purchase order", "Goods receipt", "Inventory", "Supplier / GL"].map((label, index) => (
              <div key={label} className="relative rounded-[22px] border border-white/10 bg-white/[0.055] p-5">
                <span className="text-xs font-bold text-emerald-400">0{index + 1}</span>
                <p className="mt-10 text-sm font-bold">{label}</p>
                {index < 3 && <ChevronRight className="absolute -right-5 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 text-emerald-500 sm:block" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-24">
        <div className="mx-auto max-w-[1320px] px-5 sm:px-6 lg:px-10">
          <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">What happens after you click start</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">Know the setup before you create your workspace.</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["1", "Choose your business type"],
                ["2", "Select the modules you need"],
                ["3", "Review your setup and price"],
                ["4", "Create your account and workspace"],
                ["5", "Use MunshiOS free for the first month"],
                ["6", "Continue on your chosen plan if it fits your business"],
              ].map(([number, text]) => (
                <div key={number} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700">{number}</span>
                  <p className="text-sm font-medium text-slate-700">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="border-y border-slate-200 bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-[1320px] px-5 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Pricing</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">Try the real product before paying for month two.</h2>
            <p className="mt-5 text-slate-600">Every setup starts with the first month free.</p>
          </div>

          <div className="mx-auto mt-12 grid max-w-5xl gap-5 lg:grid-cols-3">
            {[
              ["Munshi Core", "Rs. 2,990", "For businesses that need sales, purchases, customers, suppliers, khata, expenses and core reports."],
              ["Custom Munshi", "Build yours", "Choose your industry and modules. Your setup shows the price before you create the workspace."],
              ["Business+", "Custom", "For factories, complex trading setups and workflows that need a tailored implementation."],
            ].map(([name, price, description], index) => (
              <div key={name} className={`relative rounded-[28px] border p-7 ${index === 1 ? "border-emerald-400 shadow-[0_26px_70px_-38px_rgba(5,150,105,.7)]" : "border-slate-200"}`}>
                {index === 1 && <span className="absolute inset-x-6 -top-3 rounded-full bg-emerald-600 py-1.5 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-white">Most flexible</span>}
                <p className="text-sm font-bold">{name}</p>
                <p className="mt-5 text-4xl font-semibold tracking-[-0.05em]">{price}</p>
                {index === 0 && <p className="mt-1 text-xs text-slate-400">per month after the free first month</p>}
                <p className="mt-5 min-h-24 text-sm leading-6 text-slate-500">{description}</p>
                <div className="mt-5 rounded-xl bg-emerald-50 px-3 py-2 text-center text-xs font-bold text-emerald-800">First month free</div>
                <Link href="/get-your-munshi" className={`mt-5 inline-flex w-full min-h-12 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold ${index === 1 ? "bg-emerald-600 text-white hover:bg-emerald-700" : "border border-slate-200 text-slate-800 hover:bg-slate-50"}`}>
                  Start free <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-24">
        <div className="mx-auto max-w-[1320px] px-5 sm:px-6 lg:px-10">
          <div className="grid gap-8 rounded-[30px] border border-slate-200 bg-white p-7 lg:grid-cols-[.72fr_1.28fr] lg:p-10">
            <div>
              <LockKeyhole className="h-6 w-6 text-emerald-700" />
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">How MunshiOS handles access.</h2>
              <p className="mt-4 text-sm leading-7 text-slate-600">This section only states controls that are already present in the product.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Company-scoped workspaces", "Business records are scoped to the workspace they belong to."],
                ["User permissions", "Workspace access is controlled through user roles and permissions."],
                ["Authentication", "Account access uses the authentication system already integrated with MunshiOS."],
                ["HTTPS in production", "The production web application is served over HTTPS."],
              ].map(([title, text]) => (
                <div key={title} className="rounded-2xl bg-slate-50 p-4">
                  <ShieldCheck className="h-4 w-4 text-emerald-700" />
                  <h3 className="mt-3 text-sm font-bold">{title}</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1320px] px-5 pb-20 sm:px-6 lg:px-10">
        <div className="rounded-[30px] border border-emerald-100 bg-emerald-50 p-6 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-bold text-emerald-950">Best used on a laptop or desktop</p>
              <p className="mt-1 text-sm text-emerald-900/70">This website works on your phone. The business application is designed for larger screens.</p>
            </div>
            <a href={laptopShareHref} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-emerald-800 shadow-sm">
              <MessageCircle className="h-4 w-4" /> Send this link to my laptop on WhatsApp
            </a>
          </div>
        </div>
      </section>

      <section id="faq" className="border-t border-slate-200 bg-white py-20 sm:py-24">
        <div className="mx-auto grid max-w-[1320px] gap-12 px-5 sm:px-6 lg:grid-cols-[.72fr_1.28fr] lg:px-10">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">FAQ</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Questions to answer before you move your business.</h2>
          </div>
          <div className="divide-y divide-slate-200 rounded-[26px] border border-slate-200 px-5 sm:px-7">
            {faqs.map(([question, answer]) => (
              <details key={question} className="group py-5">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold sm:text-base">
                  <span>{question}</span><ChevronRight className="h-5 w-5 shrink-0 text-slate-400 transition group-open:rotate-90" />
                </summary>
                <p className="max-w-3xl pt-3 text-sm leading-6 text-slate-600">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#071821] py-16 text-white">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-8 px-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-10">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">Your first month is free</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Set up your business and test MunshiOS with real work.</h2>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/get-your-munshi" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-[#06151d] hover:bg-emerald-400">
              Start your free month <ArrowRight className="h-4 w-4" />
            </Link>
            <a href={whatsappHref} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/15 px-5 py-3 text-sm font-bold text-white hover:bg-white/5">
              <MessageCircle className="h-4 w-4" /> WhatsApp us
            </a>
          </div>
        </div>
      </section>

      <footer className="bg-[#06151d] text-white">
        <div className="mx-auto max-w-[1400px] px-5 py-10 sm:px-6 lg:px-10">
          <div className="flex flex-col gap-8 border-t border-white/10 pt-8 md:flex-row md:items-end md:justify-between">
            <div className="max-w-sm">
              <div className="flex items-center gap-2.5"><Image src="/brand/munshios-mark.svg" alt="" width={38} height={38} /><span className="text-lg font-bold">MunshiOS</span></div>
              <p className="mt-4 text-sm leading-6 text-slate-400">Sales, purchasing, inventory, khata and accounting for Pakistani businesses.</p>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm text-slate-300">
              <a href="#features" className="hover:text-white">Features</a>
              <a href="#industries" className="hover:text-white">Industries</a>
              <a href="#pricing" className="hover:text-white">Pricing</a>
              <a href={whatsappHref} className="hover:text-white">WhatsApp</a>
              <Link href="/privacy" className="hover:text-white">Privacy</Link>
              <Link href="/terms" className="hover:text-white">Terms</Link>
            </div>
          </div>
          <div className="mt-8 text-xs text-slate-500">© 2026 MunshiOS. Built for Pakistani businesses.</div>
        </div>
      </footer>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 p-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-2 gap-2">
          <Link href="/get-your-munshi" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 px-3 text-sm font-bold text-white">Start free</Link>
          <a href={whatsappHref} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800">
            <MessageCircle className="h-4 w-4 text-emerald-600" /> WhatsApp
          </a>
        </div>
      </div>

      <a href={whatsappHref} aria-label="WhatsApp MunshiOS" className="fixed bottom-5 right-5 z-40 hidden h-14 w-14 place-items-center rounded-full border border-white/30 bg-emerald-600 text-white shadow-[0_12px_30px_-10px_rgba(5,150,105,.8)] transition hover:-translate-y-1 hover:bg-emerald-700 lg:grid">
        <MessageCircle className="h-6 w-6" />
      </a>
    </main>
  );
}
