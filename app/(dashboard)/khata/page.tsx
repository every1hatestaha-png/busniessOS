import Link from "next/link";
import { AlertTriangle, CircleDollarSign, CreditCard, Users } from "lucide-react";

import { MetricCard } from "@/components/business/metric-card";
import { PageHeader } from "@/components/business/page-header";
import { StatusBadge } from "@/components/business/status-badge";
import { RecordPaymentForm } from "@/components/payments/record-payment-form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireWorkspace } from "@/lib/server/auth";
import { getCashBankAccounts } from "@/lib/server/accounting";
import { getKhataSummary } from "@/lib/server/khata";
import { canPerformAction } from "@/lib/server/authorization";
import { formatPKR } from "@/lib/utils";

export default async function KhataPage() {
  const { workspaceId, role } = await requireWorkspace();
  const canRecordPayments = canPerformAction(role, "payments.record");
  const [summary, cashBankAccounts] = await Promise.all([
    getKhataSummary(workspaceId),
    canRecordPayments ? getCashBankAccounts(workspaceId) : Promise.resolve([]),
  ]);
  const paymentCustomers = summary.customers.filter((customer) => customer.outstanding > 0).map((customer) => ({ id: customer.id, name: customer.name, balance: customer.outstanding }));

  return (
    <div className="space-y-6">
      <PageHeader title="Khata" description="Monitor customer receivables and record collections." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total receivable" value={formatPKR(summary.totalReceivables)} detail="Across all customer accounts" icon={CircleDollarSign} />
        <MetricCard label="Collected this month" value={formatPKR(summary.paymentsThisMonth)} detail="Customer payments received" icon={CreditCard} />
        <MetricCard label="Open balances" value={String(summary.customersWithBalance)} detail={`of ${summary.customers.length} customers`} icon={Users} />
        <MetricCard label="Overdue" value={formatPKR(summary.overdueAmount)} detail="Past-due invoice balances" icon={AlertTriangle} />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <div className="border-b border-neutral-200 px-4 py-4"><h2 className="font-semibold">Customer credit position</h2><p className="mt-1 text-sm text-neutral-500">Sales, collections, outstanding balance, and approved credit.</p></div>
          {summary.customers.length > 0 ? (
            <div className="overflow-x-auto">
              <Table className="min-w-[850px]">
                <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead className="text-right">Total sales</TableHead><TableHead className="text-right">Total paid</TableHead><TableHead className="text-right">Outstanding</TableHead><TableHead className="w-44">Credit usage</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>{summary.customers.map((customer) => {
                  const usage = customer.creditLimit > 0 ? Math.min(100, Math.round((customer.outstanding / customer.creditLimit) * 100)) : customer.outstanding > 0 ? 100 : 0;
                  return (
                    <TableRow key={customer.id}>
                      <TableCell><Link href={`/customers/${customer.id}`} className="font-medium hover:underline">{customer.name}</Link><p className="mt-0.5 text-xs text-neutral-500">{customer.phone || "No phone number"}</p></TableCell>
                      <TableCell className="text-right tabular-nums">{formatPKR(customer.totalSales)}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-700">{formatPKR(customer.totalPaid)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatPKR(customer.outstanding)}</TableCell>
                      <TableCell><div className="flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100"><div className={`h-full rounded-full ${usage >= 80 ? "bg-amber-500" : "bg-neutral-800"}`} style={{ width: `${usage}%` }} /></div><span className="w-9 text-right text-xs font-medium">{usage}%</span></div><p className="mt-1 text-xs text-neutral-400">Limit {formatPKR(customer.creditLimit)}</p></TableCell>
                      <TableCell><StatusBadge status={customer.status} /></TableCell>
                    </TableRow>
                  );
                })}</TableBody>
              </Table>
            </div>
          ) : <p className="px-4 py-12 text-center text-sm text-neutral-500">No customer accounts have been added yet.</p>}
        </div>

        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-5 xl:sticky xl:top-6"><div className="mb-5"><h2 className="font-semibold">Record payment</h2><p className="mt-1 text-sm text-neutral-500">Unallocated receipts reduce the customer account balance.</p></div>{canRecordPayments ? <RecordPaymentForm customers={paymentCustomers} cashBankAccounts={cashBankAccounts} /> : <p className="text-sm text-neutral-500">Your role cannot record payments.</p>}</div>
      </div>
  );
}
