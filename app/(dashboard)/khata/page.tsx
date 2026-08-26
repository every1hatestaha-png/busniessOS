import Link from "next/link";
import { AlertTriangle, CircleDollarSign, CreditCard, Users } from "lucide-react";

import { MetricCard } from "@/components/business/metric-card";
import { DemoDataNotice } from "@/components/business/demo-data-notice";
import { PageHeader } from "@/components/business/page-header";
import { StatusBadge } from "@/components/business/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DEMO_CUSTOMERS } from "@/lib/demo-data";
import { formatPKR, getCreditStatus } from "@/lib/utils";

export default function KhataPage() {
  const outstanding = DEMO_CUSTOMERS.reduce((total, customer) => total + customer.currentBalance, 0);
  const totalLimit = DEMO_CUSTOMERS.reduce((total, customer) => total + customer.creditLimit, 0);
  const availableCredit = Math.max(0, totalLimit - outstanding);
  const customersWithBalance = DEMO_CUSTOMERS.filter((customer) => customer.currentBalance > 0).length;
  const riskCustomers = DEMO_CUSTOMERS.filter((customer) => ["Near Limit", "Over Limit"].includes(getCreditStatus(customer.currentBalance, customer.creditLimit))).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Khata" description="Monitor customer receivables and credit exposure" />
      <DemoDataNotice module="Khata" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total receivable" value={formatPKR(outstanding)} detail="Across all customer accounts" icon={CircleDollarSign} />
        <MetricCard label="Available credit" value={formatPKR(availableCredit)} detail={`${formatPKR(totalLimit)} total approved`} icon={CreditCard} />
        <MetricCard label="Open balances" value={String(customersWithBalance)} detail={`of ${DEMO_CUSTOMERS.length} customers`} icon={Users} />
        <MetricCard label="Near credit limit" value={String(riskCustomers)} detail="Accounts at 80% usage or above" icon={AlertTriangle} />
      </div>
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="border-b border-neutral-200 px-4 py-4"><h2 className="font-semibold">Customer credit position</h2><p className="mt-1 text-sm text-neutral-500">Balance, available headroom, and approved limit at a glance.</p></div>
        <Table className="min-w-[860px]">
          <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead className="text-right">Balance</TableHead><TableHead className="text-right">Credit limit</TableHead><TableHead className="w-48">Credit usage</TableHead><TableHead className="text-right">Available</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>{DEMO_CUSTOMERS.map((customer) => {
            const percentage = customer.creditLimit ? Math.min(100, Math.round((customer.currentBalance / customer.creditLimit) * 100)) : 0;
            const creditStatus = getCreditStatus(customer.currentBalance, customer.creditLimit);
            return <TableRow key={customer.id}><TableCell><Link href={`/customers/${customer.id}`} className="font-medium hover:underline">{customer.companyName}</Link><p className="text-xs text-neutral-500">{customer.name}</p></TableCell><TableCell className="text-right font-medium">{formatPKR(customer.currentBalance)}</TableCell><TableCell className="text-right">{formatPKR(customer.creditLimit)}</TableCell><TableCell><div className="flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100"><div className={`h-full rounded-full ${percentage >= 80 ? "bg-amber-500" : "bg-neutral-800"}`} style={{ width: `${percentage}%` }} /></div><span className="w-9 text-right text-xs font-medium">{percentage}%</span></div></TableCell><TableCell className="text-right text-emerald-700">{formatPKR(Math.max(0, customer.creditLimit - customer.currentBalance))}</TableCell><TableCell><StatusBadge status={creditStatus} /></TableCell></TableRow>;
          })}</TableBody>
        </Table>
        <p className="border-t border-neutral-200 px-4 py-3 text-xs text-neutral-500">Demo balances reflect the sample customer data and are not connected to live accounting records.</p>
      </div>
    </div>
  );
}
