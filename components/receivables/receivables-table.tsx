"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ReceivablesAgingReport, ReceivablesBucket } from "@/lib/server/receivables";
import { formatDate, formatPKR } from "@/lib/utils";

const BUCKETS: ReceivablesBucket[] = ["1-30", "31-60", "61-90", "90+"];

export function ReceivablesTable({ report }: { report: ReceivablesAgingReport }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setExpanded((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <Table className="min-w-[980px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead>Customer</TableHead>
            <TableHead className="text-right">Outstanding</TableHead>
            <TableHead className="text-right">Unapplied Credit</TableHead>
            {BUCKETS.map((bucket) => <TableHead key={bucket} className="text-right">{bucket}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.customers.map((customer) => {
            const isOpen = expanded.has(customer.customerId);
            return (
              <Fragment key={customer.customerId}>
                <TableRow className="cursor-pointer" onClick={() => toggle(customer.customerId)}>
                  <TableCell>{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                  <TableCell className="font-medium"><Link href={`/customers/${customer.customerId}`} className="hover:underline">{customer.customerName}</Link></TableCell>
                  <TableCell className="text-right font-semibold">{formatPKR(customer.totalOutstanding)}</TableCell>
                  <TableCell className="text-right">{formatPKR(customer.unappliedCredit)}</TableCell>
                  {BUCKETS.map((bucket) => <TableCell key={bucket} className="text-right tabular-nums">{formatPKR(customer.buckets[bucket])}</TableCell>)}
                </TableRow>
                {isOpen && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={8} className="bg-neutral-50 p-0">
                      <div className="px-6 py-4">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Invoice</TableHead>
                              <TableHead>Invoice Date</TableHead>
                              <TableHead>Due Date</TableHead>
                              <TableHead className="text-right">Original</TableHead>
                              <TableHead className="text-right">Payments</TableHead>
                              <TableHead className="text-right">Credits</TableHead>
                              <TableHead className="text-right">Outstanding</TableHead>
                              <TableHead>Bucket</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {customer.items.map((item) => (
                              <TableRow key={item.invoiceId}>
                                <TableCell className="font-mono text-xs">{item.documentNumber}</TableCell>
                                <TableCell>{formatDate(item.invoiceDate)}</TableCell>
                                <TableCell>{item.dueDate ? formatDate(item.dueDate) : "-"}</TableCell>
                                <TableCell className="text-right">{formatPKR(item.originalAmount)}</TableCell>
                                <TableCell className="text-right">{formatPKR(item.paymentsApplied)}</TableCell>
                                <TableCell className="text-right">{formatPKR(item.creditsApplied)}</TableCell>
                                <TableCell className="text-right font-semibold">{formatPKR(item.outstandingAmount)}</TableCell>
                                <TableCell>{item.bucket === "current" ? "Current" : item.bucket}</TableCell>
                              </TableRow>
                            ))}
                            {!customer.items.length && <TableRow><TableCell colSpan={8} className="text-center text-neutral-500">No outstanding invoices.</TableCell></TableRow>}
                          </TableBody>
                        </Table>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
          {!report.customers.length && <TableRow><TableCell colSpan={8} className="h-32 text-center text-neutral-500">No outstanding receivables.</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  );
}
