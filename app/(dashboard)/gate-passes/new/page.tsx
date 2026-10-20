import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { OutboundGatePassDraftForm } from "@/components/gate-passes/gate-pass-draft-form";
import { requirePermission } from "@/lib/server/authorization";
import { db } from "@/lib/server/db";
import { requireOutboundGatePassDraftFeature } from "@/lib/server/outbound-gate-pass-feature";
import { getOutboundGatePass } from "@/lib/server/outbound-gate-passes";
import { getWarehouseStockMode, listActiveStockWarehouses } from "@/lib/server/managed-warehouse-stock";

export default async function NewOutboundGatePassPage({
  searchParams,
}: {
  searchParams: Promise<{ copyFrom?: string | string[] }>;
}) {
  const { workspaceId } = await requirePermission("sales.create");
  requireOutboundGatePassDraftFeature(workspaceId);
  const { copyFrom } = await searchParams;
  // Never trust a copied document identifier from the URL: apply the exact
  // current tenant scope and never duplicate an in-transit shipment.
  if (copyFrom !== undefined && (typeof copyFrom !== "string" || !z.string().uuid().safeParse(copyFrom).success)) notFound();
  const source = copyFrom ? await getOutboundGatePass(workspaceId, copyFrom) : null;
  if (copyFrom && (!source || !["ISSUED", "CANCELLED"].includes(source.status) || source.dispatchedAt)) notFound();
  const mode = await getWarehouseStockMode(workspaceId);
  const [customers, products, warehouses] = await Promise.all([
    db.customer.findMany({ where: { workspaceId, status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true, companyName: true } }),
    db.product.findMany({ where: { workspaceId, status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true, sku: true, unit: true, stockQuantity: true } }),
    mode === "MANAGED" ? listActiveStockWarehouses(workspaceId) : Promise.resolve([]),
  ]);
  const copyReady = Boolean(source)
    && customers.some((customer) => customer.id === source!.customerId)
    && source!.items.length > 0
    && source!.items.every((item) => products.some((product) => product.id === item.productId))
    && (mode !== "MANAGED" || warehouses.some((warehouse) => warehouse.id === source!.warehouseId));
  const initialDraft = source && copyReady ? {
    customerId: source.customerId,
    warehouseId: source.warehouseId ?? "",
    // Never backdate a new Gate Pass simply because it was based on a prior one.
    date: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Karachi" }),
    deliveryAddress: source.deliveryAddress ?? "",
    notes: `Replacement draft based on ${source.gatePassNumber}. ${source.notes ?? ""}`.trim().slice(0, 500),
    items: source.items.map((item) => ({
      productId: item.productId, quantity: item.dispatchedQuantity.toString(),
    })),
  } : undefined;
  return <div className="mx-auto max-w-5xl space-y-5">
    <div><Link href="/gate-passes" className="text-sm underline underline-offset-4">Gate passes</Link>
      <h1 className="mt-2 text-2xl font-bold">New outbound gate pass draft</h1>
      <p className="mt-1 text-sm text-muted-foreground">Enter the destination and goods. This is not a tax invoice or a dispatch authorization.</p></div>
    {source && <div role="status" className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="font-semibold">Prepare a separate replacement draft from {source.gatePassNumber}</p>
      {copyReady
        ? <p>Review the current inventory and reduce quantities if needed. Saving this draft does not cancel, edit, reserve stock for, or dispatch the original Gate Pass. Cancel the old unshipped document separately if it is no longer valid.</p>
        : <p>Some original customer, products or source warehouse are no longer active. Select current valid details manually. The original Gate Pass remains unchanged.</p>}
      <Link className="mt-2 inline-block underline underline-offset-2" href={`/gate-passes/${source.id}`}>Return to original Gate Pass</Link>
    </div>}
    <OutboundGatePassDraftForm
      customers={customers.map((x) => ({ id: x.id, name: x.companyName || x.name }))}
      products={products.map((x) => ({ id: x.id, name: x.name, sku: x.sku || "", unit: x.unit, stockQuantity: x.stockQuantity.toString() }))}
      warehouses={warehouses.map((x) => ({ id: x.id, name: x.name, code: x.code }))}
      managedWarehouse={mode === "MANAGED"}
      idempotencyKey={randomUUID()}
      initialDraft={initialDraft}
    />
  </div>;
}
