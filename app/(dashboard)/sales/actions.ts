"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/server/authorization";
import { createSale, SaleDomainError } from "@/lib/server/sales";
import { saleSchema, type SaleInput } from "@/lib/validation/sale";

export type CreateSaleState = { error?: string };

export async function createSaleAction(
  _previousState: CreateSaleState,
  input: SaleInput,
): Promise<CreateSaleState> {
  const context = await requirePermission("sales.create");
  const parsed = saleSchema.safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the order details and try again." };
  }

  let saleId: string;
  try {
    const sale = await createSale({ ...context, userId: context.user.id }, parsed.data);
    saleId = sale.id;
  } catch (error) {
    if (error instanceof SaleDomainError) {
      return { error: error.message };
    }
    return { error: "The order could not be saved. Please try again." };
  }

  revalidatePath("/sales");
  revalidatePath("/invoices");
  redirect(`/sales/${saleId}`);
}
