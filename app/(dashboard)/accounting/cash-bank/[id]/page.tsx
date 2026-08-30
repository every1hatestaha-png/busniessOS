import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/business/page-header";
import { PrintButton } from "@/components/invoices/print-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCashBankAccountLedger } from "@/lib/server/accounting";
import { requireWorkspace } from "@/lib/server/auth";
import { formatDate, formatPKR } from "@/lib/utils";

export default async function CashBankDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { workspaceId } = await requireWorkspace();
  const account = await getCashBankAccountLedger(workspaceId, (await params).id);
  if (!account) notFound();

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title={account.name} description={`${account.isBank ? "Bank" : "Cash"} ledger account ${account.code}`} />
        <div className="print:hidden"><PrintButton label="Print ledger" /></div>
      </div>
      <Link href="/accounting/cash-bank" className="text-sm text-neutral-500 hover:text-neutral-900 print:hidden">Back to Cash & Bank</Link>
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-neutral-200 bg-neutral-950 p-5 text-white"><p className="text-sm text-neutral-300">Current balance</p><p className="mt-2 text-3xl font-bold tabular-nums">{formatPKR(account.currentBalance)}</p></div>
        <div className="rounded-xl border border-neutral-200 bg-white p-5"><p className="text-sm text-neutral-500">Opening balance</p><p className="mt-2 text-2xl font-bold tabular-nums">{formatPKR(account.openingBalance)}</p></div>
        <div className="rounded-xl border border-neutral-200 bg-white p-5 lg:col-span-2"><p className="text-sm text-neutral-500">Bank details</p><p className="mt-2 font-medium">{[account.bankName, account.accountTitle, account.accountNumber].filter(Boolean).join(" · ") || "-"}</p></div>
      </div>
      <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="border-b border-neutral-200 px-4 py-4"><h2 className="font-semibold">Ledger entries</h2><p className="mt-1 text-sm text-neutral-500">Latest 200 posted entries for this payment account.</p></div>
        <div className="overflow-x-auto"><Table className="min-w-[900px]"><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Document</TableHead><TableHead>Source</TableHead><TableHead>Narration</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead className="text-right">Running</TableHead></TableRow></TableHeader><TableBody>{account.entries.map((entry) => <TableRow key={entry.id}><TableCell>{formatDate(entry.date)}</TableCell><TableCell className="font-mono text-xs">{entry.documentNo}</TableCell><TableCell>{entry.sourceType.replaceAll("_", " ")}</TableCell><TableCell>{entry.narration}</TableCell><TableCell className="text-right tabular-nums">{entry.debit ? formatPKR(entry.debit) : "-"}</TableCell><TableCell className="text-right tabular-nums">{entry.credit ? formatPKR(entry.credit) : "-"}</TableCell><TableCell className="text-right font-semibold tabular-nums">{formatPKR(entry.runningBalance)}</TableCell></TableRow>)}{account.entries.length === 0 && <TableRow><TableCell colSpan={7} className="py-10 text-center text-neutral-500">No ledger entries yet.</TableCell></TableRow>}</TableBody></Table></div>
      </section>
    </div>
  );
}
