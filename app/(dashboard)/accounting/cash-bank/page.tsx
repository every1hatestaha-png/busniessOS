import Link from "next/link";
import { Banknote, Building2, Landmark } from "lucide-react";
import { CashBankAccountForm } from "@/components/accounting/cash-bank-account-form";
import { MetricCard } from "@/components/business/metric-card";
import { PageHeader } from "@/components/business/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCashBankAccounts } from "@/lib/server/accounting";
import { requirePermission } from "@/lib/server/authorization";
import { formatPKR } from "@/lib/utils";

export default async function CashBankPage() {
  const { workspaceId } = await requirePermission("financial.manage");
  const accounts = await getCashBankAccounts(workspaceId);
  const cashTotal = accounts.filter((account) => !account.isBank).reduce((sum, account) => sum + account.currentBalance, 0);
  const bankTotal = accounts.filter((account) => account.isBank).reduce((sum, account) => sum + account.currentBalance, 0);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader title="Cash & Bank" description="Active payment accounts and available ledger balances." />
      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Total available" value={formatPKR(cashTotal + bankTotal)} detail="Across active payment accounts" icon={Banknote} />
        <MetricCard label="Cash balance" value={formatPKR(cashTotal)} detail={`${accounts.filter((account) => !account.isBank).length} active cash accounts`} icon={Building2} />
        <MetricCard label="Bank balance" value={formatPKR(bankTotal)} detail={`${accounts.filter((account) => account.isBank).length} active bank accounts`} icon={Landmark} />
      </section>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="gap-0 py-0 shadow-none"><CardHeader className="border-b px-4 py-3"><h2 className="font-semibold">Active account register</h2><p className="text-xs text-neutral-500">Balances update from posted receipts, supplier payments, and expenses.</p></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><Table className="min-w-[760px]"><TableHeader className="bg-neutral-50/80"><TableRow><TableHead className="pl-4">Account</TableHead><TableHead>Type</TableHead><TableHead>Bank detail</TableHead><TableHead className="text-right">Opening</TableHead><TableHead className="pr-4 text-right">Current</TableHead></TableRow></TableHeader><TableBody>{accounts.map((account) => <TableRow key={account.cashBankAccountId}><TableCell className="pl-4"><Link href={`/accounting/cash-bank/${account.cashBankAccountId}`} className="font-medium hover:underline">{account.name}</Link><p className="font-mono text-xs text-neutral-500">{account.code}</p></TableCell><TableCell>{account.isBank ? "Bank" : "Cash"}</TableCell><TableCell><p>{account.bankName || "-"}</p><p className="text-xs text-neutral-500">{account.accountNumber || account.accountTitle || ""}</p></TableCell><TableCell className="text-right tabular-nums text-neutral-600">{formatPKR(account.openingBalance)}</TableCell><TableCell className="pr-4 text-right font-semibold tabular-nums">{formatPKR(account.currentBalance)}</TableCell></TableRow>)}{accounts.length === 0 && <TableRow><TableCell colSpan={5} className="h-28 text-center text-neutral-500">No active cash or bank accounts yet.</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card>
        <CashBankAccountForm />
      </div>
    </div>
  );
}
