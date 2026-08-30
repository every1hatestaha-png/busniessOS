import Link from "next/link";
import { Search } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ReceivablesAgingReport, ReceivablesBucket } from "@/lib/server/receivables";
import { cn, formatDate, formatPKR } from "@/lib/utils";

const BUCKETS: Array<ReceivablesBucket | "current"> = ["current", "1-30", "31-45", "46-60", "61+"];

type Filters = { search: string; customerId: string; bucket: string; asOf: string };

export function ReceivablesTable({ report, customers, filters }: { report: ReceivablesAgingReport; customers: Array<{ id: string; name: string }>; filters: Filters }) {
  const items = report.customers.flatMap((customer) => customer.items);

  return (
    <div className="space-y-3">
      <form method="get" className="grid gap-2 rounded-xl border bg-white p-3 sm:grid-cols-2 lg:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_140px_150px_auto] print:hidden">
        <label className="relative">
          <span className="sr-only">Search receivables</span>
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input name="search" defaultValue={filters.search} placeholder="Customer or invoice" className="h-8 w-full rounded-lg border border-neutral-200 bg-white pl-8 pr-3 text-sm outline-none focus:border-neutral-400" />
        </label>
        <label>
          <span className="sr-only">Customer</span>
          <select name="customerId" defaultValue={filters.customerId} className="h-8 w-full rounded-lg border border-neutral-200 bg-white px-2 text-sm">
            <option value="">All customers</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Age bucket</span>
          <select name="bucket" defaultValue={filters.bucket} className="h-8 w-full rounded-lg border border-neutral-200 bg-white px-2 text-sm">
            <option value="">All buckets</option>
            {BUCKETS.map((bucket) => <option key={bucket} value={bucket}>{bucket === "current" ? "Current" : bucket}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="shrink-0 text-xs font-medium text-neutral-500">As of</span>
          <input type="date" name="asOf" defaultValue={filters.asOf} className="h-8 min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-2 text-sm" />
        </label>
        <div className="flex gap-2">
          <button type="submit" className={buttonVariants({ size: "sm" })}>Apply</button>
          <Link href="/receivables" className={buttonVariants({ variant: "outline", size: "sm" })}>Clear</Link>
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border bg-white">
        <Table className="min-w-[1180px] text-xs print:min-w-0 print:text-[9px] print:[&_td]:px-1 print:[&_th]:px-1">
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Invoice</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Original</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Credits</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
              <TableHead className="text-right">Age</TableHead>
              <TableHead>Bucket</TableHead>
              <TableHead className="text-right print:hidden">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.invoiceId}>
                <TableCell className="font-medium"><Link href={`/customers/${item.customerId}`} className="hover:underline">{item.customerName}</Link></TableCell>
                <TableCell className="font-mono"><Link href={`/invoices/${item.invoiceId}`} className="hover:underline">{item.documentNumber}</Link></TableCell>
                <TableCell>{formatDate(item.invoiceDate)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatPKR(item.originalAmount)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatPKR(item.paymentsApplied)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatPKR(item.creditsApplied)}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{formatPKR(item.outstandingAmount)}</TableCell>
                <TableCell className="text-right tabular-nums">{item.ageDays}</TableCell>
                <TableCell>{item.bucket === "current" ? "Current" : item.bucket}</TableCell>
                <TableCell className="text-right print:hidden"><Link href={`/invoices/${item.invoiceId}`} className={cn(buttonVariants({ size: "xs" }), "whitespace-nowrap")}>Record Payment</Link></TableCell>
              </TableRow>
            ))}
            {!items.length && <TableRow><TableCell colSpan={10} className="h-32 text-center text-neutral-500">No outstanding receivables match these filters.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
