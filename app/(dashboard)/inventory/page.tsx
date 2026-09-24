import { AlertTriangle, Boxes, PackagePlus, Warehouse } from "lucide-react";
import { InventoryTable } from "@/components/inventory/inventory-table";
import { WarehouseTransfer } from "@/components/inventory/warehouse-transfer";
import { MetricCard } from "@/components/business/metric-card";
import { PageHeader } from "@/components/business/page-header";
import { listProducts } from "@/lib/server/products";
import { calculateInventoryValue, formatPKR } from "@/lib/utils";
import { isReorderAttentionNeeded } from "@/lib/stock-attention";
import { canPerformAction } from "@/lib/server/authorization";
import { requireWorkspace } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { getWarehouseStockMode, listActiveStockWarehouses } from "@/lib/server/managed-warehouse-stock";

export default async function InventoryPage() {
  const { workspaceId, role } = await requireWorkspace();
  const [products, warehouseMode] = await Promise.all([
    listProducts(workspaceId),
    getWarehouseStockMode(workspaceId),
  ]);
  const canWriteProducts = canPerformAction(role, "products.write");
  const canTransferStock = role === "OWNER" || role === "ADMIN" || role === "MANAGER";
  const warehouses = warehouseMode === "MANAGED" ? await listActiveStockWarehouses(workspaceId) : [];
  const warehouseBalances = warehouseMode === "MANAGED" && canTransferStock
    ? await db.$queryRaw<Array<{ warehouseId: string; warehouseName: string; warehouseCode: string; productId: string; quantity: string }>>`
        SELECT ws."warehouseId"::text AS "warehouseId",
               w."name" AS "warehouseName",
               w."code" AS "warehouseCode",
               ws."productId"::text AS "productId",
               ws."quantity"::text AS "quantity"
        FROM "warehouse_stocks" ws
        JOIN "warehouses" w ON w."id" = ws."warehouseId"
        WHERE ws."workspaceId" = ${workspaceId}::uuid
          AND w."isActive"=true
        ORDER BY w."isDefault" DESC, w."name" ASC
      `
    : [];
  const totalUnits = products.reduce((sum, product) => sum + product.stockQuantity, 0);
  const inventoryValue = products.reduce(
    (sum, product) => sum + calculateInventoryValue(product.stockQuantity, product.costPrice),
    0,
  );
  const lowStock = products.filter(
    (product) => product.status === "ACTIVE" && isReorderAttentionNeeded(product.stockQuantity, product.reorderLevel),
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
        <MetricCard label="Needs attention" value={`${lowStock} products`} detail="At or below configured reorder level" icon={AlertTriangle} />
      </section>
      {warehouseMode === "MANAGED" && canTransferStock && warehouses.length >= 2 && (
        <WarehouseTransfer
          products={products.filter((product) => product.status === "ACTIVE").map((product) => ({ id: product.id, name: product.name, sku: product.sku }))}
          warehouses={warehouses.map((warehouse) => ({ id: warehouse.id, name: warehouse.name, code: warehouse.code }))}
          balances={warehouseBalances.map((row) => ({ ...row, quantity: Number(row.quantity) }))}
        />
      )}
      <InventoryTable products={products} canCreate={canWriteProducts} />
    </main>
  );
}
