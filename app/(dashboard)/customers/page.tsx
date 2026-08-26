import Link from "next/link";
import { Plus, Users } from "lucide-react";

import { EmptyState } from "@/components/business/empty-state";
import { CustomerTable } from "@/components/customers/customer-table";
import { buttonVariants } from "@/components/ui/button";
import { requireWorkspace } from "@/lib/server/auth";
import { listCustomers } from "@/lib/server/customers";

export default async function CustomersPage() {
  const { workspaceId } = await requireWorkspace();
  const customers = await listCustomers(workspaceId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-bold tracking-tight text-neutral-950 md:text-3xl">Customers</h1><p className="mt-1 text-sm text-neutral-500">{customers.length} customers in your directory</p></div><Link href="/customers/new" className={buttonVariants()}><Plus className="h-4 w-4" />Add customer</Link></div>
      <div className="rounded-xl border border-neutral-200 bg-white">
        <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-3 text-sm font-medium">
          <Users className="h-4 w-4 text-neutral-500" /> Customer directory
        </div>
        {customers.length > 0 ? <CustomerTable customers={customers} /> : <div className="p-4"><EmptyState message="No customers have been added yet." href="/customers/new" action="Add customer" /></div>}
      </div>
    </div>
  );
}
