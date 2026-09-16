"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BookOpenText, Check, Copy, MessageCircle, Phone, PhoneOff, RotateCcw, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  buildCollectionMessage,
  buildWhatsAppUrlForMessage,
  type CollectionLanguage,
  type CollectionPriority,
  type SmartCollectionRow,
} from "@/lib/smart-collections";
import { cn, formatPKR } from "@/lib/utils";

const priorityMeta: Record<CollectionPriority, { label: string; detail: string; className: string }> = {
  URGENT: { label: "Urgent", detail: "30+ days past terms", className: "border-red-200 bg-red-50 text-red-700" },
  HIGH: { label: "High", detail: "Past payment terms", className: "border-amber-200 bg-amber-50 text-amber-800" },
  NORMAL: { label: "Normal", detail: "Payment due", className: "border-blue-200 bg-blue-50 text-blue-700" },
  REVIEW: { label: "Review", detail: "Confirm balance timing", className: "border-violet-200 bg-violet-50 text-violet-700" },
  NONE: { label: "No action", detail: "Within current terms", className: "border-slate-200 bg-slate-50 text-slate-600" },
};

function PriorityPill({ priority }: { priority: CollectionPriority }) {
  const meta = priorityMeta[priority];
  return <span className={cn("inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide", meta.className)}>{meta.label}</span>;
}

