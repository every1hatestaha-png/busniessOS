import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BarChart3, Check, ChevronRight, CircleDollarSign, Factory, LayoutDashboard, PackageCheck, ReceiptText, ShieldCheck, ShoppingCart, Warehouse } from "lucide-react";
import { MarketingHeader, MarketingFooter, CTA } from "@/components/marketing/site";
import { ConnectedOperationsCanvas, ManufacturingVisual, RestaurantVisual, RetailVisual, WholesaleVisual } from "@/components/marketing/premium-visuals";

function HeroProduct() {
  const steps = [["PO-1048","Purchase","Approved"],["GRN-0821","Receive","Stock +120"],["SUP-204","Payable","Updated"],["RPT","Reports","Refreshed"]] as const;
  return <div className="relative mx-auto w-full max-w-[760px] lg:translate-x-4">
    <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_24px_70px_-42px_rgba(15,23,42,.34)] sm:rounded-[30px] sm:shadow-[0_38px_110px_-42px_rgba(15,23,42,.42)]">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5 sm:px-4 sm:py-3"><div className="flex gap-1.5 sm:gap-2">{[0,1,2].map(i=><span key={i} className="size-2 rounded-full bg-slate-200"/>)}</div><span className="hidden text-[9px] font-bold uppercase tracking-[.14em] text-slate-400 sm:block">MunshiOS workspace · sample data</span></div>
      <div className="flex min-h-0 sm:min-h-[438px]">
        <aside className="hidden w-44 shrink-0 bg-[#061D2E] p-4 text-white sm:block"><div className="flex items-center gap-2 border-b border-white/10 pb-4"><Image src="/brand/munshios-mark.svg" alt="" width={30} height={30}/><span className="text-sm font-semibold">MunshiOS</span></div><div className="mt-5 space-y-1 text-xs text-slate-500">{[[LayoutDashboard,"Overview"],[ReceiptText,"Sales"],[ShoppingCart,"Purchases"],[Warehouse,"Inventory"],[CircleDollarSign,"Accounting"],[BarChart3,"Reports"]].map(([Icon,label],i)=>{const I=Icon as typeof LayoutDashboard;return <div key={label as string} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 ${i===2?"bg-emerald-400/10 text-emerald-300":"hover:text-slate-300"}`}><I className="size-3.5"/>{label as string}</div>})}</div></aside>
        <div className="min-w-0 flex-1 bg-[#f7faf9] p-3 sm:p-5">
          <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-emerald-700">Connected purchase workflow</p><h3 className="mt-1.5 text-lg font-semibold tracking-[-.03em] sm:mt-2 sm:text-xl">Purchase order → stock → payable</h3><p className="mt-1 text-xs text-slate-500">One transaction, downstream records kept in context.</p></div><span className="hidden rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[9px] font-bold text-emerald-800 sm:block">LIVE WORKFLOW</span></div>
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 sm:mt-5 sm:rounded-2xl sm:p-4"><div className="flex items-center justify-between"><div><p className="text-[9px] text-slate-400">Supplier</p><p className="mt-1 text-sm font-semibold">Sample Engineering Supplier</p></div><div className="text-right"><p className="text-[9px] text-slate-400">PO total</p><p className="mt-1 text-sm font-semibold">Rs 286,400</p></div></div><div className="mt-3 grid grid-cols-3 gap-1.5 sm:mt-4 sm:gap-2">{[["Front hub blank","120 pcs"],["Bearing set","120 sets"],["Oil seal","120 pcs"]].map(([a,b])=><div key={a} className="rounded-lg bg-slate-50 p-2 sm:rounded-xl sm:p-3"><p className="text-[9px] font-semibold">{a}</p><p className="mt-1 text-[9px] text-slate-500">{b}</p></div>)}</div></div>
          <div className="mt-2.5 grid grid-cols-2 gap-1.5 sm:mt-3 sm:grid-cols-4 sm:gap-2">{steps.map(([code,label,state],i)=><div key={code} className={`relative rounded-xl border p-2.5 sm:p-3 ${i===3?"border-emerald-200 bg-emerald-50":"border-slate-200 bg-white"}`}><p className="text-[8px] font-bold text-emerald-700">0{i+1}</p><p className="mt-2 text-[10px] font-bold">{label}</p><p className="mt-1 text-[8px] text-slate-400">{code}</p><p className="mt-3 text-[8px] font-semibold text-emerald-700">{state}</p>{i<3&&<ChevronRight className="absolute -right-3 top-1/2 z-10 hidden size-4 -translate-y-1/2 text-emerald-400 sm:block"/>}</div>)}</div>
          <div className="mt-2.5 flex items-start gap-2 border-t border-slate-200 pt-2.5 text-[9px] font-semibold leading-4 text-slate-700 sm:mt-3 sm:items-center sm:pt-3 sm:text-[10px]"><Check className="size-4 text-emerald-600"/>Receiving updates stock and the supplier balance from the same workflow.</div>
        </div>
      </div>
    </div>
  </div>;
}

export default function Home(){
  return <main className="min-h-screen overflow-x-hidden bg-[#fbfcfa] text-[#0b1720]">
    <MarketingHeader/>
    <section className="relative overflow-hidden bg-white">
      <div className="mx-auto grid max-w-[1440px] gap-8 px-5 py-10 sm:gap-12 sm:px-6 sm:py-14 lg:grid-cols-[.78fr_1.22fr] lg:items-center lg:px-10 lg:py-20">
        <div className="max-w-2xl"><div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.16em] text-emerald-800"><span className="h-px w-6 bg-emerald-500"/>Built for Pakistani businesses</div><h1 className="mt-6 max-w-[720px] text-[48px] font-semibold leading-[.96] tracking-[-.058em] sm:text-6xl lg:text-[72px]">Run the business. Stop chasing the business.</h1><p className="mt-6 max-w-xl text-[17px] leading-8 text-slate-600">Sales, purchasing, stock, khata, accounting and industry workflows in one operating system built around how Pakistani businesses actually work.</p><div className="mt-7 grid grid-cols-2 gap-2 sm:mt-8 sm:flex sm:flex-row sm:gap-3"><Link href="/sign-up" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#061D2E] px-3 py-3 text-xs font-bold text-white hover:bg-[#123A55] sm:min-h-12 sm:px-6 sm:py-3.5 sm:text-sm">Get MunshiOS <ArrowRight className="size-4"/></Link><Link href="/product" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-bold text-slate-800 sm:min-h-12 sm:px-6 sm:py-3.5 sm:text-sm">See the product</Link></div><div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] leading-4 text-slate-600 sm:mt-7 sm:flex sm:flex-wrap sm:gap-x-5 sm:text-sm">{["PKR 29,000 implementation","PKR 5,000/month","Guided setup"].map(x=><span key={x} className="flex items-center gap-2"><Check className="size-4 text-emerald-600"/>{x}</span>)}</div></div>
        <HeroProduct/>
      </div>
      <div className="mx-auto max-w-[1320px] px-5 pb-10 sm:px-6 lg:px-10"><div className="grid grid-cols-2 border-y border-slate-200 py-3 sm:grid-cols-4 sm:py-5">{[["Connected records","Sales, stock and balances"],["Industry depth","Wholesale to restaurant"],["Workspace isolation","Business-scoped data"],["Pakistan-first","Khata and local workflows"]].map(([a,b],i)=><div key={a} className={`px-0 py-2.5 pr-3 sm:px-5 sm:py-3 ${i?"sm:border-l sm:border-slate-200":""}`}><p className="text-sm font-bold">{a}</p><p className="mt-1 text-xs text-slate-500">{b}</p></div>)}</div></div>
    </section>

    <section className="bg-[#061D2E] py-16 text-white sm:py-20">
      <div className="mx-auto grid max-w-[1320px] gap-10 px-5 sm:px-6 lg:grid-cols-[.72fr_1.28fr] lg:items-center lg:px-10">
        <div><p className="text-[11px] font-bold uppercase tracking-[.16em] text-emerald-300">Flagship customer story</p><h2 className="mt-5 text-4xl font-semibold leading-[1.02] tracking-[-.05em] sm:text-6xl">Ahmad Traders<br/><span className="text-emerald-300">“Sab kuch aik hi jagah.”</span></h2><p className="mt-6 max-w-lg text-sm leading-7 text-slate-400">The wholesale story is the MunshiOS idea in one sentence: sales, stock, receivables, payments and reports should not live in separate registers.</p><div className="mt-7 grid max-w-lg grid-cols-3 gap-2">{[["Sales","Connected"],["Stock","Traceable"],["Collections","Visible"]].map(([a,b])=><div key={a} className="border-t border-white/15 pt-3"><p className="text-[9px] uppercase tracking-[.12em] text-slate-500">{a}</p><p className="mt-1 text-xs font-bold">{b}</p></div>)}</div><Link href="/industries/wholesale" className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-emerald-300">View the wholesale case study <ArrowRight className="size-4"/></Link></div>
        <WholesaleVisual dark/>
      </div>
    </section>

    <section id="solutions" className="py-16 sm:py-20"><div className="mx-auto max-w-[1320px] px-5 sm:px-6 lg:px-10">
      <div className="grid gap-10 lg:grid-cols-[.72fr_1.28fr] lg:items-end"><div><p className="text-[11px] font-bold uppercase tracking-[.16em] text-emerald-700">Built around the operation</p><h2 className="mt-4 text-4xl font-semibold tracking-[-.05em] sm:text-5xl">Different businesses should not feel like the same template.</h2></div><p className="max-w-2xl text-sm leading-7 text-slate-600 lg:justify-self-end">Restaurant service, manufacturing output, retail daily control and wholesale collections each get a workspace that mirrors the work instead of forcing every team into the same generic ERP screen.</p></div>
      <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-12">
        <Link href="/industries/restaurant" className="lg:col-span-7"><RestaurantVisual/></Link>
        <Link href="/industries/manufacturing" className="lg:col-span-5"><ManufacturingVisual/></Link>
        <Link href="/industries/retail" className="lg:col-span-5"><RetailVisual/></Link>
        <Link href="/industries/wholesale" className="lg:col-span-7"><WholesaleVisual/></Link>
      </div>
    </div></section>

    <section className="border-y border-slate-200 bg-white py-16 sm:py-20"><div className="mx-auto max-w-[1320px] px-5 sm:px-6 lg:px-10">
      <div className="grid gap-10 lg:grid-cols-[.7fr_1.3fr] lg:items-center"><div><p className="text-[11px] font-bold uppercase tracking-[.16em] text-emerald-700">The product idea</p><h2 className="mt-4 text-4xl font-semibold tracking-[-.05em] sm:text-5xl">One transaction. Connected consequences.</h2><p className="mt-5 text-sm leading-7 text-slate-600">MunshiOS is not a pile of modules. A purchase can affect receiving, stock, supplier balance and reports without your team rebuilding the same story in four places.</p><Link href="/product" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-emerald-700">Explore connected operations <ArrowRight className="size-4"/></Link></div><ConnectedOperationsCanvas/></div>
    </div></section>

    <section className="py-16 sm:py-20"><div className="mx-auto grid max-w-[1320px] gap-6 px-5 sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:px-10">
      <div className="rounded-[30px] bg-[#061D2E] p-7 text-white sm:p-9"><ShieldCheck className="size-6 text-emerald-300"/><p className="mt-8 text-[11px] font-bold uppercase tracking-[.16em] text-emerald-300">Trust by architecture</p><h2 className="mt-4 max-w-xl text-4xl font-semibold tracking-[-.05em]">Every business gets its own workspace.</h2><p className="mt-5 max-w-xl text-sm leading-7 text-slate-400">Products, customers, suppliers, sales, purchases, inventory, expenses, accounts and reports stay scoped to the selected business context.</p><Link href="/security" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-emerald-300">See how access works <ArrowRight className="size-4"/></Link></div>
      <div className="border-y border-slate-200 px-1 py-7 sm:px-7"><p className="text-[11px] font-bold uppercase tracking-[.16em] text-slate-400">Commercial model</p><p className="mt-5 text-5xl font-semibold tracking-[-.055em]">PKR 29,000</p><p className="mt-1 text-sm text-slate-500">one-time implementation</p><div className="my-6 h-px bg-slate-200"/><p className="text-4xl font-semibold tracking-[-.05em]">PKR 5,000<span className="text-xl text-slate-400"> / month</span></p><p className="mt-4 text-sm leading-7 text-slate-600">Set up the system around the business first. Then keep the configured workspace running on one clear monthly subscription.</p><Link href="/pricing" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-emerald-700">See pricing <ArrowRight className="size-4"/></Link></div>
    </div></section>

    <CTA title="Give the business one place to run from."/>
    <MarketingFooter/>
  </main>;
}