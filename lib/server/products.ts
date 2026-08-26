import "server-only";

import type { ProductStatus, ProductUnit } from "@prisma/client";
import type { z } from "zod";

import { requireWorkspace } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
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

    return product.id;
  });
}

export async function updateProduct(
  workspaceId: string,
  id: string,
  input: ProductEditData,
): Promise<void> {
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
        reference: reason,
      },
    });

    const product = await transaction.product.findFirstOrThrow({
      where: { id: productId, workspaceId },
      select: { stockQuantity: true },
    });

    return product.stockQuantity;
  });
}
