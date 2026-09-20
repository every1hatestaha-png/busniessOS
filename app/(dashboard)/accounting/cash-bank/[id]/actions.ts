"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/server/authorization";
import { CashReconciliationError, recordCashDrawerReconciliation } from "@/lib/server/cash-reconciliation";

export async function recordCashDrawerReconciliationAction(id: string, formData: FormData) {
  const context = await requirePermission("financial.manage");
  let difference: number;
  try {
    const result = await recordCashDrawerReconciliation(
      { ...context, userId: context.user.id },
      id,
      { countedAmount: formData.get("countedAmount"), notes: String(formData.get("notes") ?? "") },
    );
    difference = result.difference;
  } catch (error) {
    const message = error instanceof CashReconciliationError || error instanceof Error ? error.message : "Cash count could not be recorded.";
    redirect(`/accounting/cash-bank/${id}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/accounting/cash-bank/${id}`);
  redirect(`/accounting/cash-bank/${id}?reconciled=${encodeURIComponent(String(difference!))}`);
}
