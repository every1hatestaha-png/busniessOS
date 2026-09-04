"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { ArrowRight, FileText, Search } from "lucide-react";

import { StatusBadge } from "@/components/business/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatPKR } from "@/lib/utils";

const statuses = ["ALL", "DRAFT", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"] as const;
type Purchase = { id: string; orderNumber: string; supplierName: string; date: string; status: Exclude<(typeof statuses)[number], "ALL">; items: number; grnCount: number; total: number; paid: number; balance: number };

export function PurchaseList({ purchases }: { purchases: Purchase[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof statuses)[number]>("ALL");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const rows = purchases.filter((purchase) => (!deferredQuery || `${purchase.orderNumber} ${purchase.supplierName}`.toLowerCase().includes(deferredQuery)) && (status === "ALL" || purchase.status === status));

  return <Card className="gap-0 rounded-md border py-0 shadow-none ring-0"><CardContent className="p-0">
    <div className="flex items-center justify-between gap-3 border-b p-3">
      <div className="relative w-full max-w-xs"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search PO or supplier" aria-label="Search purchases" className="pl-8" /></div>
      <div className="flex gap-1" aria-label="Filter purchases by status">{statuses.map((option) => <button key={option} type="button" onClick={() => setStatus(option)} className={`h-7 rounded px-2.5 text-[11px] font-medium ${status === option ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}>{option === "ALL" ? "All" : option.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}</button>)}</div>
    </div>
    {rows.length ? <Table><TableHeader><TableRow className="h-9 bg-slate-50/80 hover:bg-slate-50/80"><TableHead className="h-9 pl-4 text-[11px] uppercase tracking-wide text-slate-500">PO No</TableHead><TableHead className="h-9 text-[11px] uppercase tracking-wide text-slate-500">Date</TableHead><TableHead className="h-9 text-[11px] uppercase tracking-wide text-slate-500">Supplier</TableHead><TableHead className="h-9 text-[11px] uppercase tracking-wide text-slate-500">Status</TableHead><TableHead className="h-9 text-right text-[11px] uppercase tracking-wide text-slate-500">Lines / GRNs</TableHead><TableHead className="h-9 text-right text-[11px] uppercase tracking-wide text-slate-500">Ordered value</TableHead><TableHead className="h-9 text-right text-[11px] uppercase tracking-wide text-slate-500">Paid</TableHead><TableHead className="h-9 text-right text-[11px] uppercase tracking-wide text-slate-500">Payable</TableHead><TableHead className="h-9 pr-4 text-right text-[11px] uppercase tracking-wide text-slate-500">Action</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id} className="h-11"><TableCell className="py-1.5 pl-4"><Link href={`/purchases/${row.id}`} className="font-mono text-xs font-semibold hover:text-blue-700 hover:underline">{row.orderNumber}</Link></TableCell><TableCell className="py-1.5 text-xs text-slate-600">{formatDate(row.date)}</TableCell><TableCell className="py-1.5 text-xs font-medium">{row.supplierName}</TableCell><TableCell className="py-1.5"><StatusBadge status={row.status} /></TableCell><TableCell className="py-1.5 text-right text-xs text-slate-600">{row.items} / {row.grnCount}</TableCell><TableCell className="py-1.5 text-right text-xs font-medium tabular-nums">{formatPKR(row.total)}</TableCell><TableCell className="py-1.5 text-right text-xs text-slate-600 tabular-nums">{formatPKR(row.paid)}</TableCell><TableCell className="py-1.5 text-right text-xs font-semibold tabular-nums">{formatPKR(row.balance)}</TableCell><TableCell className="py-1.5 pr-4 text-right"><Link href={`/purchases/${row.id}`} aria-label={`View ${row.orderNumber}`} className="inline-flex size-7 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900"><ArrowRight className="size-3.5" /></Link></TableCell></TableRow>)}</TableBody></Table> : <div className="flex min-h-56 flex-col items-center justify-center text-center"><span className="rounded-md border bg-slate-50 p-2 text-slate-500"><FileText className="size-4" /></span><p className="mt-3 text-sm font-semibold">No purchase orders found</p><p className="mt-1 text-xs text-slate-500">Try a different search or status.</p></div>}
  </CardContent></Card>;
}
