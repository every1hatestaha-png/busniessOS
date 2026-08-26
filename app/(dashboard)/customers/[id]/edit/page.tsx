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
      <div><Link href={`/customers/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900"><ChevronLeft className="h-4 w-4" />Customer details</Link><h1 className="text-2xl font-bold tracking-tight md:text-3xl">Edit customer</h1><p className="mt-1 text-sm text-neutral-500">Update contact, account, and credit-limit details.</p></div>
      <CustomerForm customer={{ ...customer, creditLimit: String(customer.creditLimit) }} />
    </div>
  );
}
