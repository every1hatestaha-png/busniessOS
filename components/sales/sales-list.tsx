"use client";

import { useDeferredValue, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search, ShoppingCart } from "lucide-react";
import { formatDate, formatPKR } from "@/lib/utils";
import { StatusBadge } from "@/components/business/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const statuses = ["ALL", "DRAFT", "CONFIRMED", "PROCESSING", "COMPLETED", "CANCELLED"] as const;

export type SaleListItem = {
  id: string;
  orderNumber: string;
  customerName: string;
  date: string;
  items: number;
  total: number;
  paidAmount: number;
  balanceAmount: number;
  status: Exclude<(typeof statuses)[number], "ALL">;
};

export function SalesList({ sales }: { sales: SaleListItem[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof statuses)[number]>("ALL");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const filteredSales = sales.filter((sale) => {
    const matchesQuery = !deferredQuery || `${sale.orderNumber} ${sale.customerName}`.toLowerCase().includes(deferredQuery);
    return matchesQuery && (status === "ALL" || sale.status === status);
  });
  const total = filteredSales.reduce((sum, sale) => sum + sale.total, 0);
  const balance = filteredSales.reduce((sum, sale) => sum + sale.balanceAmount, 0);

  return (
    <div className="space-y-3">
      <div className="grid overflow-hidden rounded-md border bg-white sm:grid-cols-3 sm:divide-x">
        <SummaryMetric label="Orders shown" value={String(filteredSales.length)} />
        <SummaryMetric label="Sales value" value={formatPKR(total)} />
        <SummaryMetric label="Balance due" value={formatPKR(balance)} attention={balance > 0} />
      </div>

      <Card className="gap-0 rounded-md border py-0 shadow-none ring-0">
        <CardContent className="p-0">
          <div className="flex items-center justify-between gap-3 border-b p-3">
            <div className="relative w-full max-w-xs"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sale or customer" aria-label="Search sales" className="pl-8" /></div>
            <div className="flex gap-1" aria-label="Filter by status">
              {statuses.map((option) => <button key={option} type="button" onClick={() => setStatus(option)} className={`h-7 shrink-0 rounded px-2.5 text-[11px] font-medium transition-colors ${status === option ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}>{option === "ALL" ? "All" : option.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}</button>)}
            </div>
          </div>

          {filteredSales.length ? (
            <Table>
              <TableHeader><TableRow className="h-9 bg-slate-50/80 hover:bg-slate-50/80"><TableHead className="h-9 pl-4 text-[11px] uppercase tracking-wide text-slate-500">Sale No</TableHead><TableHead className="h-9 text-[11px] uppercase tracking-wide text-slate-500">Date</TableHead><TableHead className="h-9 text-[11px] uppercase tracking-wide text-slate-500">Customer</TableHead><TableHead className="h-9 text-[11px] uppercase tracking-wide text-slate-500">Status</TableHead><TableHead className="h-9 text-right text-[11px] uppercase tracking-wide text-slate-500">Total</TableHead><TableHead className="h-9 text-right text-[11px] uppercase tracking-wide text-slate-500">Paid</TableHead><TableHead className="h-9 text-right text-[11px] uppercase tracking-wide text-slate-500">Balance</TableHead><TableHead className="h-9 pr-4 text-right text-[11px] uppercase tracking-wide text-slate-500">Action</TableHead></TableRow></TableHeader>
              <TableBody>{filteredSales.map((sale) => <TableRow key={sale.id} className="h-11"><TableCell className="py-1.5 pl-4"><Link href={`/sales/${sale.id}`} className="font-mono text-xs font-semibold text-slate-900 hover:text-blue-700 hover:underline">{sale.orderNumber}</Link><p className="text-[10px] text-slate-500">{sale.items} line{sale.items === 1 ? "" : "s"}</p></TableCell><TableCell className="py-1.5 text-xs text-slate-600">{formatDate(sale.date)}</TableCell><TableCell className="py-1.5 text-xs font-medium text-slate-800">{sale.customerName}</TableCell><TableCell className="py-1.5"><StatusBadge status={sale.status} /></TableCell><TableCell className="py-1.5 text-right text-xs font-medium tabular-nums">{formatPKR(sale.total)}</TableCell><TableCell className="py-1.5 text-right text-xs text-slate-600 tabular-nums">{formatPKR(sale.paidAmount)}</TableCell><TableCell className="py-1.5 text-right text-xs font-semibold tabular-nums">{formatPKR(sale.balanceAmount)}</TableCell><TableCell className="py-1.5 pr-4 text-right"><Link href={`/sales/${sale.id}`} aria-label={`View ${sale.orderNumber}`} className="inline-flex size-7 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900"><ArrowRight className="size-3.5" /></Link></TableCell></TableRow>)}</TableBody>
            </Table>
          ) : (
            <div className="flex min-h-56 flex-col items-center justify-center text-center"><span className="rounded-md border bg-slate-50 p-2 text-slate-500"><ShoppingCart className="size-4" /></span><p className="mt-3 text-sm font-semibold">No sales orders found</p><p className="mt-1 text-xs text-slate-500">Try a different search or status.</p></div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryMetric({ label, value, attention = false }: { label: string; value: string; attention?: boolean }) {
  return <div className="px-4 py-3"><p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-1 text-lg font-semibold tracking-tight tabular-nums ${attention ? "text-amber-700" : "text-slate-950"}`}>{value}</p></div>;
}
