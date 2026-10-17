import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

import { outboundGatePassDraftSchema, outboundGatePassDraftEditSchema, type OutboundGatePassDraftInput, type OutboundGatePassDraftEditInput } from "@/lib/delivery-acceptance/draft-validation";
import { outboundGatePassDraftFeatureEnabled } from "@/lib/server/outbound-gate-pass-feature";
import { db } from "@/lib/server/db";
import { nextDocumentNumber } from "@/lib/server/document-numbers";
import { getWarehouseStockModeInTransaction, assertManagedWarehouseSelection } from "@/lib/server/managed-warehouse-stock";
import { withSerializableRetry } from "@/lib/server/tx-retry";
import { writeAudit } from "@/lib/server/audit";
import { assertOutboundGatePassActor } from "@/lib/server/outbound-gate-pass-actor";

export class OutboundGatePassDomainError extends Error {}

type Context = { workspaceId: string; userId: string };

function assertWorkspaceGatePassEnabled(workspaceId: string): void {
  if (!outboundGatePassDraftFeatureEnabled(workspaceId)) {
    throw new OutboundGatePassDomainError("Gate pass workflow is not enabled for this workspace.");
  }
}

function requestFingerprint(data: ReturnType<typeof outboundGatePassDraftSchema.parse>) {
  // Canonicalize item ordering so harmless form reordering is replay-safe.
  const canonical = {
    customerId: data.customerId,
    warehouseId: data.warehouseId,
    date: data.date,
    deliveryAddress: data.deliveryAddress,
    notes: data.notes,
    items: [...data.items].sort((a, b) => a.productId.localeCompare(b.productId)),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

async function draftReferences(tx: Prisma.TransactionClient, context: Context, data: ReturnType<typeof outboundGatePassDraftSchema.parse>) {
  const customer = await tx.customer.findFirst({where:{id:data.customerId,workspaceId:context.workspaceId,status:"ACTIVE"},select:{id:true}});
  if (!customer) throw new OutboundGatePassDomainError("Choose an active customer in this workspace.");
  const mode = await getWarehouseStockModeInTransaction(tx,context.workspaceId);
  const warehouseId = data.warehouseId || null;
  if (mode === "MANAGED" && !warehouseId) throw new OutboundGatePassDomainError("Choose the source warehouse.");
  if (mode === "LEGACY" && warehouseId) throw new OutboundGatePassDomainError("Warehouse selection is not enabled for this workspace.");
  if (mode === "MANAGED") await assertManagedWarehouseSelection(tx,{workspaceId:context.workspaceId,warehouseId});
  const products = await tx.product.findMany({where:{workspaceId:context.workspaceId,id:{in:data.items.map(i=>i.productId)},status:"ACTIVE"},select:{id:true,name:true,sku:true,unit:true}});
  if (products.length !== data.items.length) throw new OutboundGatePassDomainError("One or more products are unavailable in this workspace.");
  return { customer, warehouseId, byId: new Map(products.map(product=>[product.id,product])) };
}

export async function updateOutboundGatePassDraft(context: Context, input: OutboundGatePassDraftEditInput) {
  assertWorkspaceGatePassEnabled(context.workspaceId);
  const data = outboundGatePassDraftEditSchema.parse(input);
  return withSerializableRetry(async tx => {
    await assertOutboundGatePassActor(tx,context,"sales.create");
    const locked = await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM outbound_gate_passes WHERE id=${data.gatePassId} AND "workspaceId"=${context.workspaceId} FOR UPDATE`;
    if (locked.length !== 1) throw new OutboundGatePassDomainError("Gate pass not found.");
    const gp = await tx.outboundGatePass.findFirstOrThrow({where:{id:data.gatePassId,workspaceId:context.workspaceId},include:{items:true}});
    if (gp.status !== "DRAFT" || gp.issueStockDeductedAt) throw new OutboundGatePassDomainError("Only an unissued draft can be edited.");
    if (data.idempotencyKey !== gp.idempotencyKey) throw new OutboundGatePassDomainError("Draft identity changed. Refresh and try again.");
    const normalize = (items: Array<{productId:string;quantity:string}>) => items.map(i=>({...i,quantity:new Prisma.Decimal(i.quantity).toString()}));
    const existing = requestFingerprint({customerId:gp.customerId,warehouseId:gp.warehouseId??"",date:gp.gatePassDate.toISOString().slice(0,10),deliveryAddress:gp.deliveryAddress??"",notes:gp.notes??"",idempotencyKey:gp.idempotencyKey,items:normalize(gp.items.map(i=>({productId:i.productId,quantity:i.dispatchedQuantity.toString()})))});
    if (existing === requestFingerprint({...data,items:normalize(data.items)})) return {id:gp.id};
    if (gp.version !== data.version) throw new OutboundGatePassDomainError("This draft changed in another tab. Refresh before editing.");
    const {customer,warehouseId,byId} = await draftReferences(tx,context,data);
    await tx.outboundGatePassItem.deleteMany({where:{gatePassId:gp.id,gatePass:{workspaceId:context.workspaceId}}});
    await tx.outboundGatePass.update({where:{id:gp.id,workspaceId:context.workspaceId},data:{
      customerId:customer.id,warehouseId,gatePassDate:new Date(data.date+"T12:00:00.000Z"),deliveryAddress:data.deliveryAddress||null,notes:data.notes||null,version:{increment:1},
      items:{create:data.items.map(item=>{const product=byId.get(item.productId)!;return {productId:product.id,productNameSnapshot:product.name,productSkuSnapshot:product.sku,productUnitSnapshot:product.unit,dispatchedQuantity:new Prisma.Decimal(item.quantity)};})},
    }});
    // Keep the original creation fingerprint/key: a create replay cannot overwrite an edit.
    await writeAudit(tx,{workspaceId:context.workspaceId,actorId:context.userId,action:"GATE_PASS_DRAFT_UPDATED",entityType:"OutboundGatePass",entityId:gp.id,metadata:{gatePassNumber:gp.gatePassNumber,version:gp.version+1,itemCount:data.items.length}});
    return {id:gp.id};
  });
}

export async function createOutboundGatePassDraft(context: Context, input: OutboundGatePassDraftInput) {
  assertWorkspaceGatePassEnabled(context.workspaceId);
  const data = outboundGatePassDraftSchema.parse(input);
  const fingerprint = requestFingerprint(data);

  async function readExisting() {
    return withSerializableRetry(async (tx) => {
      await assertOutboundGatePassActor(tx, context, "sales.create");
      const existing = await tx.outboundGatePass.findFirst({
        where: { workspaceId: context.workspaceId, idempotencyKey: data.idempotencyKey },
        select: { id: true, requestFingerprint: true },
      });
      if (existing && existing.requestFingerprint !== fingerprint) {
        throw new OutboundGatePassDomainError("This submission key was already used for another gate pass.");
      }
      return existing;
    });
  }

  const existing = await readExisting();
  if (existing) return { id: existing.id };

  try {
    return await withSerializableRetry(async (tx) => {
      await assertOutboundGatePassActor(tx, context, "sales.create");
      const prior = await tx.outboundGatePass.findFirst({
        where: { workspaceId: context.workspaceId, idempotencyKey: data.idempotencyKey },
        select: { id: true, requestFingerprint: true },
      });
      if (prior) {
        if (prior.requestFingerprint !== fingerprint) {
          throw new OutboundGatePassDomainError("This submission key was already used for another gate pass.");
        }
        return { id: prior.id };
      }

      const { customer, warehouseId, byId } = await draftReferences(tx,context,data);
      const gatePassNumber = await nextDocumentNumber(tx, context.workspaceId, "GATE_PASS");

      const created = await tx.outboundGatePass.create({
        data: {
          workspaceId: context.workspaceId,
          customerId: customer.id,
          warehouseId,
          gatePassNumber,
          status: "DRAFT",
          gatePassDate: new Date(data.date + "T12:00:00.000Z"),
          deliveryAddress: data.deliveryAddress || null,
          notes: data.notes || null,
          idempotencyKey: data.idempotencyKey,
          requestFingerprint: fingerprint,
          createdById: context.userId,
          items: {
            create: data.items.map((item) => {
              const product = byId.get(item.productId)!;
              return {
                productId: product.id,
                productNameSnapshot: product.name,
                productSkuSnapshot: product.sku,
                productUnitSnapshot: product.unit,
                dispatchedQuantity: new Prisma.Decimal(item.quantity),
              };
            }),
          },
        },
        select: { id: true },
      });
      await writeAudit(tx, {
        workspaceId: context.workspaceId,
        actorId: context.userId,
        action: "GATE_PASS_DRAFT_CREATED",
        entityType: "OutboundGatePass",
        entityId: created.id,
        metadata: { gatePassNumber, itemCount: data.items.length },
      });
      return { id: created.id };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const concurrentlyCreated = await readExisting();
      if (concurrentlyCreated) return { id: concurrentlyCreated.id };
    }
    throw error;
  }
}

export async function listOutboundGatePasses(workspaceId: string) {
  assertWorkspaceGatePassEnabled(workspaceId);
  return db.outboundGatePass.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      customer: { select: { companyName: true, name: true } },
      _count: { select: { items: true } },
    },
  });
}

export async function getOutboundGatePass(workspaceId: string, id: string) {
  assertWorkspaceGatePassEnabled(workspaceId);
  return db.outboundGatePass.findFirst({
    where: { workspaceId, id },
    include: {
      customer: { select: { companyName: true, name: true, phone: true, address: true } },
      items: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    },
  });
}
