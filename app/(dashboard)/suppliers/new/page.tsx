import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { SupplierForm } from "@/components/suppliers/supplier-form";
import { requirePermission } from "@/lib/server/authorization";

export default async function NewSupplierPage() {
  await requirePermission("financial.manage");
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div><Link href="/suppliers" className="mb-2 inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900"><ChevronLeft className="h-3.5 w-3.5" />Suppliers</Link><h1 className="text-xl font-semibold tracking-tight">Add supplier</h1><p className="mt-0.5 text-xs text-neutral-500">Create a supplier profile and optionally record an existing payable balance.</p></div>
      <SupplierForm />
    </div>
  );
}
