import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

import { outboundGatePassDraftSchema, type OutboundGatePassDraftInput } from "@/lib/delivery-acceptance/draft-validation";
import { db } from "@/lib/server/db";
import { nextDocumentNumber } from "@/lib/server/document-numbers";
import { getWarehouseStockModeInTransaction, assertManagedWarehouseSelection } from "@/lib/server/managed-warehouse-stock";
import { withSerializableRetry } from "@/lib/server/tx-retry";
import { writeAudit } from "@/lib/server/audit";

export class OutboundGatePassDomainError extends Error {}

type Context = { workspaceId: string; userId: string };

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

export async function createOutboundGatePassDraft(context: Context, input: OutboundGatePassDraftInput) {
  const data = outboundGatePassDraftSchema.parse(input);
  const fingerprint = requestFingerprint(data);

  async function readExisting() {
    const existing = await db.outboundGatePass.findFirst({
      where: { workspaceId: context.workspaceId, idempotencyKey: data.idempotencyKey },
      select: { id: true, requestFingerprint: true },
    });
    if (existing && existing.requestFingerprint !== fingerprint) {
      throw new OutboundGatePassDomainError("This submission key was already used for another gate pass.");
    }
    return existing;
  }

  const existing = await readExisting();
  if (existing) return { id: existing.id };

  try {
    return await withSerializableRetry(async (tx) => {
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

      const customer = await tx.customer.findFirst({
        where: { id: data.customerId, workspaceId: context.workspaceId, status: "ACTIVE" },
        select: { id: true },
      });
      if (!customer) throw new OutboundGatePassDomainError("Choose an active customer in this workspace.");

      const mode = await getWarehouseStockModeInTransaction(tx, context.workspaceId);
      const warehouseId = data.warehouseId || null;
      if (mode === "MANAGED" && !warehouseId) {
        throw new OutboundGatePassDomainError("Choose the source warehouse.");
      }
      if (mode === "LEGACY" && warehouseId) {
        throw new OutboundGatePassDomainError("Warehouse selection is not enabled for this workspace.");
      }
      if (mode === "MANAGED") {
        await assertManagedWarehouseSelection(tx, {
          workspaceId: context.workspaceId,
          warehouseId,
        });
      }

      const ids = data.items.map((item) => item.productId);
      const products = await tx.product.findMany({
        where: { workspaceId: context.workspaceId, id: { in: ids }, status: "ACTIVE" },
        select: { id: true, name: true, sku: true, unit: true },
      });
      if (products.length !== ids.length) {
        throw new OutboundGatePassDomainError("One or more products are unavailable in this workspace.");
      }
      const byId = new Map(products.map((product) => [product.id, product]));
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
  return db.outboundGatePass.findFirst({
    where: { workspaceId, id },
    include: {
      customer: { select: { companyName: true, name: true, phone: true, address: true } },
      items: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    },
  });
}
