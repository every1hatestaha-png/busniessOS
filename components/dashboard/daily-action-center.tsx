import Link from "next/link";
import { AlertTriangle, ArrowRight, Banknote, CalendarCheck2, CircleCheckBig, PackageSearch, ReceiptText, Sparkles } from "lucide-react";

import type { DailyActionCenter as DailyActionCenterData, DailyActionItem } from "@/lib/server/daily-action-center";
import { cn, formatPKR } from "@/lib/utils";

const toneMeta: Record<DailyActionItem["tone"], { iconClass: string; cardClass: string }> = {
  danger: { iconClass: "bg-red-50 text-red-700", cardClass: "border-red-100 bg-red-50/20" },
  warning: { iconClass: "bg-amber-50 text-amber-700", cardClass: "border-amber-100 bg-amber-50/20" },
  info: { iconClass: "bg-blue-50 text-blue-700", cardClass: "border-blue-100 bg-blue-50/20" },
  neutral: { iconClass: "bg-slate-100 text-slate-600", cardClass: "border-slate-200 bg-white" },
};

function ActionIcon({ item }: { item: DailyActionItem }) {
  if (item.id.startsWith("promise")) return <CalendarCheck2 className="size-4" />;
  if (item.id === "collections") return <ReceiptText className="size-4" />;
  if (item.id.startsWith("stock")) return <PackageSearch className="size-4" />;
  if (item.id === "supplier-review") return <Banknote className="size-4" />;
  return <AlertTriangle className="size-4" />;
}

export function DailyActionCenter({ data, canViewFinancials }: { data: DailyActionCenterData; canViewFinancials: boolean }) {
  const priorityLabel = data.actionCount === 1 ? "1 priority for today" : `${data.actionCount} priorities for today`;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-premium" aria-labelledby="aaj-ka-munshi-title">
      <div className="flex flex-col gap-4 border-b bg-gradient-to-r from-emerald-50/70 via-white to-white px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700"><Sparkles className="size-3.5" />Aaj ka Munshi</div>
          <h2 id="aaj-ka-munshi-title" className="text-lg font-semibold tracking-tight text-slate-950">
            {data.actionCount ? priorityLabel : "No urgent work right now"}
          </h2>
          <p className="mt-1 text-xs text-slate-500">Only live items with configured thresholds, due promises, collections or aged balances appear here.</p>
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[520px]">
          <div className="rounded-lg border bg-white px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-slate-400">Today sales</p><p className="mt-1 truncate text-xs font-semibold tabular-nums text-slate-900">{formatPKR(data.todaySales)}</p></div>
          {canViewFinancials && <div className="rounded-lg border bg-white px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-slate-400">Received today</p><p className="mt-1 truncate text-xs font-semibold tabular-nums text-slate-900">{formatPKR(data.todayReceipts)}</p></div>}
          {canViewFinancials && <div className="rounded-lg border bg-white px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-slate-400">Collection queue</p><p className="mt-1 truncate text-xs font-semibold tabular-nums text-slate-900">{formatPKR(data.collectionAmount)}</p></div>}
          <div className="rounded-lg border bg-white px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-slate-400">Restock alerts</p><p className="mt-1 text-xs font-semibold text-slate-900">{data.lowStockCount ? `${data.lowStockCount} products` : "None"}</p></div>
        </div>
      </div>

      {data.items.length ? (
        <div className="grid gap-2 p-4 lg:grid-cols-2">
          {data.items.map((item) => {
            const meta = toneMeta[item.tone];
            return (
              <Link key={item.id} href={item.href} className={cn("group flex min-h-20 items-start gap-3 rounded-xl border p-3.5 transition hover:-translate-y-px hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30", meta.cardClass)}>
                <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", meta.iconClass)}><ActionIcon item={item} /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <span className="text-xs font-semibold leading-5 text-slate-900">{item.title}</span>
                    {item.amount !== undefined && <span className="text-xs font-semibold tabular-nums text-slate-900">{formatPKR(item.amount)}</span>}
                  </span>
                  <span className="mt-1 block text-[11px] leading-4 text-slate-500">{item.detail}</span>
                  <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">{item.actionLabel}<ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" /></span>
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="flex min-h-28 flex-col items-center justify-center px-6 text-center">
          <CircleCheckBig className="size-7 text-emerald-600" />
          <p className="mt-2 text-sm font-semibold text-slate-800">Everything looks clear.</p>
          <p className="mt-1 max-w-md text-xs text-slate-500">New collection follow-ups, configured restock alerts and due financial actions will appear here automatically.</p>
        </div>
      )}
    </section>
  );
}
