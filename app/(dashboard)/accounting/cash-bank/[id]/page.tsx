import Link from "next/link";
import { ArrowLeft, ArrowDownToLine, ArrowUpFromLine, Landmark, Scale } from "lucide-react";
import { notFound } from "next/navigation";
import { MetricCard } from "@/components/business/metric-card";
import { PrintButton } from "@/components/invoices/print-button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCashBankAccountLedger } from "@/lib/server/accounting";
import { requirePermission } from "@/lib/server/authorization";
import { cn, formatDate, formatPKR } from "@/lib/utils";

export default async function CashBankDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { workspaceId } = await requirePermission("financial.manage");
  const account = await getCashBankAccountLedger(workspaceId, (await params).id);
  if (!account) notFound();
  const differenceDetail = account.reconciliationDifference === 0 ? "Ledger and account balance agree" : `${formatPKR(account.reconciliationDifference)} difference`;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 print:space-y-4">
      <header><Link href="/accounting/cash-bank" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 mb-2 print:hidden")}><ArrowLeft className="h-3.5 w-3.5" />Cash & Bank</Link><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><h1 className="text-xl font-semibold tracking-tight">{account.name}</h1><span className="rounded bg-neutral-100 px-2 py-0.5 text-xs">{account.isBank ? "Bank" : "Cash"}</span></div><p className="mt-0.5 text-xs text-neutral-500">{account.code} · Current-period ledger, {formatDate(account.from)} to {formatDate(account.to)}</p></div><div className="print:hidden"><PrintButton label="Print ledger" /></div></div></header>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Ledger closing" value={formatPKR(account.closingBalance)} detail={`Opening ${formatPKR(account.openingBalance)}`} icon={Landmark} /><MetricCard label="Receipts" value={formatPKR(account.receipts)} detail="Debits posted in period" icon={ArrowDownToLine} /><MetricCard label="Payments" value={formatPKR(account.payments)} detail="Credits posted in period" icon={ArrowUpFromLine} /><MetricCard label="Current balance" value={formatPKR(account.currentBalance)} detail={differenceDetail} icon={Scale} /></section>
      {(account.bankName || account.accountTitle || account.accountNumber) && <div className="rounded-lg border bg-white px-4 py-3 text-xs"><span className="font-medium text-neutral-500">Bank details:</span> {[account.bankName, account.accountTitle, account.accountNumber].filter(Boolean).join(" · ")}</div>}
      <Card className="gap-0 py-0 shadow-none"><CardHeader className="border-b px-4 py-3"><CardTitle>Ledger entries</CardTitle><p className="text-xs text-neutral-500">Posted activity for the current business month. Use the Cash & Bank Ledger report for custom periods.</p></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><Table className="min-w-[900px]"><TableHeader className="bg-neutral-50/80"><TableRow><TableHead className="pl-4">Date</TableHead><TableHead>Document</TableHead><TableHead>Source</TableHead><TableHead>Narration</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead className="pr-4 text-right">Running</TableHead></TableRow></TableHeader><TableBody>{account.entries.map((entry) => <TableRow key={entry.id}><TableCell className="pl-4">{formatDate(entry.date)}</TableCell><TableCell className="font-mono text-xs">{entry.documentNo}</TableCell><TableCell><span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium">{entry.sourceType.replaceAll("_", " ")}</span></TableCell><TableCell>{entry.narration}</TableCell><TableCell className="text-right tabular-nums">{entry.debit ? formatPKR(entry.debit) : "-"}</TableCell><TableCell className="text-right tabular-nums">{entry.credit ? formatPKR(entry.credit) : "-"}</TableCell><TableCell className="pr-4 text-right font-semibold tabular-nums">{formatPKR(entry.runningBalance)}</TableCell></TableRow>)}{account.entries.length === 0 && <TableRow><TableCell colSpan={7} className="h-28 text-center text-neutral-500">No posted entries in this period.</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card>
    </div>
  );
}
