import "server-only";

import type { ProductStatus, ProductUnit, Role } from "@prisma/client";
import type { z } from "zod";

import { requireWorkspace } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { postInventoryAdjustmentToGeneralLedger, postOpeningAssetToGeneralLedger } from "@/lib/server/accounting";
import { Prisma } from "@prisma/client";
import { productEditSchema, productSchema } from "@/lib/validation/product";
import { canPerformAction } from "@/lib/server/authorization";
import { withSerializableRetry } from "@/lib/server/tx-retry";
import { writeAudit } from "@/lib/server/audit";

type ProductData = z.output<typeof productSchema>;
type ProductEditData = z.output<typeof productEditSchema>;
type ProductMutationContext = { workspaceId: string; role: Role; userId?: string };

export class ProductDomainError extends Error {
  constructor(
    public readonly code: "PRODUCT_NOT_FOUND" | "PERMISSION_DENIED" | "INVALID_COST_PRICE",
    message: string,
  ) {
    super(message);
  }
}

export type RemoveProductResult = { disposition: "DELETED" | "ARCHIVED"; message: string };

export type ProductDTO = {
  id: string;
  name: string;
  sku: string;
  description: string;
  category: string;
  costPrice: number;
  sellingPrice: number;
  stockQuantity: number;
  reorderLevel: number;
  unit: ProductUnit;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
};

export type StockMovementDTO = {
  id: string;
  type: string;
  quantity: number;
  reference: string | null;
  date: string;
  balance: number;
};

export type ProductDetailDTO = ProductDTO & {
  movements: StockMovementDTO[];
};

