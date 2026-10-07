import type { Metadata } from "next";
import { MarketingHeader, MarketingFooter, PageHero, SectionTitle, FeatureGrid, AppPreview, CTA, marketingIcons } from "@/components/marketing/site";
const { Warehouse, ShoppingCart, ReceiptText, CircleDollarSign, BarChart3, PackageCheck, Check, LayoutDashboard } = marketingIcons;

export const metadata: Metadata = { title:"Wholesale Distribution Software Pakistan", description:"Wholesale software for Pakistani businesses with purchasing, GRN, stock, credit sales, receivables, cash and reporting.", alternates:{canonical:"/industries/wholesale"} };

const features = [
  { icon: LayoutDashboard, title:"Dashboard", text:"See sales, receivables, stock pressure and collection priorities without opening five reports." },
  { icon: ShoppingCart, title:"Sales", text:"Cash and credit sales, returns, discounts and customer balances stay connected." },
  { icon: Warehouse, title:"Inventory", text:"Track stock, receiving, adjustments and warehouse movements from the same operating record." },
  { icon: CircleDollarSign, title:"Receivables", text:"See who owes what, aging and collection priorities without rebuilding customer khata." },
  { icon: ReceiptText, title:"Cash & Bank", text:"Record where payments landed and connect them back to the business transaction." },
  { icon: Check, title:"Smart Collections", text:"Turn outstanding balances into an actionable collection view instead of a static statement." },
  { icon: PackageCheck, title:"Suppliers", text:"Purchasing, GRN, payments, returns and supplier balances live in the same workspace." },
  { icon: BarChart3, title:"Reports Center", text:"Operational and financial visibility comes from the same records your team already uses." },
] as const;

export default function WholesalePage() {
  return <main className="min-h-screen bg-[#fbfcfa] text-slate-950">
    <MarketingHeader />
    <PageHero eyebrow="Flagship wholesale workflow" title={<>Stop chasing numbers across the business.</>} body="Purchasing, GRN, stock, credit sales, customer and supplier balances, payments, returns and reporting in one wholesale workspace." visual={<AppPreview title="Ahmad Traders / Wholesale" stats={[["Receivables","Rs 842k","collection view"],["Stock value","Rs 2.1m","warehouse control"],["Collections due","14","needs attention"]]} rows={[["INV-1042","Credit sale","Customer balance updated"],["GRN-0821","Goods received","Stock + supplier updated"],["RCPT-518","Collection","Receivable reduced"],["RET-077","Return","Stock + ledger adjusted"]]} />} />
    <section className="bg-[#fbfcfa] py-16 sm:py-20"><div className="mx-auto max-w-[1320px] px-5 sm:px-6 lg:px-10">
      <SectionTitle eyebrow="Customer proof" title="A real wholesale problem, not a generic SaaS story." body="Ahmad Traders is the anchor customer story for the wholesale positioning: sales, purchases, stock, receivables, payments and reports should not live in separate places." />
      <div className="mt-10 grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
        <article className="rounded-[26px] bg-[#071821] p-7 text-white"><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-400">Satisfied customer story</p><h3 className="mt-5 text-3xl font-semibold">Ahmad Traders</h3><p className="mt-5 text-sm leading-7 text-slate-400">The proof point is simple: when a wholesaler asks where a sale, payment, stock movement or balance went, the answer should not depend on separate registers and spreadsheets.</p><p className="mt-7 text-2xl font-semibold text-emerald-300">“Sab kuch aik hi jagah.”</p></article>
        <article className="rounded-[26px] border border-slate-200 bg-white p-7"><div className="grid gap-6 sm:grid-cols-2"><div><p className="font-bold text-rose-700">Before</p><div className="mt-4 space-y-3 text-sm text-slate-600">{["Sales scattered","Purchases separate","Stock hard to reconcile","Receivables chased manually","Payments hard to trace"].map(x=><p key={x}>• {x}</p>)}</div></div><div><p className="font-bold text-emerald-700">With MunshiOS</p><div className="mt-4 space-y-3 text-sm text-slate-600">{["Dashboard visibility","Connected sales & stock","Customer receivables","Cash & Bank","Smart Collections + Reports"].map(x=><p key={x}>• {x}</p>)}</div></div></div></article>
      </div>
    </div></section>
    <section className="border-y border-slate-200 bg-white py-16 sm:py-20"><div className="mx-auto max-w-[1320px] px-5 sm:px-6 lg:px-10"><SectionTitle eyebrow="Workflow" title="Purchases → GRN → Inventory → Sales → Payments → Ledgers → Reports" body="A single operating chain instead of separate registers." /><div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{["Purchase order","GRN","Warehouse stock","Credit sale","Customer khata","Collection","Cash / Bank","Reports"].map((x,i)=><div key={x} className="rounded-2xl border border-slate-200 bg-[#fbfcfa] p-5"><p className="text-[10px] font-bold text-emerald-700">0{i+1}</p><p className="mt-3 text-sm font-bold">{x}</p></div>)}</div></div></section>
    <section className="py-16 sm:py-20"><div className="mx-auto max-w-[1320px] px-5 sm:px-6 lg:px-10"><SectionTitle eyebrow="Wholesale workspace" title="Everything the operator keeps checking during the day." body="The screens are organized around real questions, not software categories." /><FeatureGrid items={features} columns={4} /></div></section>
    <CTA title="Run wholesale without chasing the records." /><MarketingFooter />
  </main>;
}