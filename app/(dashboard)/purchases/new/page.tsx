import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PurchaseForm } from "@/components/purchases/purchase-form";
import { requirePermission } from "@/lib/server/authorization";
import { db } from "@/lib/server/db";

export default async function NewPurchasePage() {
  const { workspaceId } = await requirePermission("financial.manage");
  const [suppliers, products] = await Promise.all([
    db.supplier.findMany({ where: { workspaceId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.product.findMany({ where: { workspaceId, status: "ACTIVE" }, select: { id: true, name: true, unit: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div>
        <Link href="/purchases" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900">
          <ArrowLeft className="size-3.5" />Purchases
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">New Purchase Order</h1>
        <p className="mt-0.5 text-xs text-slate-500">Creates an order commitment only. Inventory and payable are recorded through a GRN.</p>
      </div>
      <PurchaseForm suppliers={suppliers} products={products} />
    </div>
  );
}
