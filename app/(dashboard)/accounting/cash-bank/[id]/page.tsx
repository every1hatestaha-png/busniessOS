import Link from "next/link";
import { ArrowLeft, ArrowDownToLine, ArrowUpFromLine, Landmark, Scale } from "lucide-react";
import { notFound } from "next/navigation";
import { MetricCard } from "@/components/business/metric-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCashBankAccountLedger } from "@/lib/server/accounting";
import { listCashDrawerReconciliations } from "@/lib/server/cash-reconciliation";
import { recordCashDrawerReconciliationAction } from "@/app/(dashboard)/accounting/cash-bank/[id]/actions";
import { requirePermission } from "@/lib/server/authorization";
import { cn, formatDate, formatPKR } from "@/lib/utils";

export default async function CashBankDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { workspaceId } = await requirePermission("financial.manage");
  const id = (await params).id;
  const query = await searchParams;
  const [account, reconciliations] = await Promise.all([
    getCashBankAccountLedger(workspaceId, id),
    listCashDrawerReconciliations(workspaceId, id),
  ]);
  if (!account) notFound();
  const differenceDetail = account.reconciliationDifference === 0 ? "Ledger and account balance agree" : `${formatPKR(account.reconciliationDifference)} difference`;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 print:space-y-4">
      <header><Link href="/accounting/cash-bank" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 mb-2 print:hidden")}><ArrowLeft className="h-3.5 w-3.5" />Cash & Bank</Link><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><h1 className="text-xl font-semibold tracking-tight">{account.name}</h1><span className="rounded bg-neutral-100 px-2 py-0.5 text-xs">{account.isBank ? "Bank" : "Cash"}</span></div><p className="mt-0.5 text-xs text-neutral-500">{account.code} · Current-period ledger, {formatDate(account.from)} to {formatDate(account.to)}</p></div><Link href={`/reports/cash-bank?accountId=${encodeURIComponent(account.id)}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "print:hidden")}>Print ledger</Link></div></header>
      {typeof query.error === "string" && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{query.error}</div>}
      {typeof query.reconciled === "string" && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Physical cash count recorded. Variance: {formatPKR(Number(query.reconciled))}. No automatic ledger adjustment was posted.</div>}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Ledger closing" value={formatPKR(account.closingBalance)} detail={`Opening ${formatPKR(account.openingBalance)}`} icon={Landmark} /><MetricCard label="Receipts" value={formatPKR(account.receipts)} detail="Debits posted in period" icon={ArrowDownToLine} /><MetricCard label="Payments" value={formatPKR(account.payments)} detail="Credits posted in period" icon={ArrowUpFromLine} /><MetricCard label="Current balance" value={formatPKR(account.currentBalance)} detail={differenceDetail} icon={Scale} /></section>
      {(account.bankName || account.accountTitle || account.accountNumber) && <div className="rounded-lg border bg-white px-4 py-3 text-xs"><span className="font-medium text-neutral-500">Bank details:</span> {[account.bankName, account.accountTitle, account.accountNumber].filter(Boolean).join(" · ")}</div>}
      {!account.isBank && <Card className="gap-0 py-0 shadow-none print:hidden">
        <CardHeader className="border-b px-4 py-3"><CardTitle>Cash drawer reconciliation</CardTitle><p className="text-xs text-neutral-500">Record the physical cash count against the system balance. Variances are logged for review and do not silently change the ledger.</p></CardHeader>
        <CardContent className="grid gap-5 p-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <form action={recordCashDrawerReconciliationAction.bind(null, account.id)} className="space-y-3 rounded-lg border bg-neutral-50 p-4">
            <div><p className="text-xs text-neutral-500">Expected cash</p><p className="mt-1 text-xl font-semibold tabular-nums">{formatPKR(account.currentBalance)}</p></div>
            <label className="block"><span className="mb-1 block text-xs font-medium">Counted cash</span><Input name="countedAmount" type="number" min="0" step="0.01" defaultValue={account.currentBalance} required /></label>
            <label className="block"><span className="mb-1 block text-xs font-medium">Notes</span><textarea name="notes" rows={3} maxLength={500} className="w-full rounded-md border bg-white px-3 py-2 text-sm" placeholder="Shift close, cashier, discrepancy explanation..." /></label>
            <Button type="submit" className="w-full">Record physical count</Button>
          </form>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead className="text-right">Expected</TableHead><TableHead className="text-right">Counted</TableHead><TableHead className="text-right">Variance</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
              <TableBody>
                {reconciliations.map((row) => <TableRow key={row.id}><TableCell>{formatDate(row.createdAt)}</TableCell><TableCell className="text-right tabular-nums">{formatPKR(row.expectedAmount)}</TableCell><TableCell className="text-right tabular-nums">{formatPKR(row.countedAmount)}</TableCell><TableCell className={"text-right font-semibold tabular-nums " + (row.difference === 0 ? "text-emerald-700" : "text-amber-700")}>{formatPKR(row.difference)}</TableCell><TableCell className="max-w-[320px] whitespace-normal text-xs text-neutral-600">{row.notes || "-"}</TableCell></TableRow>)}
                {reconciliations.length === 0 && <TableRow><TableCell colSpan={5} className="h-24 text-center text-sm text-neutral-500">No physical cash counts recorded yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>}
      <Card className="gap-0 py-0 shadow-none"><CardHeader className="border-b px-4 py-3"><CardTitle>Ledger entries</CardTitle><p className="text-xs text-neutral-500">Posted activity for the current business month. Use the Cash & Bank Ledger report for custom periods.</p></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><Table className="min-w-[900px]"><TableHeader className="bg-neutral-50/80"><TableRow><TableHead className="pl-4">Date</TableHead><TableHead>Document</TableHead><TableHead>Source</TableHead><TableHead>Narration</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead className="pr-4 text-right">Running</TableHead></TableRow></TableHeader><TableBody>{account.entries.map((entry) => <TableRow key={entry.id}><TableCell className="pl-4">{formatDate(entry.date)}</TableCell><TableCell className="font-mono text-xs">{entry.documentNo}</TableCell><TableCell><span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium">{entry.sourceType.replaceAll("_", " ")}</span></TableCell><TableCell>{entry.narration}</TableCell><TableCell className="text-right tabular-nums">{entry.debit ? formatPKR(entry.debit) : "-"}</TableCell><TableCell className="text-right tabular-nums">{entry.credit ? formatPKR(entry.credit) : "-"}</TableCell><TableCell className="pr-4 text-right font-semibold tabular-nums">{formatPKR(entry.runningBalance)}</TableCell></TableRow>)}{account.entries.length === 0 && <TableRow><TableCell colSpan={7} className="h-28 text-center text-neutral-500">No posted entries in this period.</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card>
    </div>
  );
}
