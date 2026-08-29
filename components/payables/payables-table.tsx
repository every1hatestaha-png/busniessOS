"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import type { PayablesAgingReport, PayablesBucket } from "@/lib/server/payables";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatPKR } from "@/lib/utils";

const BUCKETS: PayablesBucket[] = ["1-30", "31-45", "46-60", "61+"];

type DetailRow = {
  purchaseId: string;
  documentNumber: string;
  purchaseDate: string;
  originalAmount: number;
  outstandingAmount: number;
  ageDays: number;
  bucket: PayablesBucket | "current";
  dueDate: string | null;
};

export function PayablesTable({ report }: { report: PayablesAgingReport }) {
  const [query, setQuery] = useState("");
  const [bucket, setBucket] = useState<"all" | PayablesBucket>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const queryLower = query.trim().toLowerCase();

  const suppliers = useMemo(() => {
    return report.suppliers
      .filter((supplier) => !queryLower || supplier.supplierName.toLowerCase().includes(queryLower))
      .filter((supplier) => bucket === "all" || supplier.buckets[bucket] > 0);
  }, [report.suppliers, queryLower, bucket]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search supplier"
            className="h-8 w-full rounded-lg border border-neutral-200 bg-white pl-8 pr-3 text-sm outline-none focus:border-neutral-400"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["all", ...BUCKETS] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setBucket(option as "all" | PayablesBucket)}
              className={`h-7 rounded-md border px-2.5 text-xs font-medium transition-colors ${
                bucket === option
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              {option === "all" ? "All" : option}
            </button>
          ))}
        </div>
      </div>

      <Card className="gap-0 py-0 shadow-none">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Total Outstanding</TableHead>
                <TableHead className="text-right">1–30</TableHead>
                <TableHead className="text-right">31–45</TableHead>
                <TableHead className="text-right">46–60</TableHead>
                <TableHead className="text-right">61+</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((supplier) => {
                const isOpen = expanded.has(supplier.supplierId);
                return (
                  <ExpandedRow
                    key={supplier.supplierId}
                    isOpen={isOpen}
                    onToggle={() => toggle(supplier.supplierId)}
                    supplierName={supplier.supplierName}
                    total={supplier.totalOutstanding}
                    buckets={supplier.buckets}
                    items={supplier.items}
                  />
                );
              })}
              {!suppliers.length && (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-neutral-500">
                    No outstanding payables match.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function ExpandedRow({
  isOpen,
  onToggle,
  supplierName,
  total,
  buckets,
  items,
}: {
  isOpen: boolean;
  onToggle: () => void;
  supplierName: string;
  total: number;
  buckets: Record<PayablesBucket, number>;
  items: DetailRow[];
}) {
  return (
    <>
      <TableRow onClick={onToggle} className="cursor-pointer">
        <TableCell>
          <button type="button" onClick={onToggle} className="text-neutral-400" aria-label={`Toggle ${supplierName}`}>
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </TableCell>
        <TableCell className="font-medium">{supplierName}</TableCell>
        <TableCell className="text-right font-semibold">{formatPKR(total)}</TableCell>
        {BUCKETS.map((bucket) => (
          <TableCell key={bucket} className="text-right tabular-nums">
            {formatPKR(buckets[bucket])}
          </TableCell>
        ))}
      </TableRow>
      {isOpen && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={7} className="bg-neutral-50 p-0">
            <div className="px-6 py-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Voucher No</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Original Bill</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="text-right">Total Days</TableHead>
                    <TableHead>Bucket</TableHead>
                    <TableHead>Due Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.purchaseId}>
                      <TableCell className="font-mono text-xs">{item.documentNumber}</TableCell>
                      <TableCell>{formatDate(item.purchaseDate)}</TableCell>
                      <TableCell className="text-right">{formatPKR(item.originalAmount)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatPKR(item.outstandingAmount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{item.ageDays}</TableCell>
                      <TableCell>{item.bucket === "current" ? "Current" : item.bucket}</TableCell>
                      <TableCell>{item.dueDate ? formatDate(item.dueDate) : "—"}</TableCell>
                    </TableRow>
                  ))}
                  {!items.length && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-neutral-500">
                        No bills.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
