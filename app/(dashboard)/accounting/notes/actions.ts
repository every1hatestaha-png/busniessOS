"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/server/authorization";
import {
  cancelManualCustomerCreditNote,
  cancelManualSupplierDebitNote,
  createManualCustomerCreditNote,
  createManualSupplierDebitNote,
  ManualFinancialNoteError,
} from "@/lib/server/manual-notes";
import { manualCustomerCreditNoteSchema, manualSupplierDebitNoteSchema } from "@/lib/validation/manual-notes";

function notesRedirect(kind: "success" | "error", message: string): never {
  redirect(`/accounting/notes?${kind}=${encodeURIComponent(message)}`);
}

export async function createManualCustomerCreditNoteAction(formData: FormData) {
  const context = await requirePermission("financial.manage");
  const parsed = manualCustomerCreditNoteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) notesRedirect("error", parsed.error.issues[0]?.message ?? "Check the credit note details.");
  try {
    await createManualCustomerCreditNote({ ...context, userId: context.user.id }, parsed.data);
  } catch (error) {
    notesRedirect("error", error instanceof ManualFinancialNoteError ? error.message : "Customer credit note could not be created.");
  }
  revalidatePath("/accounting/notes");
  revalidatePath("/receivables");
  revalidatePath("/khata");
  notesRedirect("success", "Customer credit note created.");
}

export async function createManualSupplierDebitNoteAction(formData: FormData) {
  const context = await requirePermission("financial.manage");
  const parsed = manualSupplierDebitNoteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) notesRedirect("error", parsed.error.issues[0]?.message ?? "Check the debit note details.");
  try {
    await createManualSupplierDebitNote({ ...context, userId: context.user.id }, parsed.data);
  } catch (error) {
    notesRedirect("error", error instanceof ManualFinancialNoteError ? error.message : "Supplier debit note could not be created.");
  }
  revalidatePath("/accounting/notes");
  revalidatePath("/payables");
  revalidatePath("/purchases");
  notesRedirect("success", "Supplier debit note created.");
}

export async function cancelManualCustomerCreditNoteAction(id: string, formData: FormData) {
  const context = await requirePermission("financial.manage");
  const reason = String(formData.get("reason") ?? "");
  try {
    await cancelManualCustomerCreditNote({ ...context, userId: context.user.id }, id, reason);
  } catch (error) {
    notesRedirect("error", error instanceof ManualFinancialNoteError ? error.message : "Credit note could not be cancelled.");
  }
  revalidatePath("/accounting/notes");
  revalidatePath("/receivables");
  revalidatePath("/khata");
  notesRedirect("success", "Customer credit note cancelled and reversed.");
}

export async function cancelManualSupplierDebitNoteAction(id: string, formData: FormData) {
  const context = await requirePermission("financial.manage");
  const reason = String(formData.get("reason") ?? "");
  try {
    await cancelManualSupplierDebitNote({ ...context, userId: context.user.id }, id, reason);
  } catch (error) {
    notesRedirect("error", error instanceof ManualFinancialNoteError ? error.message : "Debit note could not be cancelled.");
  }
  revalidatePath("/accounting/notes");
  revalidatePath("/payables");
  revalidatePath("/purchases");
  notesRedirect("success", "Supplier debit note cancelled and reversed.");
}
