import { AlertTriangle, Boxes, PackagePlus, Warehouse } from "lucide-react";
import { InventoryTable } from "@/components/inventory/inventory-table";
import { MetricCard } from "@/components/business/metric-card";
import { PageHeader } from "@/components/business/page-header";
import { listProducts } from "@/lib/server/products";
import { calculateInventoryValue, formatPKR, getStockStatus } from "@/lib/utils";

export default async function InventoryPage() {
  const products = await listProducts();
  const totalUnits = products.reduce((sum, product) => sum + product.stockQuantity, 0);
  const inventoryValue = products.reduce(
    (sum, product) => sum + calculateInventoryValue(product.stockQuantity, product.costPrice),
    0,
  );
  const lowStock = products.filter(
    (product) => getStockStatus(product.stockQuantity, product.reorderLevel) !== "In Stock",
  ).length;

  return (
    <main className="space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title="Inventory"
        description="Track stock levels, pricing, and products that need attention."
        action={{ label: "New product", href: "/inventory/new", icon: PackagePlus }}
      />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="Stock on hand" value={`${totalUnits} units`} detail={`${products.length} product lines`} icon={Boxes} />
        <MetricCard label="Inventory value" value={formatPKR(inventoryValue)} detail="Valued at current cost" icon={Warehouse} />
        <MetricCard label="Needs attention" value={`${lowStock} products`} detail="At or below reorder level" icon={AlertTriangle} />
      </section>
      <InventoryTable products={products} />
    </main>
  );
}
