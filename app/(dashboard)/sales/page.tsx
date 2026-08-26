import { Plus } from "lucide-react";
import { PageHeader } from "@/components/business/page-header";
import { SalesList } from "@/components/sales/sales-list";
import { requireWorkspace } from "@/lib/server/auth";
import { listSales } from "@/lib/server/sales";

export default async function SalesPage() {
  const { workspaceId } = await requireWorkspace();
  const sales = await listSales(workspaceId);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <PageHeader title="Sales orders" description="Track orders, collections, and customer balances." action={{ label: "New order", href: "/sales/new", icon: Plus }} />
      <SalesList sales={sales} />
    </div>
  );
}
