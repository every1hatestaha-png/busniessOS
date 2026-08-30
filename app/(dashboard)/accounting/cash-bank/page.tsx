import Link from "next/link";

import { CashBankAccountForm } from "@/components/accounting/cash-bank-account-form";
import { PageHeader } from "@/components/business/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCashBankAccounts } from "@/lib/server/accounting";
import { requireWorkspace } from "@/lib/server/auth";
import { canPerformAction } from "@/lib/server/authorization";
import { formatPKR } from "@/lib/utils";

export default async function CashBankPage() {
  const { workspaceId, role } = await requireWorkspace();
  const accounts = await getCashBankAccounts(workspaceId);
  const total = accounts.reduce((sum, account) => sum + account.currentBalance, 0);
  const canManage = canPerformAction(role, "financial.manage");

  return (
    <div className="space-y-6">
      <PageHeader title="Cash & Bank" description="Manage payment accounts and review available balances." />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-neutral-200 bg-neutral-950 p-5 text-white"><p className="text-sm text-neutral-300">Total cash/bank</p><p className="mt-2 text-3xl font-bold tabular-nums">{formatPKR(total)}</p></div>
        <div className="rounded-xl border border-neutral-200 bg-white p-5"><p className="text-sm text-neutral-500">Accounts</p><p className="mt-2 text-3xl font-bold tabular-nums">{accounts.length}</p></div>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <div className="border-b border-neutral-200 px-4 py-4"><h2 className="font-semibold">Payment accounts</h2><p className="mt-1 text-sm text-neutral-500">Balances update from posted GL receipts, payments, and expenses.</p></div>
          <div className="overflow-x-auto"><Table className="min-w-[760px]"><TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Type</TableHead><TableHead>Bank detail</TableHead><TableHead className="text-right">Opening</TableHead><TableHead className="text-right">Current</TableHead></TableRow></TableHeader><TableBody>{accounts.map((account) => <TableRow key={account.cashBankAccountId}><TableCell><Link href={`/accounting/cash-bank/${account.cashBankAccountId}`} className="font-medium hover:underline">{account.name}</Link><p className="text-xs text-neutral-500">{account.code}</p></TableCell><TableCell>{account.isBank ? "Bank" : "Cash"}</TableCell><TableCell>{account.bankName || account.accountNumber || "-"}</TableCell><TableCell className="text-right tabular-nums">{formatPKR(account.openingBalance)}</TableCell><TableCell className="text-right font-semibold tabular-nums">{formatPKR(account.currentBalance)}</TableCell></TableRow>)}{accounts.length === 0 && <TableRow><TableCell colSpan={5} className="py-10 text-center text-neutral-500">No cash/bank accounts yet.</TableCell></TableRow>}</TableBody></Table></div>
        </section>
        {canManage && <CashBankAccountForm />}
      </div>
    </div>
  );
}
