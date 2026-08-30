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

export async function recordPaymentAction(
  _previousState: RecordPaymentState,
  formData: FormData,
): Promise<RecordPaymentState> {
  const context = await requirePermission("payments.record");
  const parsed = paymentSchema.safeParse({
    customerId: formData.get("customerId"),
    invoiceId: formData.get("invoiceId") ?? "",
    cashBankAccountId: formData.get("cashBankAccountId") ?? "",
    amount: formData.get("amount"),
    paymentDate: formData.get("paymentDate"),
    method: formData.get("method"),
    reference: formData.get("reference") ?? "",
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) return { error: "Check the payment details and try again." };

  try {
    await recordPayment(context, parsed.data);
  } catch {
    return { error: "The payment could not be recorded. Check the amount and try again." };
  }

  revalidatePath("/invoices");
  revalidatePath("/khata");
  revalidatePath(`/customers/${parsed.data.customerId}`);
  revalidatePath("/sales");
  if (parsed.data.invoiceId) revalidatePath(`/invoices/${parsed.data.invoiceId}`);
  return { success: "Payment recorded successfully.", successToken: Date.now() };
}
