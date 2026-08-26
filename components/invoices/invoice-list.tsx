"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { Search } from "lucide-react";

import { StatusBadge } from "@/components/business/status-badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatPKR } from "@/lib/utils";

type Invoice = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  date: string;
  dueDate: string | null;
  total: number;
  balance: number;
  status: string;
  orderNumber: string;
};

export function InvoiceList({ invoices }: { invoices: Invoice[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const deferredQuery = useDeferredValue(query.toLowerCase().trim());
  const filtered = invoices.filter((invoice) =>
    `${invoice.invoiceNumber} ${invoice.customerName} ${invoice.orderNumber}`.toLowerCase().includes(deferredQuery)
    && (status === "ALL" || invoice.status === status),
  );

  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <CardHeader className="gap-3 border-b py-4 lg:flex lg:flex-row lg:items-center lg:justify-between">
        <div><h2 className="font-semibold">Invoice register</h2><p className="text-sm text-neutral-500">{filtered.length} of {invoices.length} invoices shown</p></div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative sm:w-72"><Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-neutral-400" /><Input className="pl-8" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Invoice, customer, order..." /><span className="sr-only">Search invoices</span></label>
          <select aria-label="Filter invoice status" value={status} onChange={(event) => setStatus(event.target.value)} className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"><option value="ALL">All statuses</option><option value="PAID">Paid</option><option value="PARTIALLY_PAID">Partially paid</option><option value="UNPAID">Unpaid</option><option value="OVERDUE">Overdue</option><option value="DRAFT">Draft</option><option value="CANCELLED">Cancelled</option></select>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <Table className="min-w-[760px]"><TableHeader className="bg-neutral-50/80"><TableRow><TableHead className="pl-4">Invoice</TableHead><TableHead>Customer</TableHead><TableHead>Issued</TableHead><TableHead>Due</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Balance</TableHead><TableHead className="pr-4">Status</TableHead></TableRow></TableHeader>
          <TableBody>{filtered.map((invoice) => <TableRow key={invoice.id}><TableCell className="pl-4"><Link href={`/invoices/${invoice.id}`} className="font-mono text-xs font-semibold hover:underline">{invoice.invoiceNumber}</Link><p className="mt-1 text-xs text-neutral-500">{invoice.orderNumber}</p></TableCell><TableCell className="font-medium">{invoice.customerName}</TableCell><TableCell className="text-neutral-600">{formatDate(invoice.date)}</TableCell><TableCell className="text-neutral-600">{invoice.dueDate ? formatDate(invoice.dueDate) : "-"}</TableCell><TableCell className="text-right tabular-nums">{formatPKR(invoice.total)}</TableCell><TableCell className="text-right font-semibold tabular-nums">{formatPKR(invoice.balance)}</TableCell><TableCell className="pr-4"><StatusBadge status={invoice.status} /></TableCell></TableRow>)}
            {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="h-32 text-center text-neutral-500">{invoices.length === 0 ? "No invoices have been issued yet." : "No invoices match these filters."}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
