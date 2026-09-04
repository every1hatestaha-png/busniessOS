import { CircleDollarSign, Plus, ShieldAlert, Users } from "lucide-react";

import { EmptyState } from "@/components/business/empty-state";
import { MetricCard } from "@/components/business/metric-card";
import { PageHeader } from "@/components/business/page-header";
import { CustomerTable } from "@/components/customers/customer-table";
import { requireWorkspace } from "@/lib/server/auth";
import { listCustomers } from "@/lib/server/customers";
import { canPerformAction } from "@/lib/server/authorization";
import { formatPKR } from "@/lib/utils";

export default async function CustomersPage() {
  const { workspaceId, role } = await requireWorkspace();
  const customers = await listCustomers(workspaceId);
  const canWriteCustomers = canPerformAction(role, "customers.write");
  const receivable = customers.reduce((sum, customer) => sum + customer.currentBalance, 0);
  const restricted = customers.filter((customer) => customer.status !== "ACTIVE").length;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader title="Customers" description="Receivables, credit controls, and customer accounts." action={canWriteCustomers ? { label: "New customer", href: "/customers/new", icon: Plus } : undefined} />
      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Total receivable" value={formatPKR(receivable)} detail="Outstanding across customer accounts" icon={CircleDollarSign} />
        <MetricCard label="Customer accounts" value={String(customers.length)} detail="Live workspace records" icon={Users} />
        <MetricCard label="Restricted accounts" value={String(restricted)} detail="Inactive or blacklisted" icon={ShieldAlert} />
      </section>
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-3 text-sm font-medium"><Users className="h-4 w-4 text-neutral-500" />Customer register</div>
        {customers.length > 0 ? <CustomerTable customers={customers} /> : <div className="p-4"><EmptyState message="No customers have been added yet." href={canWriteCustomers ? "/customers/new" : undefined} action={canWriteCustomers ? "Add customer" : undefined} /></div>}
      </div>
    </div>
  );
}
