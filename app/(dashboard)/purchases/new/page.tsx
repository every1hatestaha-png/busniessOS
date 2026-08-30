import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { PurchaseForm } from "@/components/purchases/purchase-form";
import { requirePermission } from "@/lib/server/authorization";
import { getCashBankAccounts } from "@/lib/server/accounting";
import { db } from "@/lib/server/db";

export default async function NewPurchasePage() {
  const { workspaceId } = await requirePermission("financial.manage");
  const [suppliers, products, cashBankAccounts] = await Promise.all([
    db.supplier.findMany({ where: { workspaceId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.product.findMany({ where: { workspaceId, status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getCashBankAccounts(workspaceId),
  ]);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div><Link href="/purchases" className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900"><ChevronLeft className="h-4 w-4" />Purchases</Link><h1 className="text-2xl font-bold tracking-tight md:text-3xl">Receive purchase</h1><p className="mt-1 text-sm text-neutral-500">Record received stock and the supplier payable in one atomic step.</p></div>
      <PurchaseForm suppliers={suppliers} products={products} cashBankAccounts={cashBankAccounts} />
    </div>
  );
}
