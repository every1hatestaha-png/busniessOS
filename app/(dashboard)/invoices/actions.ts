"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/server/authorization";
import { recordPayment } from "@/lib/server/payments";
import { paymentSchema } from "@/lib/validation/payment";

export type RecordPaymentState = {
  error?: string;
  success?: string;
  successToken?: number;
};

function parseAllocations(value: FormDataEntryValue | null) {
  if (!value || typeof value !== "string" || !value.trim()) return undefined;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export async function recordPaymentAction(
  _previousState: RecordPaymentState,
  formData: FormData,
): Promise<RecordPaymentState> {
  const context = await requirePermission("payments.record");
  const parsed = paymentSchema.safeParse({
    customerId: formData.get("customerId"),
    invoiceId: formData.get("invoiceId") ?? "",
    cashBankAccountId: formData.get("cashBankAccountId") ?? "",
    allocations: parseAllocations(formData.get("allocationsJson")),
    amount: formData.get("amount"),
    withholdingTaxAmount: formData.get("withholdingTaxAmount") ?? 0,
    paymentDate: formData.get("paymentDate"),
    method: formData.get("method"),
    reference: formData.get("reference") ?? "",
    notes: formData.get("notes") ?? "",
    idempotencyKey: formData.get("idempotencyKey"),
  });

  if (!parsed.success) return { error: "Check the payment, allocation, and withholding tax details and try again." };

  try {
    await recordPayment(context, parsed.data);
  } catch (error) {
    return { error: error instanceof Error && error.message ? error.message : "The payment could not be recorded. Check the amount and try again." };
  }

  revalidatePath("/invoices");
  revalidatePath("/khata");
  revalidatePath(`/customers/${parsed.data.customerId}`);
  revalidatePath("/sales");
  if (parsed.data.invoiceId) revalidatePath(`/invoices/${parsed.data.invoiceId}`);
  return { success: "Payment recorded successfully.", successToken: Date.now() };
}
