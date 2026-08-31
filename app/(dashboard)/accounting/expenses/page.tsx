import { ExpenseForm } from "@/components/accounting/expense-form";
import { PageHeader } from "@/components/business/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCashBankAccounts, getChartOfAccounts, listExpenses } from "@/lib/server/accounting";
import { requirePermission } from "@/lib/server/authorization";
import { formatDate, formatPKR } from "@/lib/utils";

export default async function ExpensesPage() {
  const { workspaceId } = await requirePermission("financial.manage");
  const [chart, cashBank, expenses] = await Promise.all([getChartOfAccounts(workspaceId), getCashBankAccounts(workspaceId), listExpenses(workspaceId)]);
  const expenseAccounts = chart.filter((account) => account.category === "EXPENSE" && account.isActive).map(({ id, code, name }) => ({ id, code, name }));
  const paymentAccounts = cashBank.map((account) => ({ id: account.id, name: account.name }));
  return <div className="space-y-6">
    <PageHeader title="Expenses" description="Post operating expenses against the selected cash or bank account." />
    <ExpenseForm expenseAccounts={expenseAccounts} paymentAccounts={paymentAccounts} />
    <section className="overflow-hidden border bg-white"><div className="border-b p-4"><h2 className="font-semibold">Expense register</h2><p className="text-sm text-neutral-500">Latest 500 persisted vouchers.</p></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Voucher</TableHead><TableHead>Category</TableHead><TableHead>Paid from</TableHead><TableHead>Payee / reference</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader><TableBody>{expenses.map((expense) => <TableRow key={expense.id}><TableCell>{formatDate(expense.date)}</TableCell><TableCell className="font-mono text-xs">{expense.voucherNumber}</TableCell><TableCell>{expense.expenseAccount.name}</TableCell><TableCell>{expense.paymentAccount.name}</TableCell><TableCell>{[expense.payee, expense.reference].filter(Boolean).join(" · ") || expense.notes || "-"}</TableCell><TableCell className="text-right font-semibold tabular-nums">{formatPKR(expense.amount)}</TableCell></TableRow>)}{!expenses.length && <TableRow><TableCell colSpan={6} className="py-10 text-center text-neutral-500">No expenses recorded.</TableCell></TableRow>}</TableBody></Table></div></section>
  </div>;
}
