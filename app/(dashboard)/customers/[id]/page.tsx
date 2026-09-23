import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpenText, ChevronLeft, CircleDollarSign, CreditCard, Pencil, Printer, ShoppingCart } from "lucide-react";

import { MetricCard } from "@/components/business/metric-card";
import { StatusBadge } from "@/components/business/status-badge";
import { CustomerDetailsTabs } from "@/components/customers/customer-details-tabs";
import { RecordPaymentForm } from "@/components/payments/record-payment-form";
import { buttonVariants } from "@/components/ui/button";
import { requireWorkspace } from "@/lib/server/auth";
import { getCashBankAccounts } from "@/lib/server/accounting";
import { getCustomerOpeningBalanceOutstanding } from "@/lib/server/payments";
import { getCustomer } from "@/lib/server/customers";
import { canPerformAction } from "@/lib/server/authorization";
import { formatPKR, getCreditStatus } from "@/lib/utils";
import { RemoveCustomerButton } from "@/components/customers/remove-customer-button";
import { getCreditPresentation } from "@/lib/customer-credit";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId, role } = await requireWorkspace();
  const canRecordPayments = canPerformAction(role, "payments.record");
  const canViewFinancials = canPerformAction(role, "financial.manage");
  const canEditCustomer = canPerformAction(role, "customers.write");
  const [customer, cashBankAccounts] = await Promise.all([
    getCustomer(workspaceId, id),
    canRecordPayments ? getCashBankAccounts(workspaceId) : Promise.resolve([]),
  ]);
  if (!customer) notFound();
  const openingBalances = canRecordPayments
    ? await getCustomerOpeningBalanceOutstanding(workspaceId, [customer.id])
    : new Map<string, number>();
  const openingBalanceOutstanding = openingBalances.get(customer.id) ?? 0;
  const credit = getCreditPresentation(customer.currentBalance, customer.creditLimit);
  const ledgerHref = `/reports/customer-statement?partyId=${customer.id}&from=2000-01-01`;

  return (
    <div className="mx-auto min-w-0 max-w-[1600px] space-y-6">
      <div className="min-w-0">
         <Link href="/customers" className="mb-2 inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900"><ChevronLeft className="h-3.5 w-3.5" />Customers</Link>
         <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="min-w-0 break-words text-xl font-semibold tracking-tight">{customer.companyName}</h1><StatusBadge status={customer.status} /><StatusBadge status={getCreditStatus(customer.currentBalance, customer.creditLimit)} /></div><p className="mt-0.5 break-words text-xs text-neutral-500">{customer.name}, {customer.city}</p></div><div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">{canViewFinancials && <Link href={ledgerHref} className={buttonVariants({ variant: "outline", size: "sm" })}><BookOpenText className="h-3.5 w-3.5" />Full ledger</Link>}{canViewFinancials && <Link href={`${ledgerHref}&print=1`} className={buttonVariants({ variant: "outline", size: "sm" })}><Printer className="h-3.5 w-3.5" />Print ledger</Link>}{canEditCustomer && <><Link href={`/customers/${customer.id}/pricing`} className={buttonVariants({ variant: "outline", size: "sm" })}>Pricing</Link><Link href={`/customers/${customer.id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}><Pencil className="h-3.5 w-3.5" />Edit</Link><RemoveCustomerButton customerId={customer.id} customerName={customer.companyName || customer.name} /></>}</div></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <MetricCard label="Outstanding balance" value={formatPKR(customer.currentBalance)} detail="Amount currently receivable" icon={CircleDollarSign} />
        <MetricCard label="Credit terms" value={`${customer.creditDays} days`} detail="Payment period for new invoices" icon={CreditCard} />
        <MetricCard label="Credit limit" value={credit.value} detail={credit.detail} icon={CreditCard} />
        <MetricCard label="Total sales" value={formatPKR(customer.totalSales)} detail="Lifetime sales" icon={ShoppingCart} />
        <MetricCard label="Total payments" value={formatPKR(customer.totalPayments)} detail="Lifetime receipts" icon={CircleDollarSign} />
      </div>
      <div className={`grid min-w-0 items-start gap-4 ${customer.currentBalance > 0 && canRecordPayments ? "2xl:grid-cols-[minmax(0,1fr)_360px]" : ""}`}><div className="min-w-0"><CustomerDetailsTabs customer={customer} /></div>{customer.currentBalance > 0 && canRecordPayments && <div className="min-w-0 rounded-xl border bg-white p-4"><h2 className="font-semibold">Record receipt</h2><p className="mb-4 mt-1 text-xs text-neutral-500">Choose opening balance or leave the receipt unallocated on this customer account.</p><RecordPaymentForm customers={[{ id: customer.id, name: customer.companyName, balance: customer.currentBalance, openingBalance: openingBalanceOutstanding }]} cashBankAccounts={cashBankAccounts} /></div>}</div>
    </div>
  );
}
