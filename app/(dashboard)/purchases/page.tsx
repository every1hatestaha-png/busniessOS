import { Plus } from "lucide-react";
import { PageHeader } from "@/components/business/page-header";
import { PurchaseList } from "@/components/purchases/purchase-list";
import { requireWorkspace } from "@/lib/server/auth";
import { listPurchases } from "@/lib/server/purchases";
import { canPerformAction } from "@/lib/server/authorization";

export default async function PurchasesPage() {
  const { workspaceId, role } = await requireWorkspace();
  const purchases = await listPurchases(workspaceId);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader
        title="Purchases"
        description="Purchase orders, receiving progress, and supplier payables."
        action={canPerformAction(role, "financial.manage") ? { label: "New Purchase", href: "/purchases/new", icon: Plus } : undefined}
      />
      <PurchaseList purchases={purchases} />
    </div>
  );
}