function toProductDTO(product: {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  category: string | null;
  costPrice: { toNumber(): number };
  sellingPrice: { toNumber(): number };
  stockQuantity: { toNumber(): number };
  reorderLevel: { toNumber(): number };
  unit: ProductUnit;
  status: ProductStatus;
  createdAt: Date;
  updatedAt: Date;
}): ProductDTO {
  return {
    ...product,
    sku: product.sku ?? "",
    description: product.description ?? "",
    category: product.category ?? "Uncategorized",
    costPrice: product.costPrice.toNumber(),
    sellingPrice: product.sellingPrice.toNumber(),
    stockQuantity: product.stockQuantity.toNumber(),
    reorderLevel: product.reorderLevel.toNumber(),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export async function listProducts(authorizedWorkspaceId?: string): Promise<ProductDTO[]> {
  const workspaceId = authorizedWorkspaceId ?? (await requireWorkspace()).workspaceId;
  const products = await db.product.findMany({
    where: { workspaceId },
    orderBy: [{ name: "asc" }, { createdAt: "desc" }],
  });

  return products.map(toProductDTO);
}

export async function getProduct(id: string, authorizedWorkspaceId?: string): Promise<ProductDetailDTO | null> {
  const workspaceId = authorizedWorkspaceId ?? (await requireWorkspace()).workspaceId;
  const product = await db.product.findFirst({
    where: { id, workspaceId },
    include: {
      inventoryTransactions: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!product) return null;

  let balance = product.stockQuantity.toNumber();
  const movements = product.inventoryTransactions.map((movement) => {
    const movementDTO: StockMovementDTO = {
      id: movement.id,
      type: movement.type,
      quantity: movement.quantityChanged.toNumber(),
      reference: movement.reference,
      date: movement.createdAt.toISOString(),
      balance,
    };
    balance -= movement.quantityChanged.toNumber();
    return movementDTO;
  });

  return { ...toProductDTO(product), movements };
}

export async function createProduct(workspaceId: string, input: ProductData): Promise<string> {
  return db.$transaction(async (transaction) => {
    const product = await transaction.product.create({
      data: {
        workspaceId,
        name: input.name,
        sku: input.sku,
        category: input.category,
        costPrice: input.costPrice,
        sellingPrice: input.sellingPrice,
        stockQuantity: input.stockQuantity,
        reorderLevel: input.reorderLevel,
        unit: input.unit,
        status: input.status,
        description: input.description,
      },
    });

    await transaction.inventoryTransaction.create({
      data: {
        workspaceId,
        productId: product.id,
        type: "OPENING_STOCK",
        quantityChanged: input.stockQuantity,
        unitCost: input.costPrice,
        reference: "Opening stock",
      },
    });
    if (input.stockQuantity > 0 && input.costPrice > 0) await postOpeningAssetToGeneralLedger(transaction, { workspaceId, sourceId: product.id, documentNo: `OPEN-STOCK-${product.id.slice(0, 8).toUpperCase()}`, date: new Date(), assetSystemCode: "INVENTORY", amount: new Prisma.Decimal(input.costPrice).mul(input.stockQuantity) });

    return product.id;
  }, { timeout: 30_000 });
}

export async function updateProduct(
  context: ProductMutationContext,
  id: string,
  input: ProductEditData,
): Promise<void> {
  if (!canPerformAction(context.role, "products.write")) throw new ProductDomainError("PERMISSION_DENIED", "Unauthorized");
  await withSerializableRetry(async (tx) => {
    const existing = await tx.product.findFirst({ where: { id, workspaceId: context.workspaceId }, select: { stockQuantity: true, costPrice: true } });
    if (!existing) throw new ProductDomainError("PRODUCT_NOT_FOUND", "Product not found.");
    if (!existing.stockQuantity.isZero() && !existing.costPrice.equals(input.costPrice)) {
      throw new ProductDomainError("INVALID_COST_PRICE", "Cost price cannot be changed while stock is on hand. Receive stock or adjust quantity through an auditable inventory transaction.");
    }
    await tx.product.update({
      where: { id, workspaceId: context.workspaceId },
      data: {
        name: input.name,
        sku: input.sku,
        category: input.category,
        costPrice: input.costPrice,
        sellingPrice: input.sellingPrice,
        reorderLevel: input.reorderLevel,
        unit: input.unit,
        status: input.status,
        description: input.description,
      },
    });
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "product.updated", entityType: "Product", entityId: id, metadata: { status: input.status } });
  });
}

export async function archiveProduct(context: ProductMutationContext, id: string): Promise<void> {
  if (!canPerformAction(context.role, "products.write")) throw new ProductDomainError("PERMISSION_DENIED", "Unauthorized");
  await withSerializableRetry(async (tx) => {
    const existing = await tx.product.findFirst({ where: { id, workspaceId: context.workspaceId }, select: { id: true, name: true, status: true } });
    if (!existing) throw new ProductDomainError("PRODUCT_NOT_FOUND", "Product not found.");
    if (existing.status === "ARCHIVED") return;
    await tx.product.update({ where: { id, workspaceId: context.workspaceId }, data: { status: "ARCHIVED" } });
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "product.archived", entityType: "Product", entityId: id, metadata: { name: existing.name, previousStatus: existing.status } });
  });
}

export class StockAdjustmentRejectedError extends Error {}