export function SmartCollectionsTable({ rows, workspaceName }: { rows: SmartCollectionRow[]; workspaceName: string }) {
  const [language, setLanguage] = useState<CollectionLanguage>("roman-urdu");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [composerRow, setComposerRow] = useState<SmartCollectionRow | null>(null);
  const [composerPhone, setComposerPhone] = useState("");
  const [composerLanguage, setComposerLanguage] = useState<CollectionLanguage>("roman-urdu");
  const [composerMessage, setComposerMessage] = useState("");
  const [composerCopied, setComposerCopied] = useState(false);

  const visibleRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (!showAll && !row.needsContact) return false;
      if (!term) return true;
      return row.customerName.toLowerCase().includes(term)
        || row.phoneNumbers.some((phone) => phone.toLowerCase().includes(term))
        || row.pendingReferences.some((reference) => reference.toLowerCase().includes(term));
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

  function openComposer(row: SmartCollectionRow) {
    const firstPhone = row.whatsappPhones[0]?.raw ?? "";
    setComposerRow(row);
    setComposerPhone(firstPhone);
    setComposerLanguage(language);
    setComposerMessage(buildCollectionMessage(row, workspaceName, language));
    setComposerCopied(false);
  }

  function changeComposerLanguage(nextLanguage: CollectionLanguage) {
    setComposerLanguage(nextLanguage);
    if (composerRow) setComposerMessage(buildCollectionMessage(composerRow, workspaceName, nextLanguage));
  }

  function resetComposer() {
    if (!composerRow) return;
    setComposerMessage(buildCollectionMessage(composerRow, workspaceName, composerLanguage));
    setComposerCopied(false);
  }

  async function copyComposerMessage() {
    try {
      await navigator.clipboard.writeText(composerMessage);
      setComposerCopied(true);
      window.setTimeout(() => setComposerCopied(false), 1800);
    } catch {
      setComposerCopied(false);
    }
  }

  function openComposerWhatsApp() {
    const url = buildWhatsAppUrlForMessage(composerPhone, composerMessage);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Collection queue</h2>
            <p className="mt-0.5 text-xs text-slate-500">Balances come from the customer account. Prepare a professional reminder, choose the exact contact number, preview it, then open WhatsApp.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1 sm:flex-none">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Customer, phone or invoice..." className="h-8 pl-8 text-xs" />
            </div>
            <select value={language} onChange={(event) => setLanguage(event.target.value as CollectionLanguage)} className="h-8 rounded-md border bg-white px-2.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-primary/20" aria-label="Default reminder language">
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
                    {row.phoneNumbers.length ? <p className="mt-0.5 text-[11px] text-slate-500">{row.phoneNumbers[0]}{row.phoneNumbers.length > 1 ? ` · +${row.phoneNumbers.length - 1} more` : ""}</p> : <p className="mt-0.5 text-[11px] text-slate-400">No phone saved</p>}
                  </TableCell>
                  <TableCell className="text-right text-sm font-semibold tabular-nums text-slate-900">{formatPKR(row.currentBalance)}</TableCell>
                  <TableCell className="text-center">
                    <p className="text-xs font-medium text-slate-700">{row.oldestAgeDays === null ? "Needs review" : `${row.oldestAgeDays} days old`}</p>
                    <p className="text-[10px] text-slate-500">Terms: {row.creditDays} days{row.daysPastTerms && row.daysPastTerms > 0 ? ` · ${row.daysPastTerms} late` : ""}</p>
                  </TableCell>
                  <TableCell><PriorityPill priority={row.priority} /><p className="mt-1 text-[10px] text-slate-400">{priorityMeta[row.priority].detail}</p></TableCell>
                  <TableCell>
                    {row.pendingReferences.length ? <p className="max-w-[260px] truncate text-xs text-slate-600" title={row.pendingReferences.join(", ")}>{row.pendingReferences.join(", ")}</p> : <span className="text-xs text-slate-400">Account balance</span>}
                  </TableCell>
                  <TableCell className="pr-4">
                    <div className="flex justify-end gap-1.5">
                      <Button type="button" variant="outline" size="sm" onClick={() => void copyReminder(row)} title="Copy prepared reminder">
                        {copiedId === row.customerId ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                        {copiedId === row.customerId ? "Copied" : "Copy"}
                      </Button>
                      {row.whatsappPhones.length ? (
                        <Button type="button" size="sm" onClick={() => openComposer(row)} className="bg-emerald-600 text-white hover:bg-emerald-700">
                          <MessageCircle className="size-3.5" />Prepare reminder
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

      {composerRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`Prepare reminder for ${composerRow.customerName}`}>
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl">
            <div className="flex items-start gap-3 border-b px-5 py-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><MessageCircle className="size-5" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-base font-semibold text-slate-950">Payment reminder — {composerRow.customerName}</h3><PriorityPill priority={composerRow.priority} /></div>
                <p className="mt-1 text-xs text-slate-500">Review the exact recipient and wording before opening WhatsApp. Nothing is sent automatically from this screen.</p>
              </div>
              <button type="button" onClick={() => setComposerRow(null)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close reminder composer"><X className="size-4" /></button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1.5 sm:col-span-2"><span className="text-xs font-semibold text-slate-700">Send to</span><div className="relative"><Phone className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" /><select value={composerPhone} onChange={(event) => setComposerPhone(event.target.value)} className="h-9 w-full rounded-md border bg-white pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/20">{composerRow.whatsappPhones.map((contact, index) => <option key={contact.normalized} value={contact.raw}>{contact.raw}{index === 0 ? " — Primary" : ""}</option>)}</select></div></label>
                <label className="space-y-1.5"><span className="text-xs font-semibold text-slate-700">Language</span><select value={composerLanguage} onChange={(event) => changeComposerLanguage(event.target.value as CollectionLanguage)} className="h-9 w-full rounded-md border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"><option value="roman-urdu">Roman Urdu</option><option value="english">English</option></select></label>
              </div>

              <div className="mt-4 grid gap-3 rounded-xl border bg-slate-50 p-3 sm:grid-cols-3">
                <div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Outstanding</p><p className="mt-1 text-sm font-semibold text-slate-900">{formatPKR(composerRow.currentBalance)}</p></div>
                <div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Follow-up priority</p><p className="mt-1 text-sm font-semibold text-slate-900">{priorityMeta[composerRow.priority].label}</p></div>
                <div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Payment timing</p><p className="mt-1 text-sm font-semibold text-slate-900">{composerRow.daysPastTerms !== null && composerRow.daysPastTerms > 0 ? `${composerRow.daysPastTerms} days past terms` : composerRow.status === "DUE" ? "Due now" : composerRow.status === "REVIEW" ? "Needs confirmation" : "Within terms"}</p></div>
              </div>

              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between gap-2"><label htmlFor="collection-reminder-message" className="text-xs font-semibold text-slate-700">Message preview</label><button type="button" onClick={resetComposer} className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-900"><RotateCcw className="size-3" />Reset professional template</button></div>
                <textarea id="collection-reminder-message" value={composerMessage} onChange={(event) => setComposerMessage(event.target.value)} rows={15} className="w-full resize-y rounded-xl border bg-white px-3.5 py-3 text-sm leading-6 text-slate-800 outline-none focus:ring-2 focus:ring-primary/20" />
                <p className="mt-1.5 text-[11px] text-slate-400">You can edit the wording before sending. The outstanding amount and references were prepared from the current MunshiOS account data.</p>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[10px] leading-4 text-slate-400">Opening WhatsApp does not change the customer balance, ledger, invoice, or collection status.</p>
              <div className="flex gap-2 sm:shrink-0">
                <Button type="button" variant="outline" size="sm" onClick={() => void copyComposerMessage()}>{composerCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{composerCopied ? "Copied" : "Copy message"}</Button>
                <Button type="button" size="sm" onClick={openComposerWhatsApp} disabled={!composerPhone || !composerMessage.trim()} className="bg-emerald-600 text-white hover:bg-emerald-700"><MessageCircle className="size-3.5" />Open WhatsApp</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
