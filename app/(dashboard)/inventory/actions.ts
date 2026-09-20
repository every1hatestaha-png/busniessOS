"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  adjustProductStock,
  archiveProduct,
  createProduct,
  ProductDomainError,
  StockAdjustmentRejectedError,
  updateProduct,
} from "@/lib/server/products";
import { requirePermission } from "@/lib/server/authorization";
import { transferWarehouseStock, IndustryDomainError } from "@/lib/server/industry-modules";
import { productEditSchema, productSchema } from "@/lib/validation/product";
import { FbrProductMappingError, verifyProductFbrReferenceMapping } from "@/lib/server/fbr-product-mapping";
import { FbrReferenceOptionsError, getFbrReferenceOptions } from "@/lib/server/fbr-reference-options";

export type ProductActionState = { error?: string };

export type FbrProductMappingState = {
  status?: "success" | "error";
  message?: string;
  successToken?: number;
};


const fbrReferenceOptionsSchema = z.object({
  transactionTypeId: z.preprocess(
    (value) => value === "" || value == null ? undefined : value,
    z.coerce.number().int().positive().optional(),
  ),
});

export type FbrReferenceOptionsState = {
  status?: "success" | "error";
  message?: string;
  transactionTypes?: Array<{ id: number; description: string }>;
  uoms?: Array<{ id: number; description: string }>;
  rates?: Array<{ id: number; description: string; value: number; plainPercentage: boolean }>;
  province?: { code: number; description: string };
  effectiveDate?: string;
  rateTransactionTypeId?: number | null;
  successToken?: number;
};

export async function loadFbrReferenceOptionsAction(
  _previousState: FbrReferenceOptionsState,
  formData: FormData,
): Promise<FbrReferenceOptionsState> {
  const context = await requirePermission("products.write");
  const parsed = fbrReferenceOptionsSchema.safeParse({
    transactionTypeId: formData.get("transactionTypeId"),
  });
  if (!parsed.success) {
    return { status: "error", message: "Choose a valid FBR transaction type before loading rates." };
  }

  try {
    const result = await getFbrReferenceOptions(
      { workspaceId: context.workspaceId, role: context.role },
      parsed.data.transactionTypeId,
    );
    return {
      status: "success",
      message: parsed.data.transactionTypeId
        ? "Current FBR transaction types, UOMs and rates loaded from the sandbox reference APIs."
        : "Current FBR transaction types and UOMs loaded. Choose a transaction type and refresh to load its current rates.",
      transactionTypes: result.transactionTypes,
      uoms: result.uoms,
      rates: result.rates,
      province: result.province,
      effectiveDate: result.effectiveDate,
      rateTransactionTypeId: result.rateTransactionTypeId,
      successToken: Date.now(),
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof FbrReferenceOptionsError || error instanceof Error
        ? error.message
        : "FBR reference options could not be loaded.",
      successToken: Date.now(),
    };
  }
}

export async function verifyFbrProductMappingAction(
  id: string,
  _previousState: FbrProductMappingState,
  _formData: FormData,
): Promise<FbrProductMappingState> {
  const context = await requirePermission("products.write");
  try {
    const result = await verifyProductFbrReferenceMapping(
      { workspaceId: context.workspaceId, role: context.role, userId: context.user.id },
      id,
    );
    revalidatePath(`/inventory/${id}`);
    revalidatePath(`/inventory/${id}/edit`);
    revalidatePath("/inventory");
    return {
      status: "success",
      message: !result.plainPercentageRate
        ? `FBR references verified, but rate "${result.rate.description}" uses a compound formula that MunshiOS will keep blocked from production submission.`
        : result.hsUomVerified
          ? `FBR mapping verified including HS/UOM compatibility under confirmed annexure ${result.hsUomAnnexureId}.`
          : `FBR rate/sale-type/UOM references verified. HS/UOM compatibility remains pending until a confirmed sales-annexure ID is recorded in settings.`,
      successToken: Date.now(),
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof FbrProductMappingError || error instanceof Error
        ? error.message
        : "FBR product mapping could not be verified.",
      successToken: Date.now(),
    };
  }
}


export async function createProductAction(
  _previousState: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const context = await requirePermission("products.write");
  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Check the highlighted product details and try again." };
  }

  let productId: string;
  try {
    productId = await createProduct(context.workspaceId, parsed.data);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "That SKU is already used in this workspace." };
    }
    if (error instanceof ProductDomainError) return { error: error.message };
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
  const context = await requirePermission("products.write");
  const parsed = productEditSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Check the highlighted product details and try again." };
  }

  try {
    await updateProduct({ ...context, userId: context.user.id }, id, parsed.data);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "That SKU is already used in this workspace." };
    }
    if (error instanceof ProductDomainError) return { error: error.message };
    return { error: "The product could not be updated. Please try again." };
  }

  revalidatePath("/inventory");
  revalidatePath(`/inventory/${id}`);
  redirect(`/inventory/${id}`);
}

export async function archiveProductAction(
  id: string,
): Promise<ProductActionState> {
  const context = await requirePermission("products.write");

  try {
    await archiveProduct({ ...context, userId: context.user.id }, id);
  } catch (error) {
    if (error instanceof ProductDomainError) return { error: error.message };
    return { error: "The product could not be archived. Please try again." };
  }

  revalidatePath("/inventory");
  revalidatePath(`/inventory/${id}`);
  redirect(`/inventory/${id}`);
}

const adjustmentSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().refine((value) => value !== 0, { message: "Quantity must not be zero" }),
  reason: z.string().trim().min(3).max(160),
  warehouseId: z.string().uuid().optional().or(z.literal("")),
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
  const context = await requirePermission("inventory.adjust");
  const parsed = adjustmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Enter a valid quantity and a brief reason." };
  }

  try {
    const stockQuantity = await adjustProductStock(
      { ...context, userId: context.user.id },
      parsed.data.productId,
      parsed.data.quantity,
      parsed.data.reason,
      parsed.data.warehouseId || undefined,
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


const warehouseTransferSchema = z.object({
  productId: z.string().uuid(),
  fromWarehouseId: z.string().uuid(),
  toWarehouseId: z.string().uuid(),
  quantity: z.coerce.number().positive().finite(),
});

export type WarehouseTransferState = {
  status?: "success" | "error";
  message?: string;
  successToken?: number;
};

export async function transferWarehouseStockAction(
  _previousState: WarehouseTransferState,
  formData: FormData,
): Promise<WarehouseTransferState> {
  const context = await requirePermission("inventory.adjust");
  const parsed = warehouseTransferSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Choose a product, two different warehouses, and a positive quantity." };
  if (parsed.data.fromWarehouseId === parsed.data.toWarehouseId) {
    return { status: "error", message: "Source and destination warehouses must be different." };
  }

  try {
    await transferWarehouseStock(
      { workspaceId: context.workspaceId, role: context.role, userId: context.user.id },
      parsed.data,
    );
    revalidatePath("/inventory");
    revalidatePath("/reports/current-stock");
    revalidatePath("/reports/stock-movement");
    return { status: "success", message: "Warehouse transfer completed.", successToken: Date.now() };
  } catch (error) {
    if (error instanceof IndustryDomainError) return { status: "error", message: error.message };
    return { status: "error", message: "Warehouse transfer could not be completed." };
  }
}