export async function adjustProductStock(context: ProductMutationContext, productId: string, quantity: number, reason: string) {
  if (!canPerformAction(context.role, "inventory.adjust")) throw new ProductDomainError("PERMISSION_DENIED", "Unauthorized");
  return withSerializableRetry(async (transaction) => {
    const productBefore = await transaction.product.findFirst({ where: { id: productId, workspaceId: context.workspaceId }, select: { costPrice: true, stockQuantity: true } });
    if (!productBefore) throw new StockAdjustmentRejectedError();
    if (quantity < 0 && productBefore.stockQuantity.toNumber() < -quantity) throw new StockAdjustmentRejectedError();
    const result = await transaction.product.updateMany({
      where: {
        id: productId,
        workspaceId: context.workspaceId,
      },
      data: { stockQuantity: { increment: quantity } },
    });

    if (result.count !== 1) throw new StockAdjustmentRejectedError();

    await transaction.inventoryTransaction.create({
      data: {
        workspaceId: context.workspaceId,
        productId,
        type: "ADJUSTMENT",
        quantityChanged: quantity,
        unitCost: productBefore.costPrice,
        reference: reason,
      },
    });
    await postInventoryAdjustmentToGeneralLedger(transaction, { workspaceId: context.workspaceId, sourceId: productId, documentNo: `ADJ-${Date.now()}`, date: new Date(), value: productBefore.costPrice.mul(quantity) });

    const product = await transaction.product.findFirstOrThrow({
      where: { id: productId, workspaceId: context.workspaceId },
      select: { stockQuantity: true },
    });

    const newQuantity = product.stockQuantity.toNumber();
    await writeAudit(transaction, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "stock.adjusted",
      entityType: "Product",
      entityId: productId,
      metadata: { previousQuantity: productBefore.stockQuantity.toNumber(), adjustmentQuantity: quantity, newQuantity, reason },
    });

    return newQuantity;
  }, { timeout: 30_000 });
}

export async function removeProduct(context: ProductMutationContext, id: string): Promise<RemoveProductResult> {
  if (!canPerformAction(context.role, "products.write")) throw new ProductDomainError("PERMISSION_DENIED", "Unauthorized");

  return withSerializableRetry(async (tx) => {
    const product = await tx.product.findFirst({ where: { id, workspaceId: context.workspaceId }, select: { id: true, name: true, stockQuantity: true } });
    if (!product) throw new ProductDomainError("PRODUCT_NOT_FOUND", "Product not found.");

    const [inventoryTransactions, salesItems, purchaseItems, grnItems, customerReturnItems, supplierReturnItems, accountingEntries] = await Promise.all([
      tx.inventoryTransaction.findMany({ where: { workspaceId: context.workspaceId, productId: id }, select: { id: true, type: true, quantityChanged: true, reference: true } }),
      tx.salesOrderItem.count({ where: { productId: id, salesOrder: { workspaceId: context.workspaceId } } }),
      tx.purchaseOrderItem.count({ where: { productId: id, purchaseOrder: { workspaceId: context.workspaceId } } }),
      tx.goodReceivedNoteItem.count({ where: { productId: id, goodReceivedNote: { workspaceId: context.workspaceId } } }),
      tx.customerReturnItem.count({ where: { productId: id, customerReturn: { workspaceId: context.workspaceId } } }),
      tx.supplierReturnItem.count({ where: { productId: id, supplierReturn: { workspaceId: context.workspaceId } } }),
      tx.generalLedgerEntry.count({ where: { workspaceId: context.workspaceId, sourceType: "ADJUSTMENT", sourceId: id } }),
    ]);
    const removableOpening = inventoryTransactions.length === 1
      && inventoryTransactions[0].type === "OPENING_STOCK"
      && inventoryTransactions[0].quantityChanged.isZero()
      && inventoryTransactions[0].reference === "Opening stock";
    const hasHistory = salesItems + purchaseItems + grnItems + customerReturnItems + supplierReturnItems + accountingEntries > 0
      || (inventoryTransactions.length > 0 && !removableOpening);

    if (product.stockQuantity.isZero() && !hasHistory) {
      if (removableOpening) await tx.inventoryTransaction.delete({ where: { id: inventoryTransactions[0].id } });
      await tx.product.delete({ where: { id, workspaceId: context.workspaceId } });
      await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "product.deleted", entityType: "Product", entityId: id, metadata: { name: product.name } });
      return { disposition: "DELETED", message: `${product.name} was permanently deleted.` };
    }

    await tx.product.update({ where: { id, workspaceId: context.workspaceId }, data: { status: "ARCHIVED" } });
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "product.archived", entityType: "Product", entityId: id, metadata: { name: product.name } });
    return { disposition: "ARCHIVED", message: "This product has transaction history and cannot be permanently deleted. It has been archived instead." };
  });
}
