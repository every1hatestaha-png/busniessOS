import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomerForm } from "@/components/customers/customer-form";
import { requirePermission } from "@/lib/server/authorization";
import { getCustomer } from "@/lib/server/customers";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId } = await requirePermission("customers.write");
  const customer = await getCustomer(workspaceId, id);
  if (!customer) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div><Link href={`/customers/${id}`} className="mb-2 inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900"><ChevronLeft className="h-3.5 w-3.5" />Customer details</Link><h1 className="text-xl font-semibold tracking-tight">Edit customer</h1><p className="mt-0.5 text-xs text-neutral-500">Update contact, account, and credit-limit details.</p></div>
      <CustomerForm customer={{ ...customer, creditLimit: String(customer.creditLimit) }} />
    </div>
  );
}
