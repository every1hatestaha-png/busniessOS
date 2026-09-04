"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { ArrowRight, PackageCheck, Search } from "lucide-react";

import { StatusBadge } from "@/components/business/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatPKR } from "@/lib/utils";

type Receipt = { id: string; grnNumber: string; receiptDate: string; status: string; supplierName: string; orderNumber: string; totalAmount: number; totalAccepted: number };

export function GoodsReceiptList({ receipts }: { receipts: Receipt[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | "ACTIVE" | "VOIDED">("ALL");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const rows = receipts.filter((receipt) => (!deferredQuery || `${receipt.grnNumber} ${receipt.orderNumber} ${receipt.supplierName}`.toLowerCase().includes(deferredQuery)) && (status === "ALL" || receipt.status === status));

  return <Card className="gap-0 rounded-md border py-0 shadow-none ring-0"><CardContent className="p-0">
    <div className="flex items-center justify-between gap-3 border-b p-3"><div className="relative w-full max-w-xs"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search GRN, PO or supplier" aria-label="Search goods receipts" className="pl-8" /></div><div className="flex gap-1" aria-label="Filter goods receipts by status">{(["ALL", "ACTIVE", "VOIDED"] as const).map((option) => <button key={option} type="button" onClick={() => setStatus(option)} className={`h-7 rounded px-2.5 text-[11px] font-medium ${status === option ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}>{option === "ALL" ? "All" : option.charAt(0) + option.slice(1).toLowerCase()}</button>)}</div></div>
    {rows.length ? <Table><TableHeader><TableRow className="h-9 bg-slate-50/80 hover:bg-slate-50/80"><TableHead className="h-9 pl-4 text-[11px] uppercase tracking-wide text-slate-500">GRN No</TableHead><TableHead className="h-9 text-[11px] uppercase tracking-wide text-slate-500">Date</TableHead><TableHead className="h-9 text-[11px] uppercase tracking-wide text-slate-500">PO No</TableHead><TableHead className="h-9 text-[11px] uppercase tracking-wide text-slate-500">Supplier</TableHead><TableHead className="h-9 text-[11px] uppercase tracking-wide text-slate-500">Status</TableHead><TableHead className="h-9 text-right text-[11px] uppercase tracking-wide text-slate-500">Accepted</TableHead><TableHead className="h-9 text-right text-[11px] uppercase tracking-wide text-slate-500">Accepted value</TableHead><TableHead className="h-9 pr-4 text-right text-[11px] uppercase tracking-wide text-slate-500">Action</TableHead></TableRow></TableHeader><TableBody>{rows.map((receipt) => <TableRow key={receipt.id} className="h-11"><TableCell className="py-1.5 pl-4"><Link href={`/goods-receipts/${receipt.id}`} className="font-mono text-xs font-semibold hover:text-blue-700 hover:underline">{receipt.grnNumber}</Link></TableCell><TableCell className="py-1.5 text-xs text-slate-600">{formatDate(receipt.receiptDate)}</TableCell><TableCell className="py-1.5 font-mono text-xs text-slate-600">{receipt.orderNumber}</TableCell><TableCell className="py-1.5 text-xs font-medium">{receipt.supplierName}</TableCell><TableCell className="py-1.5"><StatusBadge status={receipt.status} /></TableCell><TableCell className="py-1.5 text-right text-xs tabular-nums">{receipt.totalAccepted}</TableCell><TableCell className="py-1.5 text-right text-xs font-semibold tabular-nums">{formatPKR(receipt.totalAmount)}</TableCell><TableCell className="py-1.5 pr-4 text-right"><Link href={`/goods-receipts/${receipt.id}`} aria-label={`View ${receipt.grnNumber}`} className="inline-flex size-7 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900"><ArrowRight className="size-3.5" /></Link></TableCell></TableRow>)}</TableBody></Table> : <div className="flex min-h-56 flex-col items-center justify-center text-center"><span className="rounded-md border bg-slate-50 p-2 text-slate-500"><PackageCheck className="size-4" /></span><p className="mt-3 text-sm font-semibold">No goods receipts found</p><p className="mt-1 text-xs text-slate-500">Open a purchase order to receive remaining goods.</p></div>}
  </CardContent></Card>;
}
