import Link from "next/link";
import { ArrowRight, BarChart3, Boxes, Check, CircleDollarSign, Factory, LayoutDashboard, LockKeyhole, PackageCheck, ReceiptText, ShieldCheck, ShoppingCart, Store, UtensilsCrossed, Warehouse } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export function MarketingHeader() {
  return <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/92 backdrop-blur-xl"><div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-5 sm:px-6 lg:px-10"><Link href="/" className="flex items-center gap-2.5" aria-label="MunshiOS home"><span className="grid size-9 place-items-center rounded-[11px] bg-emerald-600 text-sm font-black text-white">M</span><span className="text-lg font-bold tracking-[-0.03em] text-[#0b1720]">MunshiOS</span></Link><nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 lg:flex">{[["Product","/product"],["Solutions","/#solutions"],["Pricing","/pricing"],["Security","/security"]].map(([label,href]) => <Link key={label} href={href} className="transition hover:text-emerald-700">{label}</Link>)}</nav><div className="flex items-center gap-2"><Link href="/sign-in" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Login</Link><Link href="/sign-up" className="hidden rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 sm:inline-flex">Sign up</Link></div></div></header>;
}

export function MarketingFooter() {
  const cols = [
    ["Product",[["Overview","/product"],["Pricing","/pricing"],["Security","/security"]]],
    ["Solutions",[["Wholesale","/industries/wholesale"],["Restaurant","/industries/restaurant"],["Retail","/industries/retail"],["Manufacturing","/industries/manufacturing"]]],
    ["Account",[["Login","/sign-in"],["Sign up","/sign-up"]]],
  ] as const;
  return <footer className="bg-[#071821] text-white"><div className="mx-auto grid max-w-[1320px] gap-10 px-5 py-14 sm:px-6 md:grid-cols-[1.3fr_.7fr_.7fr_.7fr] lg:px-10"><div><p className="text-lg font-bold">MunshiOS</p><p className="mt-3 max-w-sm text-sm leading-6 text-slate-400">Business software built for Pakistani operators who need sales, stock, khata, accounting and industry workflows to stay connected.</p></div>{cols.map(([title,items]) => <div key={title}><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-400">{title}</p><div className="mt-4 space-y-3">{items.map(([label,href]) => <Link key={label} href={href} className="block text-sm text-slate-400 hover:text-white">{label}</Link>)}</div></div>)}</div><div className="mx-auto max-w-[1320px] border-t border-white/10 px-5 py-5 text-xs text-slate-500 sm:px-6 lg:px-10">© 2026 MunshiOS</div></footer>;
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-800">{children}</div>;
}

export function PageHero({ eyebrow, title, body, visual, primaryLabel = "Sign up", primaryHref = "/sign-up" }: { eyebrow: string; title: React.ReactNode; body: string; visual: React.ReactNode; primaryLabel?: string; primaryHref?: string }) {
  return <section className="border-b border-slate-200 bg-white"><div className="mx-auto grid max-w-[1400px] gap-12 px-5 py-14 sm:px-6 lg:grid-cols-[.85fr_1.15fr] lg:items-center lg:px-10 lg:py-20"><div className="max-w-xl"><Eyebrow>{eyebrow}</Eyebrow><h1 className="mt-6 text-4xl font-semibold leading-[1.02] tracking-[-0.05em] text-[#0b1720] sm:text-6xl">{title}</h1><p className="mt-6 text-base leading-8 text-slate-600 sm:text-lg">{body}</p><div className="mt-8 flex flex-col gap-3 sm:flex-row"><Link href={primaryHref} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700">{primaryLabel}<ArrowRight className="size-4" /></Link><Link href="/sign-in" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50">Login</Link></div></div>{visual}</div></section>;
}

export function SectionTitle({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return <div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">{eyebrow}</p><h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[#0b1720] sm:text-5xl">{title}</h2>{body && <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">{body}</p>}</div>;
}

export function FeatureGrid({ items, columns = 3 }: { items: readonly { icon: LucideIcon; title: string; text: string }[]; columns?: 3 | 4 }) {
  return <div className={`mt-10 grid gap-4 sm:grid-cols-2 ${columns === 4 ? "xl:grid-cols-4" : "lg:grid-cols-3"}`}>{items.map(({icon: Icon,title,text}, index) => <article key={title} className="group overflow-hidden rounded-[24px] border border-slate-200 bg-white transition hover:-translate-y-1 hover:border-emerald-200 hover:shadow-[0_24px_65px_-42px_rgba(15,23,42,.35)]">
    <div className="relative h-28 overflow-hidden border-b border-slate-100 bg-[#f6f9f7] p-4">
      <div className="absolute right-4 top-4 grid size-8 place-items-center rounded-lg border border-emerald-100 bg-white text-emerald-700"><Icon className="size-4" /></div>
      {index % 3 === 0 ? <div className="mt-8 space-y-2"><div className="h-2 w-[76%] rounded-full bg-slate-200"><div className="h-full w-[68%] rounded-full bg-emerald-500" /></div><div className="h-2 w-[58%] rounded-full bg-slate-200"><div className="h-full w-[42%] rounded-full bg-emerald-300" /></div><div className="h-2 w-[84%] rounded-full bg-slate-200"><div className="h-full w-[75%] rounded-full bg-slate-300" /></div></div> : index % 3 === 1 ? <div className="mt-7 grid grid-cols-3 gap-2">{[72,48,84].map((v,i)=><div key={i} className="flex h-14 items-end rounded-lg border border-slate-200 bg-white p-2"><div className="w-full rounded-sm bg-emerald-400/80" style={{height:`${v}%`}} /></div>)}</div> : <div className="mt-7 rounded-xl border border-slate-200 bg-white p-2">{[0,1,2].map(i=><div key={i} className="flex items-center justify-between border-b border-slate-100 py-1.5 last:border-0"><span className="h-1.5 w-16 rounded-full bg-slate-200"/><span className={`h-1.5 rounded-full ${i===1?"w-10 bg-emerald-400":"w-7 bg-slate-300"}`}/></div>)}</div>}
    </div>
    <div className="p-5"><h3 className="font-bold text-slate-950">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p></div>
  </article>)}</div>;
}

export function AppPreview({ title, stats, rows, dark = false }: { title: string; stats: readonly [string,string,string][]; rows: readonly [string,string,string][]; dark?: boolean }) {
  return <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_30px_85px_-50px_rgba(15,23,42,.45)]"><div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div className="flex gap-2">{[0,1,2].map(i => <span key={i} className="size-2 rounded-full bg-slate-200" />)}</div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">{title}</span></div><div className={dark ? "bg-[#071821] p-5" : "bg-[#f7faf9] p-5"}><div className="grid gap-2 sm:grid-cols-3">{stats.map(([label,value,detail]) => <div key={label} className={`rounded-2xl border p-4 ${dark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"}`}><p className={`text-[10px] ${dark ? "text-slate-400" : "text-slate-500"}`}>{label}</p><p className={`mt-1 text-lg font-bold ${dark ? "text-white" : "text-slate-950"}`}>{value}</p><p className={`mt-1 text-[9px] ${dark ? "text-emerald-300" : "text-emerald-700"}`}>{detail}</p></div>)}</div><div className={`mt-3 overflow-hidden rounded-2xl border ${dark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"}`}>{rows.map(([a,b,c]) => <div key={a+b} className={`grid grid-cols-[.8fr_1fr_1.2fr] gap-3 border-b px-4 py-3 text-[10px] last:border-b-0 ${dark ? "border-white/10 text-slate-300" : "border-slate-100 text-slate-600"}`}><span className="font-bold text-emerald-600">{a}</span><span>{b}</span><span>{c}</span></div>)}</div></div></div>;
}

export function CTA({ title = "Give your business its own Munshi." }: { title?: string }) {
  return <section className="bg-[#071821] px-5 py-16 text-center text-white sm:px-6 sm:py-20"><h2 className="mx-auto max-w-3xl text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">{title}</h2><p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-slate-400">Create your workspace, choose your business type, and start with a 30-day trial.</p><div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row"><Link href="/sign-up" className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-[#06151d]">Sign up</Link><Link href="/sign-in" className="rounded-xl border border-white/15 px-5 py-3 text-sm font-bold text-white">Login</Link></div></section>;
}

export const marketingIcons = { BarChart3, Boxes, Check, CircleDollarSign, Factory, LayoutDashboard, LockKeyhole, PackageCheck, ReceiptText, ShieldCheck, ShoppingCart, Store, UtensilsCrossed, Warehouse };
