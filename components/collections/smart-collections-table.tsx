"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BookOpenText, Check, Copy, MessageCircle, PhoneOff, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildCollectionMessage, buildWhatsAppUrl, type CollectionLanguage, type CollectionStatus, type SmartCollectionRow } from "@/lib/smart-collections";
import { cn, formatPKR } from "@/lib/utils";

const statusMeta: Record<CollectionStatus, { label: string; className: string }> = {
  CRITICAL: { label: "30+ days late", className: "border-red-200 bg-red-50 text-red-700" },
  OVERDUE: { label: "Overdue", className: "border-amber-200 bg-amber-50 text-amber-800" },
  DUE: { label: "Due now", className: "border-blue-200 bg-blue-50 text-blue-700" },
  CURRENT: { label: "Within terms", className: "border-slate-200 bg-slate-50 text-slate-600" },
  REVIEW: { label: "Review", className: "border-violet-200 bg-violet-50 text-violet-700" },
};

function StatusPill({ status }: { status: CollectionStatus }) {
  const meta = statusMeta[status];
  return <span className={cn("inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide", meta.className)}>{meta.label}</span>;
}

export function SmartCollectionsTable({ rows, workspaceName }: { rows: SmartCollectionRow[]; workspaceName: string }) {
  const [language, setLanguage] = useState<CollectionLanguage>("roman-urdu");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const visibleRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (!showAll && !row.needsContact) return false;
      if (!term) return true;
      return row.customerName.toLowerCase().includes(term) || row.phone.toLowerCase().includes(term) || row.pendingReferences.some((reference) => reference.toLowerCase().includes(term));
    });
  }, [query, rows, showAll]);

  async function copyReminder(row: SmartCollectionRow) {
    try {
      await navigator.clipboard.writeText(buildCollectionMessage(row, workspaceName, language));
      setCopiedId(row.customerId);
      window.setTimeout(() => setCopiedId((current) => current === row.customerId ? null : current), 1800);
    } catch {
      setCopiedId(null);
    }
  }

  function openWhatsApp(row: SmartCollectionRow) {
    const url = buildWhatsAppUrl(row, workspaceName, language);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Collection queue</h2>
          <p className="mt-0.5 text-xs text-slate-500">Exact balances come from the customer account. WhatsApp opens with a prepared reminder; MunshiOS does not send anything automatically.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 sm:flex-none">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Customer, phone or invoice..." className="h-8 pl-8 text-xs" />
          </div>
          <select value={language} onChange={(event) => setLanguage(event.target.value as CollectionLanguage)} className="h-8 rounded-md border bg-white px-2.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-primary/20" aria-label="Reminder language">
            <option value="roman-urdu">Roman Urdu</option>
            <option value="english">English</option>
          </select>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowAll((value) => !value)}>{showAll ? "Attention only" : "Show all open"}</Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
              <TableHead className="pl-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Customer</TableHead>
              <TableHead className="text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">Outstanding</TableHead>
              <TableHead className="text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">Age / terms</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Priority</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Pending refs</TableHead>
              <TableHead className="pr-4 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((row) => (
              <TableRow key={row.customerId} className="align-middle">
                <TableCell className="pl-4">
                  <Link href={`/customers/${row.customerId}`} className="text-sm font-semibold text-slate-900 hover:text-primary hover:underline">{row.customerName}</Link>
                  <p className="mt-0.5 text-[11px] text-slate-500">{row.phone || "No phone saved"}</p>
                </TableCell>
                <TableCell className="text-right text-sm font-semibold tabular-nums text-slate-900">{formatPKR(row.currentBalance)}</TableCell>
                <TableCell className="text-center">
                  <p className="text-xs font-medium text-slate-700">{row.oldestAgeDays === null ? "Needs review" : `${row.oldestAgeDays} days old`}</p>
                  <p className="text-[10px] text-slate-500">Terms: {row.creditDays} days{row.daysPastTerms && row.daysPastTerms > 0 ? ` · ${row.daysPastTerms} late` : ""}</p>
                </TableCell>
                <TableCell><StatusPill status={row.status} /></TableCell>
                <TableCell>
                  {row.pendingReferences.length ? <p className="max-w-[260px] truncate text-xs text-slate-600" title={row.pendingReferences.join(", ")}>{row.pendingReferences.join(", ")}</p> : <span className="text-xs text-slate-400">Account balance</span>}
                </TableCell>
                <TableCell className="pr-4">
                  <div className="flex justify-end gap-1.5">
                    <Button type="button" variant="outline" size="sm" onClick={() => void copyReminder(row)} title="Copy prepared reminder">
                      {copiedId === row.customerId ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                      {copiedId === row.customerId ? "Copied" : "Copy"}
                    </Button>
                    {row.whatsappPhone ? (
                      <Button type="button" size="sm" onClick={() => openWhatsApp(row)} className="bg-emerald-600 text-white hover:bg-emerald-700">
                        <MessageCircle className="size-3.5" />WhatsApp
                      </Button>
                    ) : (
                      <Link href={`/customers/${row.customerId}/edit`} className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                        <PhoneOff className="size-3.5" />Add phone
                      </Link>
                    )}
                    <Link href={`/reports/customer-statement?partyId=${row.customerId}&from=2000-01-01`} className="inline-flex size-8 items-center justify-center rounded-md border text-slate-500 hover:bg-slate-50" title="Open full ledger" aria-label={`Open ${row.customerName} ledger`}><BookOpenText className="size-3.5" /></Link>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!visibleRows.length && <TableRow><TableCell colSpan={6} className="h-36 text-center text-sm text-slate-500">{rows.length ? "No customers match this view." : "No customer receivables are open."}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
