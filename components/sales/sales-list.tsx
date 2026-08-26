"use client";

import { useDeferredValue, useState } from "react";
import Link from "next/link";
import { Search, ShoppingCart } from "lucide-react";
import type { Sale } from "@/lib/demo-data";
import { formatDate, formatPKR } from "@/lib/utils";
import { StatusBadge } from "@/components/business/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const statuses = ["ALL", "DRAFT", "CONFIRMED", "PROCESSING", "COMPLETED", "CANCELLED"] as const;

export function SalesList({ sales }: { sales: Sale[] }) {
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
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card size="sm" className="shadow-none"><CardContent><p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Orders shown</p><p className="mt-1 text-2xl font-bold">{filteredSales.length}</p></CardContent></Card>
        <Card size="sm" className="shadow-none"><CardContent><p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Sales value</p><p className="mt-1 text-2xl font-bold">{formatPKR(total)}</p></CardContent></Card>
        <Card size="sm" className="shadow-none"><CardContent><p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Balance due</p><p className="mt-1 text-2xl font-bold">{formatPKR(balance)}</p></CardContent></Card>
      </div>

      <Card className="shadow-none">
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order or customer" aria-label="Search sales" className="h-9 pl-9" /></div>
            <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0" aria-label="Filter by status">
              {statuses.map((option) => <button key={option} type="button" onClick={() => setStatus(option)} className={`h-8 shrink-0 rounded-lg px-3 text-xs font-semibold transition ${status === option ? "bg-neutral-950 text-white" : "border bg-white text-neutral-600 hover:bg-neutral-50"}`}>{option === "ALL" ? "All orders" : option.charAt(0) + option.slice(1).toLowerCase()}</button>)}
            </div>
          </div>

          {filteredSales.length ? (
            <Table>
              <TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Customer</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Balance</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
              <TableBody>{filteredSales.map((sale) => <TableRow key={sale.id}><TableCell><Link href={`/sales/${sale.id}`} className="font-semibold text-neutral-950 hover:underline">{sale.orderNumber}</Link><p className="text-xs text-neutral-500">{sale.items.length} line{sale.items.length === 1 ? "" : "s"}</p></TableCell><TableCell className="font-medium">{sale.customerName}</TableCell><TableCell className="text-neutral-600">{formatDate(sale.date)}</TableCell><TableCell><StatusBadge status={sale.status} /></TableCell><TableCell className="text-right text-neutral-600">{formatPKR(sale.paidAmount)}</TableCell><TableCell className="text-right text-neutral-600">{formatPKR(sale.balanceAmount)}</TableCell><TableCell className="text-right font-semibold">{formatPKR(sale.total)}</TableCell></TableRow>)}</TableBody>
            </Table>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center text-center"><span className="rounded-full bg-neutral-100 p-3 text-neutral-500"><ShoppingCart className="h-5 w-5" /></span><p className="mt-3 font-semibold">No sales orders found</p><p className="mt-1 text-sm text-neutral-500">Try a different search or status.</p></div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
