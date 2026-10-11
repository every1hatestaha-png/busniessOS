import Link from "next/link";

import { OutboundGatePassDraftForm } from "@/components/gate-passes/gate-pass-draft-form";
import { requirePermission } from "@/lib/server/authorization";
import { db } from "@/lib/server/db";
import { requireOutboundGatePassDraftFeature } from "@/lib/server/outbound-gate-pass-feature";
import { getWarehouseStockMode, listActiveStockWarehouses } from "@/lib/server/managed-warehouse-stock";

export default async function NewOutboundGatePassPage() {
  requireOutboundGatePassDraftFeature();
  const { workspaceId } = await requirePermission("sales.create");
  const mode = await getWarehouseStockMode(workspaceId);
  const [customers, products, warehouses] = await Promise.all([
    db.customer.findMany({ where: { workspaceId, status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true, companyName: true } }),
    db.product.findMany({ where: { workspaceId, status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true, sku: true, unit: true, stockQuantity: true } }),
    mode === "MANAGED" ? listActiveStockWarehouses(workspaceId) : Promise.resolve([]),
  ]);
  return <div className="mx-auto max-w-5xl space-y-5">
    <div><Link href="/gate-passes" className="text-sm underline underline-offset-4">Gate passes</Link>
      <h1 className="mt-2 text-2xl font-bold">New outbound gate pass draft</h1>
      <p className="mt-1 text-sm text-muted-foreground">Enter the destination and goods. This is not a tax invoice or a dispatch authorization.</p></div>
    <OutboundGatePassDraftForm
      customers={customers.map((x) => ({ id: x.id, name: x.companyName || x.name }))}
      products={products.map((x) => ({ id: x.id, name: x.name, sku: x.sku || "", unit: x.unit, stockQuantity: x.stockQuantity.toString() }))}
      warehouses={warehouses.map((x) => ({ id: x.id, name: x.name, code: x.code }))}
      managedWarehouse={mode === "MANAGED"}
    />
  </div>;
}
