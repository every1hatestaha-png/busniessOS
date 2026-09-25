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
  Mail,
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
    href: "/industries/manufacturing",
    blurb: "Raw materials, BOMs, production runs, finished goods, wastage, warehouses and accounting in one system.",
    modules: ["Raw materials", "BOMs", "Production runs", "Wastage", "Warehouses", "Accounting"],
  },
  {
    icon: PackageCheck,
    title: "Wholesale",
    href: "/industries/wholesale",
    blurb: "Purchasing, GRN, credit sales, customer and supplier ledgers, returns and tax workflows.",
    modules: ["Purchase orders", "GRN", "Inventory", "Credit sales", "Customer khata", "Supplier khata"],
  },
];

const otherIndustries = [
  { icon: Store, title: "Retail", href: "/industries/retail", blurb: "Sales, stock, purchases, customer accounts, supplier accounts, expenses and daily reporting." },
  { icon: UtensilsCrossed, title: "Restaurant", href: "/industries/restaurant", blurb: "Tables, recipes, kitchen tickets, ingredient stock and cash closing in one workspace." },
  { icon: Wrench, title: "Services", href: "/industries/services", blurb: "Clients, quotations, jobs, billing, expenses, collections and reporting for service teams." },
];

const modules = [
  { icon: Warehouse, title: "Inventory & warehouses", text: "Track movements, adjustments, transfers and stock across warehouses." },
  { icon: ShoppingCart, title: "Sales & customer khata", text: "Handle credit sales, receipts, returns, discounts and customer balances." },
  { icon: PackageCheck, title: "Purchases & GRN", text: "Move from purchase order to receiving, stock and supplier balance without duplicate entry." },
  { icon: CircleDollarSign, title: "Accounting", text: "Connect cash, bank, expenses, receivables, payables, GST, WHT and the general ledger." },
  { icon: Boxes, title: "Manufacturing", text: "Manage BOMs, production runs, material consumption, finished output and wastage." },
  { icon: BarChart3, title: "Reports", text: "See financial and operational reports for stock, ledgers, payables and receivables." },
];

const faqs = [
  ["Is there a free trial?", "Yes. Your first month is free, so you can test MunshiOS with real business work before paying for month two."],
  ["Can I use it alongside Excel?", "Yes. Run MunshiOS beside your current process during the free month and move when your team is comfortable."],
  ["Can you help move my existing data?", "Yes. We can help set up products, customers, suppliers and opening balances. The migration approach depends on your current data."],
  ["Is my company data separated from other companies?", "Yes. Your business records stay inside your workspace, separate from other businesses using MunshiOS."],
  ["Does MunshiOS work on phones?", "The website works on phones. The business application is designed primarily for laptop and desktop use so larger operational screens remain practical."],
  ["Does MunshiOS support FBR e-invoicing?", "MunshiOS includes tax and FBR-related product fields. Live FBR e-invoicing is only presented as available once it is fully verified for production use."],
];

const plans = [
  {
    name: "Munshi Core",
    price: "Rs. 2,990",
    sub: "per month after your free first month",
    description: "For trading businesses that need the core sales, purchasing, khata and reporting workflow.",
    features: ["Sales & receipts", "Purchases & GRN", "Customers & suppliers", "Customer & supplier khata", "Expenses", "Core reports"],
  },
  {
    name: "Custom Munshi",
    price: "Build yours",
    sub: "price shown before workspace creation",
    description: "Choose the industry modules and operational depth your business actually needs.",
    features: ["Everything in Core", "Industry module selection", "Warehouse configuration", "Manufacturing or restaurant modules", "Configured business setup", "Module-based pricing"],
  },
  {
    name: "Business+",
    price: "Custom",
    sub: "for complex implementations",
    description: "For factories and larger operations that need a tailored rollout and deeper workflow setup.",
    features: ["Everything in Custom", "Complex manufacturing setups", "Advanced workflow configuration", "Structured implementation", "Multi-workflow rollout", "Tailored onboarding"],
  },
];

