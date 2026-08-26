import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, CircleDollarSign, CreditCard, ShoppingCart } from "lucide-react";

import { MetricCard } from "@/components/business/metric-card";
import { StatusBadge } from "@/components/business/status-badge";
import { CustomerDetailsTabs } from "@/components/customers/customer-details-tabs";
import { requireWorkspace } from "@/lib/server/auth";
import { getCustomer } from "@/lib/server/customers";
import { formatPKR, getCreditStatus } from "@/lib/utils";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId } = await requireWorkspace();
  const customer = await getCustomer(workspaceId, id);
  if (!customer) notFound();
  const usage = customer.creditLimit ? Math.round((customer.currentBalance / customer.creditLimit) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/customers" className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900"><ChevronLeft className="h-4 w-4" />Customers</Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">{customer.companyName}</h1><p className="mt-1 text-sm text-neutral-500">{customer.name}, {customer.city}</p></div><div className="flex gap-2"><StatusBadge status={customer.status} /><StatusBadge status={getCreditStatus(customer.currentBalance, customer.creditLimit)} /></div></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Outstanding balance" value={formatPKR(customer.currentBalance)} detail="Amount currently receivable" icon={CircleDollarSign} />
        <MetricCard label="Credit usage" value={`${usage}%`} detail={`${formatPKR(Math.max(0, customer.creditLimit - customer.currentBalance))} available`} icon={CreditCard} />
        <MetricCard label="Total sales" value={formatPKR(customer.totalSales)} detail="Lifetime sales" icon={ShoppingCart} />
        <MetricCard label="Total payments" value={formatPKR(customer.totalPayments)} detail="Lifetime receipts" icon={CircleDollarSign} />
      </div>
      <CustomerDetailsTabs customer={customer} />
    </div>
  );
}
