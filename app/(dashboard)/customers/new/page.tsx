import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { CustomerForm } from "@/components/customers/customer-form";
import { requirePermission } from "@/lib/server/authorization";

export default async function NewCustomerPage() {
  await requirePermission("customers.write");
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div><Link href="/customers" className="mb-2 inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900"><ChevronLeft className="h-3.5 w-3.5" />Customers</Link><h1 className="text-xl font-semibold tracking-tight">Add customer</h1><p className="mt-0.5 text-xs text-neutral-500">Create a customer profile and opening credit position.</p></div>
      <CustomerForm />
    </div>
  );
}
