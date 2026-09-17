"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/server/authorization";
import { InvoiceDocumentError, updateInvoiceDocumentDetails } from "@/lib/server/invoice-document";
import { InvoiceEditError, type InvoiceFinancialEditInput, updateInvoiceFinancials } from "@/lib/server/invoice-edit";

export type InvoiceEditActionState = { error?: string };

function parseDateOnly(value: FormDataEntryValue | null, required: boolean) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    if (required) throw new InvoiceDocumentError("Issue date is required.");
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new InvoiceDocumentError("Enter a valid date.");
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new InvoiceDocumentError("Enter a valid date.");
  return date;
}

function revalidateInvoice(invoiceId: string) {
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath(`/invoices/${invoiceId}/edit`);
  revalidatePath("/sales");
  revalidatePath("/khata");
  revalidatePath("/customers");
}

export async function updateInvoiceDocumentAction(
  invoiceId: string,
  _previousState: InvoiceEditActionState,
  formData: FormData,
): Promise<InvoiceEditActionState> {
  const context = await requirePermission("financial.manage");
  try {
    const issuedAt = parseDateOnly(formData.get("issuedAt"), true)!;
    const dueDate = parseDateOnly(formData.get("dueDate"), false);
    await updateInvoiceDocumentDetails(
      { workspaceId: context.workspaceId, userId: context.user.id },
      invoiceId,
      {
        issuedAt,
        dueDate,
        dcNumber: String(formData.get("dcNumber") ?? ""),
        notes: String(formData.get("documentNotes") ?? "").trim(),
      },
    );
  } catch (error) {
    if (error instanceof InvoiceDocumentError) return { error: error.message };
    return { error: "Invoice document details could not be saved. Please retry." };
  }
  revalidateInvoice(invoiceId);
  redirect(`/invoices/${invoiceId}`);
}

export async function updateInvoiceFinancialAction(
  invoiceId: string,
  _previousState: InvoiceEditActionState,
  formData: FormData,
): Promise<InvoiceEditActionState> {
  const context = await requirePermission("financial.manage");
  let input: InvoiceFinancialEditInput;
  try {
    const raw = String(formData.get("payload") ?? "");
    input = JSON.parse(raw) as InvoiceFinancialEditInput;
  } catch {
    return { error: "The edited invoice data is invalid. Refresh and try again." };
  }

  try {
    await updateInvoiceFinancials({ workspaceId: context.workspaceId, userId: context.user.id }, invoiceId, input);
  } catch (error) {
    if (error instanceof InvoiceEditError) return { error: error.message };
    return { error: "The invoice could not be updated safely. No partial edit was saved." };
  }
  revalidateInvoice(invoiceId);
  redirect(`/invoices/${invoiceId}`);
}
