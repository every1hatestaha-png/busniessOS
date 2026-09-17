"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/server/authorization";
import { createSale, SaleDomainError } from "@/lib/server/sales";
import { updateSaleAndInvoice, SaleEditDomainError } from "@/lib/server/sale-edit";
import { saleSchema, type SaleInput } from "@/lib/validation/sale";
import { saleEditSchema, type SaleEditInput } from "@/lib/validation/sale-edit";

export type CreateSaleState = { error?: string };
export type EditSaleState = { error?: string };

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

export async function updateSaleAction(
  _previousState: EditSaleState,
  input: SaleEditInput,
): Promise<EditSaleState> {
  const context = await requirePermission("financial.manage");
  const parsed = saleEditSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the invoice details and try again." };
  }

  let result: { saleId: string; invoiceId: string };
  try {
    result = await updateSaleAndInvoice({ ...context, userId: context.user.id }, parsed.data);
  } catch (error) {
    if (error instanceof SaleEditDomainError) return { error: error.message };
    return { error: "The invoice could not be updated safely. Refresh and try again." };
  }

  revalidatePath("/sales");
  revalidatePath(`/sales/${result.saleId}`);
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${result.invoiceId}`);
  revalidatePath("/khata");
  redirect(`/invoices/${result.invoiceId}`);
}
