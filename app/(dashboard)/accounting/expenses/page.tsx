import Link from "next/link";
import { ExpenseForm } from "@/components/accounting/expense-form";
import { PageHeader } from "@/components/business/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCashBankAccounts, getChartOfAccounts, listExpenses } from "@/lib/server/accounting";
import { requirePermission } from "@/lib/server/authorization";
import { formatDate, formatPKR } from "@/lib/utils";

export default async function ExpensesPage() {
  const { workspaceId } = await requirePermission("financial.manage");
  const [chart, cashBank, expenses] = await Promise.all([getChartOfAccounts(workspaceId), getCashBankAccounts(workspaceId), listExpenses(workspaceId)]);
  const expenseAccounts = chart.filter((account) => account.category === "EXPENSE" && account.isActive).map(({ id, code, name }) => ({ id, code, name }));
  const paymentAccounts = cashBank.map((account) => ({ id: account.id, name: account.name }));
  return <div className="mx-auto max-w-[1600px] space-y-6">
    <PageHeader title="Expenses" description="Post operating expenses against the selected cash or bank account." />
    <ExpenseForm expenseAccounts={expenseAccounts} paymentAccounts={paymentAccounts} />
    <Card className="gap-0 rounded-md border py-0 shadow-none ring-0"><CardContent className="p-0"><div className="border-b px-4 py-3"><h2 className="text-sm font-semibold">Expense register</h2><p className="mt-0.5 text-[11px] text-slate-500">Latest 500 persisted vouchers.</p></div><div className="overflow-x-auto"><Table><TableHeader><TableRow className="h-9 bg-slate-50/80 hover:bg-slate-50/80"><TableHead className="h-9 pl-4 text-[11px] uppercase tracking-wide text-slate-500">Date</TableHead><TableHead className="h-9 text-[11px] uppercase tracking-wide text-slate-500">Voucher</TableHead><TableHead className="h-9 text-[11px] uppercase tracking-wide text-slate-500">Category</TableHead><TableHead className="h-9 text-[11px] uppercase tracking-wide text-slate-500">Paid from</TableHead><TableHead className="h-9 text-[11px] uppercase tracking-wide text-slate-500">Payee / reference</TableHead><TableHead className="h-9 pr-4 text-right text-[11px] uppercase tracking-wide text-slate-500">Amount</TableHead></TableRow></TableHeader><TableBody>{expenses.map((expense) => <TableRow key={expense.id} className="h-11"><TableCell className="py-1.5 pl-4 text-xs text-slate-600">{formatDate(expense.date)}</TableCell><TableCell className="py-1.5 font-mono text-xs"><Link href={`/accounting/expenses/${expense.id}`} className="font-medium text-slate-900 hover:text-blue-700 hover:underline">{expense.voucherNumber}</Link></TableCell><TableCell className="py-1.5 text-xs font-medium text-slate-800">{expense.expenseAccount.name}</TableCell><TableCell className="py-1.5 text-xs text-slate-600">{expense.paymentAccount.name}</TableCell><TableCell className="py-1.5 text-xs text-slate-600">{[expense.payee, expense.reference].filter(Boolean).join(" · ") || expense.notes || "-"}</TableCell><TableCell className="py-1.5 pr-4 text-right text-xs font-semibold tabular-nums">{formatPKR(expense.amount)}</TableCell></TableRow>)}{!expenses.length && <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500">No expenses recorded.</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card>
  </div>;
}