function ProductFlowPreview() {
  const steps = [
    ["PO-1048", "Purchase order", "Approved"],
    ["GRN-0821", "Goods receipt", "Stock received"],
    ["WH-MAIN", "Inventory", "+120 units"],
    ["SUP-204", "Supplier ledger", "Updated"],
  ];

  return (
    <div className="relative mx-auto w-full max-w-[760px] lg:translate-x-5">
      <div className="absolute -inset-10 -z-10 rounded-[48px] bg-[radial-gradient(circle_at_50%_42%,rgba(16,185,129,.2),transparent_66%)] blur-2xl" />
      <div className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_36px_110px_-38px_rgba(15,23,42,.4)]">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="flex gap-2"><span className="size-2.5 rounded-full bg-slate-200" /><span className="size-2.5 rounded-full bg-slate-200" /><span className="size-2.5 rounded-full bg-slate-200" /></div>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700">Product interface preview · sample data</span>
        </div>
        <div className="flex min-h-[430px]">
          <aside className="hidden w-44 shrink-0 bg-[#071821] p-4 text-white sm:block">
            <div className="flex items-center gap-2 border-b border-white/10 pb-4"><Image src="/brand/munshios-mark.svg" alt="" width={32} height={32} /><span className="text-sm font-semibold">MunshiOS</span></div>
            <div className="mt-5 space-y-1.5 text-xs text-slate-400">
              {[[LayoutDashboard,"Dashboard"],[ReceiptText,"Sales"],[ShoppingCart,"Purchases"],[Warehouse,"Inventory"],[CircleDollarSign,"Accounting"],[PackageCheck,"GRN"],[BarChart3,"Reports"]].map(([Icon,label], index) => {
                const NavIcon = Icon as typeof LayoutDashboard;
                return <div key={label as string} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 ${index === 2 ? "bg-emerald-500/15 text-emerald-300" : ""}`}><NavIcon className="size-3.5" /><span>{label as string}</span></div>;
              })}
            </div>
          </aside>
          <div className="min-w-0 flex-1 bg-[#f7faf9] p-4 sm:p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">Connected purchase workflow</p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-semibold text-slate-950">Purchase order to ledger</h3><p className="mt-1 text-xs text-slate-500">One workflow, four records kept in sync.</p></div><span className="rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-bold text-white">Live workflow pattern</span></div>
            <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between"><div><p className="text-[10px] text-slate-500">Supplier</p><p className="mt-1 text-sm font-semibold">Sample Engineering Supplier</p></div><div className="text-right"><p className="text-[10px] text-slate-500">PO total</p><p className="mt-1 text-sm font-semibold">Rs. 286,400</p></div></div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">{[["Front hub blank","120 pcs"],["Bearing set","120 sets"],["Oil seal","120 pcs"]].map(([item, qty]) => <div key={item} className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-medium text-slate-800">{item}</p><p className="mt-1 text-[10px] text-slate-500">{qty}</p></div>)}</div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              {steps.map(([code,label,status], index) => <div key={code} className={`relative rounded-2xl border p-3 ${index === 3 ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}><p className="text-[9px] font-bold text-emerald-700">0{index + 1}</p><p className="mt-3 text-[10px] font-semibold text-slate-900">{label}</p><p className="mt-1 text-[9px] text-slate-500">{code}</p><p className="mt-3 text-[9px] font-semibold text-emerald-700">{status}</p>{index < 3 && <ChevronRight className="absolute -right-3 top-1/2 z-10 hidden size-4 -translate-y-1/2 text-emerald-500 sm:block" />}</div>)}
            </div>
            <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4"><div className="flex items-center gap-2 text-xs font-semibold text-emerald-900"><Check className="size-4" />Receiving updates stock and the supplier balance from the same workflow.</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://business-os-khzr.vercel.app";
  const whatsappNumber = process.env.NEXT_PUBLIC_MUNSHIOS_WHATSAPP?.replace(/\D/g, "");
  const whatsappHref = whatsappNumber ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent("Salam, I want to know more about MunshiOS and the free first month.")}` : "/get-your-munshi?intent=contact";
  const laptopShareHref = `https://wa.me/?text=${encodeURIComponent(`Open MunshiOS on your laptop: ${siteUrl}`)}`;
  const emailShareHref = `mailto:?subject=${encodeURIComponent("MunshiOS link for my laptop")}&body=${encodeURIComponent(`Open MunshiOS here: ${siteUrl}`)}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "MunshiOS",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: siteUrl,
        description: "ERP software for Pakistani businesses covering sales, purchasing, inventory, khata, accounting and industry workflows.",
        offers: { "@type": "Offer", price: "2990", priceCurrency: "PKR", description: "Munshi Core monthly price after the free first month." },
      },
      {
        "@type": "FAQPage",
        mainEntity: faqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })),
      },
    ],
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#fbfcfa] pb-20 text-[#0b1720] selection:bg-emerald-200 lg:pb-0">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-2xl">
        <div className="mx-auto flex h-[68px] max-w-[1400px] items-center justify-between px-4 sm:px-6 lg:px-10">
          <Link href="/" className="flex items-center gap-2.5" aria-label="MunshiOS home"><Image src="/brand/munshios-mark.svg" alt="" width={38} height={38} priority /><span className="text-[18px] font-bold tracking-[-0.03em]">MunshiOS</span></Link>
          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 lg:flex" aria-label="Main navigation"><a href="#product" className="transition hover:text-emerald-700">Product</a><a href="#industries" className="transition hover:text-emerald-700">Industries</a><a href="#pricing" className="transition hover:text-emerald-700">Pricing</a><a href="#security" className="transition hover:text-emerald-700">Security</a><a href="#faq" className="transition hover:text-emerald-700">FAQ</a></nav>
          <div className="flex items-center gap-2"><Link href="/sign-in" className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Login</Link><Link href="/get-your-munshi" className="hidden items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 sm:inline-flex">Start your free month <ArrowRight className="size-4" /></Link></div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-slate-200/70 bg-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_22%,rgba(16,185,129,.15),transparent_31%),radial-gradient(circle_at_18%_8%,rgba(14,116,144,.07),transparent_27%)]" />
        <div className="relative mx-auto grid max-w-[1400px] gap-12 px-5 pb-20 pt-12 sm:px-6 lg:grid-cols-[.85fr_1.15fr] lg:items-center lg:px-10 lg:pb-28 lg:pt-20">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-800"><Zap className="size-3.5" />Built for Pakistani businesses</div>
            <h1 className="mt-6 text-[46px] font-semibold leading-[.98] tracking-[-0.055em] sm:text-6xl lg:text-[72px]">Your business deserves its own <span className="text-emerald-600">Munshi.</span></h1>
            <p className="mt-6 max-w-xl text-[17px] leading-8 text-slate-600 sm:text-lg">Sales, purchases, inventory, khata and accounting in one connected system. Built for manufacturers, wholesalers and growing Pakistani businesses.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row"><Link href="/get-your-munshi" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3.5 text-sm font-bold text-white shadow-[0_18px_35px_-18px_rgba(5,150,105,.8)] hover:-translate-y-0.5 hover:bg-emerald-700">Start your free month <ArrowRight className="size-4" /></Link><a href={whatsappHref} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 hover:border-slate-300"><MessageCircle className="size-4 text-emerald-600" />Talk to us on WhatsApp</a></div>
            <div className="mt-7 grid gap-2 text-sm text-slate-600 sm:grid-cols-2"><span className="flex items-center gap-2"><Check className="size-4 text-emerald-600" />First month free</span><span className="flex items-center gap-2"><Check className="size-4 text-emerald-600" />From Rs 2,990/month after trial</span><span className="flex items-center gap-2"><Check className="size-4 text-emerald-600" />Desktop-first business app</span><span className="flex items-center gap-2"><Check className="size-4 text-emerald-600" />Separate workspace for every business</span></div>
          </div>
          <div className="hidden sm:block"><ProductFlowPreview /></div>
        </div>
      </section>

      <section className="relative z-10 mx-auto -mt-5 max-w-[1320px] px-5 sm:px-6 lg:px-10">
        <div className="grid overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_50px_-30px_rgba(15,23,42,.3)] sm:grid-cols-2 lg:grid-cols-4">
          {[[ShieldCheck,"Separate business data","Your records stay inside your workspace and separate from other businesses."],[Warehouse,"Warehouse control","Track stock, movements and transfers across managed warehouses."],[Factory,"Manufacturing built in","BOMs, production runs, material consumption and wastage live in the same product."],[ReceiptText,"Pakistan-ready workflows","Khata, GST, WHT, credit sales and supplier payments fit local operations."]].map(([Icon,title,text], index) => { const TrustIcon = Icon as typeof ShieldCheck; return <div key={title as string} className={`p-6 ${index ? "border-t border-slate-100 sm:border-l sm:border-t-0" : ""}`}><TrustIcon className="size-5 text-emerald-700" /><p className="mt-3 text-sm font-bold">{title as string}</p><p className="mt-1 text-xs leading-5 text-slate-500">{text as string}</p></div>; })}
        </div>
      </section>

      <section className="py-20 sm:py-24">
        <div className="mx-auto max-w-[1320px] px-5 sm:px-6 lg:px-10">
          <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr] lg:items-stretch">
            <div className="rounded-[30px] bg-[#071821] p-7 text-white sm:p-9"><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">Real business proof</p><h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">Built against real operating workflows, not demo-only screens.</h2><p className="mt-5 text-sm leading-7 text-slate-400">MunshiOS is being tested with real purchasing, inventory, statement and print workflows before wider rollout.</p></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-[28px] border border-emerald-200 bg-white p-6"><span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700">Pilot implementation</span><h3 className="mt-5 text-xl font-bold">Arshad Sons Engineering Solutions</h3><p className="mt-3 text-sm leading-6 text-slate-600">Testing MunshiOS around purchasing, inventory, customer and supplier statements, document printing and operational setup.</p></div>
              <div className="rounded-[28px] border border-slate-200 bg-white p-6"><span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">Product principle</span><h3 className="mt-5 text-xl font-bold">Proof before claims</h3><p className="mt-3 text-sm leading-6 text-slate-600">We show workflows that exist in the product and keep unverified integrations out of the sales pitch until they are production-ready.</p></div>
            </div>
          </div>
        </div>
      </section>

      <section id="product" className="border-y border-slate-200 bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-[1400px] px-5 sm:px-6 lg:px-10"><div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">See the workflow</p><h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">A purchase should update receiving, stock and the supplier balance without rebuilding the same record three times.</h2><p className="mt-5 text-slate-600">The product preview above mirrors the connected workflow MunshiOS is built around. Your team works through the transaction. The dependent records follow it.</p></div><div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{modules.map(({icon: Icon,title,text}) => <div key={title} className="rounded-[24px] border border-slate-200 bg-[#fcfdfc] p-6"><div className="flex size-11 items-center justify-center rounded-2xl border border-emerald-100 bg-white text-emerald-700"><Icon className="size-5" /></div><h3 className="mt-5 font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p></div>)}</div></div>
      </section>

      <section id="industries" className="py-20 sm:py-24">
        <div className="mx-auto max-w-[1400px] px-5 sm:px-6 lg:px-10"><div className="mx-auto max-w-3xl text-center"><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Industry fit</p><h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">Choose the workflow that matches your business.</h2></div><div className="mt-12 grid gap-5 lg:grid-cols-2">{focusIndustries.map(({icon: Icon,title,href,blurb,modules: items}) => <div key={title} className="rounded-[28px] border border-emerald-200 bg-white p-6 shadow-[0_18px_50px_-38px_rgba(5,150,105,.6)]"><div className="grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><Icon className="size-5" /></div><h3 className="mt-6 text-2xl font-bold">{title}</h3><p className="mt-3 text-sm leading-6 text-slate-500">{blurb}</p><div className="mt-5 flex flex-wrap gap-2">{items.map(item => <span key={item} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">{item}</span>)}</div><Link href={href} className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-emerald-700">Explore {title.toLowerCase()} <ArrowRight className="size-4" /></Link></div>)}</div><div className="mt-5 grid gap-4 md:grid-cols-3">{otherIndustries.map(({icon: Icon,title,href,blurb}) => <Link href={href} key={title} className="rounded-[24px] border border-slate-200 bg-white p-5 hover:border-emerald-200"><Icon className="size-5 text-emerald-700" /><h3 className="mt-4 font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{blurb}</p><span className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-emerald-700">View solution <ArrowRight className="size-3.5" /></span></Link>)}</div></div>
      </section>

      <section id="pricing" className="border-y border-slate-200 bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-[1320px] px-5 sm:px-6 lg:px-10"><div className="mx-auto max-w-3xl text-center"><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Pricing</p><h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">Know what each plan is for before you start.</h2><p className="mt-5 text-slate-600">Every setup starts with your first month free.</p></div><div className="mt-12 overflow-x-auto rounded-[28px] border border-slate-200"><table className="min-w-[900px] w-full border-collapse bg-white text-left"><thead><tr className="border-b border-slate-200 bg-slate-50"><th className="p-5 text-sm font-bold">Plan</th>{plans.map(plan => <th key={plan.name} className="p-5 align-top"><p className="text-sm font-bold">{plan.name}</p><p className="mt-2 text-2xl font-semibold tracking-tight">{plan.price}</p><p className="mt-1 text-xs font-normal text-slate-500">{plan.sub}</p></th>)}</tr></thead><tbody className="divide-y divide-slate-100"><tr><td className="p-5 text-sm font-semibold text-slate-700">Best for</td>{plans.map(plan => <td key={plan.name} className="p-5 text-sm leading-6 text-slate-600">{plan.description}</td>)}</tr>{[0,1,2,3,4,5].map(index => <tr key={index}><td className="p-5 text-sm font-semibold text-slate-700">{["Core selling & buying","Khata & balances","Industry modules","Warehouse setup","Implementation depth","Pricing model"][index]}</td>{plans.map(plan => <td key={plan.name} className="p-5 text-sm text-slate-600"><span className="inline-flex items-center gap-2"><Check className="size-4 text-emerald-600" />{plan.features[index]}</span></td>)}</tr>)}<tr><td className="p-5" />{plans.map(plan => <td key={plan.name} className="p-5"><Link href="/get-your-munshi" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700">Start your free month <ArrowRight className="size-4" /></Link></td>)}</tr></tbody></table></div></div>
      </section>

      <section id="security" className="py-20 sm:py-24">
        <div className="mx-auto max-w-[1320px] px-5 sm:px-6 lg:px-10"><div className="grid gap-8 rounded-[30px] border border-slate-200 bg-white p-7 lg:grid-cols-[.72fr_1.28fr] lg:p-10"><div><LockKeyhole className="size-6 text-emerald-700" /><h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">Your business data stays inside your business.</h2><p className="mt-4 text-sm leading-7 text-slate-600">MunshiOS separates company workspaces, controls access by user role, protects account sign-in and serves the production app over HTTPS.</p></div><div className="grid gap-3 sm:grid-cols-2">{[["Separate business workspaces","Your records stay separate from every other business on MunshiOS."],["Role-based access","You decide which team members can access the parts of the workspace their job requires."],["Protected sign-in","Your account uses the authentication layer built into MunshiOS instead of a shared business password."],["Encrypted connection","The production web application runs over HTTPS so data is protected while it travels between your browser and MunshiOS."]].map(([title,text]) => <div key={title} className="rounded-2xl bg-slate-50 p-4"><ShieldCheck className="size-4 text-emerald-700" /><h3 className="mt-3 text-sm font-bold">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{text}</p></div>)}</div></div></div>
      </section>

      <section className="mx-auto max-w-[1320px] px-5 pb-20 sm:px-6 lg:px-10"><div className="rounded-[30px] border border-emerald-100 bg-emerald-50 p-6 sm:p-8"><div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-sm font-bold text-emerald-950">Best used on a laptop or desktop</p><p className="mt-1 text-sm text-emerald-900/70">Send yourself the link now and continue on a larger screen.</p></div><div className="flex flex-col gap-2 sm:flex-row"><a href={laptopShareHref} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-emerald-800 shadow-sm"><MessageCircle className="size-4" />Send on WhatsApp</a><a href={emailShareHref} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white/70 px-5 py-3 text-sm font-bold text-emerald-800"><Mail className="size-4" />Email me the link</a></div></div></div></section>

      <section id="faq" className="border-t border-slate-200 bg-white py-20 sm:py-24"><div className="mx-auto grid max-w-[1320px] gap-12 px-5 sm:px-6 lg:grid-cols-[.72fr_1.28fr] lg:px-10"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">FAQ</p><h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Questions to answer before you move your business.</h2></div><div className="divide-y divide-slate-200 rounded-[26px] border border-slate-200 px-5 sm:px-7">{faqs.map(([question,answer]) => <details key={question} className="group py-5"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold sm:text-base"><span>{question}</span><ChevronRight className="size-5 shrink-0 text-slate-400 transition group-open:rotate-90" /></summary><p className="max-w-3xl pt-3 text-sm leading-6 text-slate-600">{answer}</p></details>)}</div></div></section>

      <section className="bg-[#071821] py-16 text-white"><div className="mx-auto flex max-w-[1320px] flex-col gap-8 px-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-10"><div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">Your first month is free</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Set up your business and test MunshiOS with real work.</h2></div><div className="flex flex-col gap-3 sm:flex-row"><Link href="/get-your-munshi" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-[#06151d] hover:bg-emerald-400">Start your free month <ArrowRight className="size-4" /></Link><a href={whatsappHref} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-white hover:bg-white/5"><MessageCircle className="size-4" />Talk to us on WhatsApp</a></div></div></section>

      <footer className="bg-[#06151d] text-white"><div className="mx-auto max-w-[1400px] px-5 py-10 sm:px-6 lg:px-10"><div className="flex flex-col gap-8 border-t border-white/10 pt-8 md:flex-row md:items-end md:justify-between"><div className="max-w-sm"><div className="flex items-center gap-2.5"><Image src="/brand/munshios-mark.svg" alt="" width={38} height={38} /><span className="text-lg font-bold">MunshiOS</span></div><p className="mt-4 text-sm leading-6 text-slate-400">Sales, purchasing, inventory, khata and accounting for Pakistani businesses.</p></div><div className="flex flex-wrap gap-x-5 gap-y-3 text-sm text-slate-300"><a href="#product" className="hover:text-white">Product</a><a href="#industries" className="hover:text-white">Industries</a><a href="#pricing" className="hover:text-white">Pricing</a><a href="#security" className="hover:text-white">Security</a><Link href="/privacy" className="hover:text-white">Privacy</Link><Link href="/terms" className="hover:text-white">Terms</Link></div></div><div className="mt-8 text-xs text-slate-500">© 2026 MunshiOS. Built for Pakistani businesses.</div></div></footer>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 p-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] backdrop-blur lg:hidden"><div className="mx-auto grid max-w-lg grid-cols-[1fr_auto] gap-2"><Link href="/get-your-munshi" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 px-3 text-sm font-bold text-white">Start your free month</Link><a href={whatsappHref} aria-label="WhatsApp MunshiOS" className="inline-flex size-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-800"><MessageCircle className="size-5 text-emerald-600" /></a></div></div>
    </main>
  );
}
