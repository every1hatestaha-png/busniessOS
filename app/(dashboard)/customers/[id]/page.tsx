import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, CircleDollarSign, CreditCard, Pencil, ShoppingCart } from "lucide-react";

import { MetricCard } from "@/components/business/metric-card";
import { StatusBadge } from "@/components/business/status-badge";
import { CustomerDetailsTabs } from "@/components/customers/customer-details-tabs";
import { RecordPaymentForm } from "@/components/payments/record-payment-form";
import { buttonVariants } from "@/components/ui/button";
import { requireWorkspace } from "@/lib/server/auth";
import { getCashBankAccounts } from "@/lib/server/accounting";
import { getCustomer } from "@/lib/server/customers";
import { canPerformAction } from "@/lib/server/authorization";
import { formatPKR, getCreditStatus } from "@/lib/utils";
import { RemoveCustomerButton } from "@/components/customers/remove-customer-button";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId, role } = await requireWorkspace();
  const canRecordPayments = canPerformAction(role, "payments.record");
  const [customer, cashBankAccounts] = await Promise.all([
    getCustomer(workspaceId, id),
    canRecordPayments ? getCashBankAccounts(workspaceId) : Promise.resolve([]),
  ]);
  if (!customer) notFound();
  const usage = customer.creditLimit ? Math.round((customer.currentBalance / customer.creditLimit) * 100) : 0;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div>
         <Link href="/customers" className="mb-2 inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900"><ChevronLeft className="h-3.5 w-3.5" />Customers</Link>
         <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold tracking-tight">{customer.companyName}</h1><StatusBadge status={customer.status} /><StatusBadge status={getCreditStatus(customer.currentBalance, customer.creditLimit)} /></div><p className="mt-0.5 text-xs text-neutral-500">{customer.name}, {customer.city}</p></div><div className="flex flex-wrap gap-2">{canPerformAction(role, "customers.write") && <><Link href={`/customers/${customer.id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}><Pencil className="h-3.5 w-3.5" />Edit</Link><RemoveCustomerButton customerId={customer.id} customerName={customer.companyName || customer.name} /></>}</div></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Outstanding balance" value={formatPKR(customer.currentBalance)} detail="Amount currently receivable" icon={CircleDollarSign} />
        <MetricCard label="Credit usage" value={`${usage}%`} detail={`${formatPKR(Math.max(0, customer.creditLimit - customer.currentBalance))} available`} icon={CreditCard} />
        <MetricCard label="Total sales" value={formatPKR(customer.totalSales)} detail="Lifetime sales" icon={ShoppingCart} />
        <MetricCard label="Total payments" value={formatPKR(customer.totalPayments)} detail="Lifetime receipts" icon={CircleDollarSign} />
      </div>
      <div className={`grid items-start gap-4 ${customer.currentBalance > 0 && canRecordPayments ? "xl:grid-cols-[minmax(0,1fr)_360px]" : ""}`}><CustomerDetailsTabs customer={customer} />{customer.currentBalance > 0 && canRecordPayments && <div className="rounded-xl border bg-white p-4"><h2 className="font-semibold">Record receipt</h2><p className="mb-4 mt-1 text-xs text-neutral-500">Unallocated receipt against this customer account.</p><RecordPaymentForm customers={[{ id: customer.id, name: customer.companyName, balance: customer.currentBalance }]} cashBankAccounts={cashBankAccounts} /></div>}</div>
    </div>
  );
}
