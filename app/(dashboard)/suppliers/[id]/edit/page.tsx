import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SupplierForm } from "@/components/suppliers/supplier-form";
import { requirePermission } from "@/lib/server/authorization";
import { getSupplier } from "@/lib/server/suppliers";

export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId } = await requirePermission("financial.manage");
  const supplier = await getSupplier(workspaceId, id);
  if (!supplier) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div><Link href={`/suppliers/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900"><ChevronLeft className="h-4 w-4" />Supplier details</Link><h1 className="text-2xl font-bold tracking-tight md:text-3xl">Edit supplier</h1><p className="mt-1 text-sm text-neutral-500">Update contact and account details. The payable balance is unaffected.</p></div>
      <SupplierForm supplier={{ id: supplier.id, name: supplier.name, companyName: supplier.companyName ?? "", phone: supplier.phone ?? "", email: supplier.email ?? "", address: supplier.address ?? "", city: supplier.city ?? "", notes: supplier.notes ?? "" }} />
    </div>
  );
}
