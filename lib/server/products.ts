import "server-only";

import type { ProductStatus, ProductUnit } from "@prisma/client";
import type { z } from "zod";

import { requireWorkspace } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { postInventoryAdjustmentToGeneralLedger, postOpeningAssetToGeneralLedger } from "@/lib/server/accounting";
import { Prisma } from "@prisma/client";
import { productEditSchema, productSchema } from "@/lib/validation/product";

type ProductData = z.output<typeof productSchema>;
type ProductEditData = z.output<typeof productEditSchema>;

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
  stockQuantity: number;
  reorderLevel: number;
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

  let balance = product.stockQuantity;
  const movements = product.inventoryTransactions.map((movement) => {
    const movementDTO: StockMovementDTO = {
      id: movement.id,
      type: movement.type,
      quantity: movement.quantityChanged,
      reference: movement.reference,
      date: movement.createdAt.toISOString(),
      balance,
    };
    balance -= movement.quantityChanged;
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
  });
}

export async function updateProduct(
  workspaceId: string,
  id: string,
  input: ProductEditData,
): Promise<void> {
  const existing = await db.product.findFirst({ where: { id, workspaceId }, select: { stockQuantity: true, costPrice: true } });
  if (!existing) throw new Error("Product could not be updated");
  if (existing.stockQuantity !== 0 && !existing.costPrice.equals(input.costPrice)) throw new Error("Cost price cannot be changed while stock is on hand. Receive stock or adjust quantity through an auditable inventory transaction.");
  const result = await db.product.updateMany({
    where: { id, workspaceId },
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

  if (result.count !== 1) throw new Error("Product could not be updated");
}

export class StockAdjustmentRejectedError extends Error {}

export async function adjustProductStock(workspaceId: string, productId: string, quantity: number, reason: string) {
  return db.$transaction(async (transaction) => {
    const productBefore = await transaction.product.findFirst({ where: { id: productId, workspaceId }, select: { costPrice: true } });
    if (!productBefore) throw new StockAdjustmentRejectedError();
    const result = await transaction.product.updateMany({
      where: {
        id: productId,
        workspaceId,
        ...(quantity < 0 ? { stockQuantity: { gte: -quantity } } : {}),
      },
      data: { stockQuantity: { increment: quantity } },
    });

    if (result.count !== 1) throw new StockAdjustmentRejectedError();

    await transaction.inventoryTransaction.create({
      data: {
        workspaceId,
        productId,
        type: "ADJUSTMENT",
        quantityChanged: quantity,
        unitCost: productBefore.costPrice,
        reference: reason,
      },
    });
    await postInventoryAdjustmentToGeneralLedger(transaction, { workspaceId, sourceId: productId, documentNo: `ADJ-${Date.now()}`, date: new Date(), value: productBefore.costPrice.mul(quantity) });

    const product = await transaction.product.findFirstOrThrow({
      where: { id: productId, workspaceId },
      select: { stockQuantity: true },
    });

    return product.stockQuantity;
  });
}
