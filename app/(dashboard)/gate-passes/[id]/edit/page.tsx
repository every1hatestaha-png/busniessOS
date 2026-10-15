import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OutboundGatePassDraftForm } from "@/components/gate-passes/gate-pass-draft-form";
import { requirePermission } from "@/lib/server/authorization";
import { requireOutboundGatePassDraftFeature } from "@/lib/server/outbound-gate-pass-feature";
import { getOutboundGatePass } from "@/lib/server/outbound-gate-passes";
import { getWarehouseStockMode, listActiveStockWarehouses } from "@/lib/server/managed-warehouse-stock";
import { db } from "@/lib/server/db";

export default async function EditOutboundGatePassPage({params}:{params:Promise<{id:string}>}) {
  const {workspaceId} = await requirePermission("sales.create");
  requireOutboundGatePassDraftFeature(workspaceId);
  const {id} = await params;
  const gp = await getOutboundGatePass(workspaceId,id);
  if (!gp) notFound();
  if (gp.status !== "DRAFT" || gp.issueStockDeductedAt) redirect(`/gate-passes/${gp.id}`);
  const mode = await getWarehouseStockMode(workspaceId);
  const [customers,products,warehouses] = await Promise.all([
    db.customer.findMany({where:{workspaceId,status:"ACTIVE"},orderBy:{name:"asc"},select:{id:true,name:true,companyName:true}}),
    db.product.findMany({where:{workspaceId,status:"ACTIVE"},orderBy:{name:"asc"},select:{id:true,name:true,sku:true,unit:true,stockQuantity:true}}),
    mode === "MANAGED" ? listActiveStockWarehouses(workspaceId) : Promise.resolve([]),
  ]);
  return <div className="mx-auto max-w-5xl space-y-5">
    <header><Link href={`/gate-passes/${gp.id}`} className="text-sm underline">Back to gate pass</Link><h1 className="mt-2 text-2xl font-bold">Edit draft {gp.gatePassNumber}</h1><p className="text-sm text-muted-foreground">Changes are allowed until issue. Saving does not move inventory or post accounting entries.</p></header>
    <OutboundGatePassDraftForm key={`${gp.id}:${gp.version}`}
      customers={customers.map(c=>({id:c.id,name:c.companyName||c.name}))}
      products={products.map(p=>({id:p.id,name:p.name,sku:p.sku??"",unit:p.unit,stockQuantity:p.stockQuantity.toString()}))}
      warehouses={warehouses.map(w=>({id:w.id,name:w.name,code:w.code}))}
      managedWarehouse={mode === "MANAGED"} idempotencyKey={gp.idempotencyKey}
      editing={{gatePassId:gp.id,version:gp.version,customerId:gp.customerId,warehouseId:gp.warehouseId??"",date:gp.gatePassDate.toISOString().slice(0,10),deliveryAddress:gp.deliveryAddress??"",notes:gp.notes??"",items:gp.items.map(i=>({productId:i.productId,quantity:i.dispatchedQuantity.toString()}))}}
    />
  </div>;
}
