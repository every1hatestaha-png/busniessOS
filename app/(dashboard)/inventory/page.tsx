import { AlertTriangle, Boxes, PackagePlus, Warehouse } from "lucide-react";
import { InventoryTable } from "@/components/inventory/inventory-table";
import { MetricCard } from "@/components/business/metric-card";
import { PageHeader } from "@/components/business/page-header";
import { listProducts } from "@/lib/server/products";
import { calculateInventoryValue, formatPKR, getStockStatus } from "@/lib/utils";
import { canPerformAction } from "@/lib/server/authorization";
import { requireWorkspace } from "@/lib/server/auth";

export default async function InventoryPage() {
  const { workspaceId, role } = await requireWorkspace();
  const products = await listProducts(workspaceId);
  const canWriteProducts = canPerformAction(role, "products.write");
  const totalUnits = products.reduce((sum, product) => sum + product.stockQuantity, 0);
  const inventoryValue = products.reduce(
    (sum, product) => sum + calculateInventoryValue(product.stockQuantity, product.costPrice),
    0,
  );
  const lowStock = products.filter(
    (product) => getStockStatus(product.stockQuantity, product.reorderLevel) !== "In Stock",
  ).length;

  return (
    <main className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader
        title="Inventory"
        description="Track stock levels, pricing, and products that need attention."
        action={canWriteProducts ? { label: "New product", href: "/inventory/new", icon: PackagePlus } : undefined}
      />
      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Stock on hand" value={`${totalUnits} units`} detail={`${products.length} product lines`} icon={Boxes} />
        <MetricCard label="Inventory value" value={formatPKR(inventoryValue)} detail="Valued at current cost" icon={Warehouse} />
        <MetricCard label="Needs attention" value={`${lowStock} products`} detail="At or below reorder level" icon={AlertTriangle} />
      </section>
      <InventoryTable products={products} canCreate={canWriteProducts} />
    </main>
  );
}
