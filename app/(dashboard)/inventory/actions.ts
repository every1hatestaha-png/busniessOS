"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  adjustProductStock,
  createProduct,
  StockAdjustmentRejectedError,
  updateProduct,
} from "@/lib/server/products";
import { requirePermission } from "@/lib/server/authorization";
import { productEditSchema, productSchema } from "@/lib/validation/product";

export type ProductActionState = { error?: string };

export async function createProductAction(
  _previousState: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const { workspaceId } = await requirePermission("products.write");
  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Check the highlighted product details and try again." };
  }

  let productId: string;
  try {
    productId = await createProduct(workspaceId, parsed.data);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "That SKU is already used in this workspace." };
    }
    return { error: "The product could not be saved. Please try again." };
  }

  revalidatePath("/inventory");
  redirect(`/inventory/${productId}`);
}

export async function updateProductAction(
  id: string,
  _previousState: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const { workspaceId } = await requirePermission("products.write");
  const parsed = productEditSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Check the highlighted product details and try again." };
  }

  try {
    await updateProduct(workspaceId, id, parsed.data);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "That SKU is already used in this workspace." };
    }
    return { error: "The product could not be updated. Please try again." };
  }

  revalidatePath("/inventory");
  revalidatePath(`/inventory/${id}`);
  redirect(`/inventory/${id}`);
}

const adjustmentSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().refine((value) => value !== 0, { message: "Quantity must not be zero" }),
  reason: z.string().trim().min(3).max(160),
});

export type StockAdjustmentState = {
  error?: string;
  stockQuantity?: number;
  successToken?: number;
};

export async function adjustStockAction(
  _previousState: StockAdjustmentState,
  formData: FormData,
): Promise<StockAdjustmentState> {
  const { workspaceId } = await requirePermission("inventory.adjust");
  const parsed = adjustmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Enter a valid quantity and a brief reason." };
  }

  try {
    const stockQuantity = await adjustProductStock(
      workspaceId,
      parsed.data.productId,
      parsed.data.quantity,
      parsed.data.reason,
    );
    revalidatePath("/inventory");
    revalidatePath(`/inventory/${parsed.data.productId}`);
    return { stockQuantity, successToken: Date.now() };
  } catch (error) {
    if (error instanceof StockAdjustmentRejectedError) {
      return { error: "The adjustment could not be applied. Check the available stock and try again." };
    }
    return { error: "Stock could not be adjusted. Please try again." };
  }
}
