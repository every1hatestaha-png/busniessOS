import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { SupplierForm } from "@/components/suppliers/supplier-form";
import { requirePermission } from "@/lib/server/authorization";

export default async function NewSupplierPage() {
  await requirePermission("financial.manage");
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div><Link href="/suppliers" className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900"><ChevronLeft className="h-4 w-4" />Suppliers</Link><h1 className="text-2xl font-bold tracking-tight md:text-3xl">Add supplier</h1><p className="mt-1 text-sm text-neutral-500">Create a supplier profile and optionally record an existing payable balance.</p></div>
      <SupplierForm />
    </div>
  );
}
