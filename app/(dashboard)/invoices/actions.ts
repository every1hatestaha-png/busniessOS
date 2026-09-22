"use server";

import { revalidatePath } from "next/cache";

import { requiresFbrManualReconciliation } from "@/lib/fbr/digital-invoicing";
import { requirePermission } from "@/lib/server/authorization";
import { getFbrSubmissionForInvoice, prepareFbrInvoiceSubmission } from "@/lib/server/fbr-digital-invoicing";
import { runFbrInvoiceSubmission } from "@/lib/server/fbr-remote-submission";
import { runFbrRemoteValidation } from "@/lib/server/fbr-remote-validation";
import { recordPayment } from "@/lib/server/payments";
import { paymentSchema } from "@/lib/validation/payment";


export type FbrInvoiceActionState = {
  error?: string;
  success?: string;
  successToken?: number;
};

export async function prepareFbrSandboxAction(
  invoiceId: string,
  _previousState: FbrInvoiceActionState,
  _formData: FormData,
): Promise<FbrInvoiceActionState> {
  void _previousState;
  void _formData;
  try {
    const prepared = await prepareFbrInvoiceSubmission(invoiceId, "SANDBOX");
    revalidatePath(`/invoices/${invoiceId}`);
    if (requiresFbrManualReconciliation(prepared.submission.status, prepared.submission.lastErrorCode)) {
      return {
        error: prepared.submission.lastErrorMessage
          ?? "The previous FBR POST has an uncertain outcome. Reconcile it before any retry.",
        successToken: Date.now(),
      };
    }
    if (!prepared.readyForRemoteValidation) {
      return {
        error: prepared.issues[0]?.message ?? "Resolve the FBR preflight blockers before sandbox validation.",
        successToken: Date.now(),
      };
    }
    return {
      success: "FBR sandbox payload prepared. It is ready for remote validation.",
      successToken: Date.now(),
    };
  } catch (error) {
    return {
      error: error instanceof Error && error.message
        ? error.message
        : "The FBR sandbox payload could not be prepared.",
      successToken: Date.now(),
    };
  }
}

export async function validateFbrSandboxAction(
  invoiceId: string,
  submissionId: string,
  _previousState: FbrInvoiceActionState,
  _formData: FormData,
): Promise<FbrInvoiceActionState> {
  void _previousState;
  void _formData;
  try {
    const context = await requirePermission("financial.manage");
    const sandboxSubmission = await getFbrSubmissionForInvoice(context.workspaceId, invoiceId, "SANDBOX");
    if (!sandboxSubmission || sandboxSubmission.id !== submissionId) {
      return { error: "The sandbox submission changed. Refresh the invoice and prepare it again.", successToken: Date.now() };
    }
    if (requiresFbrManualReconciliation(sandboxSubmission.status, sandboxSubmission.lastErrorCode)) {
      return {
        error: sandboxSubmission.lastErrorMessage
          ?? "The previous FBR POST has an uncertain outcome. Reconcile it before any retry.",
        successToken: Date.now(),
      };
    }

    const result = await runFbrRemoteValidation(submissionId, "SANDBOX");
    revalidatePath(`/invoices/${invoiceId}`);

    if (result.status === "VALIDATED") {
      return { success: "FBR sandbox validation passed.", successToken: Date.now() };
    }

    return {
      error: result.submission.lastErrorMessage ?? "FBR sandbox validation did not pass.",
      successToken: Date.now(),
    };
  } catch (error) {
    return {
      error: error instanceof Error && error.message
        ? error.message
        : "FBR sandbox validation could not be completed.",
      successToken: Date.now(),
    };
  }
}

export async function submitFbrSandboxAction(
  invoiceId: string,
  submissionId: string,
  _previousState: FbrInvoiceActionState,
  _formData: FormData,
): Promise<FbrInvoiceActionState> {
  void _previousState;
  void _formData;
  try {
    const context = await requirePermission("financial.manage");
    const sandboxSubmission = await getFbrSubmissionForInvoice(context.workspaceId, invoiceId, "SANDBOX");
    if (!sandboxSubmission || sandboxSubmission.id !== submissionId) {
      return { error: "The sandbox submission changed. Refresh the invoice before submitting.", successToken: Date.now() };
    }
    if (requiresFbrManualReconciliation(sandboxSubmission.status, sandboxSubmission.lastErrorCode)) {
      return {
        error: sandboxSubmission.lastErrorMessage
          ?? "The previous FBR POST has an uncertain outcome. Reconcile it before any retry.",
        successToken: Date.now(),
      };
    }
    if (sandboxSubmission.status === "SUBMITTED") {
      return { success: "This test invoice is already submitted to FBR sandbox.", successToken: Date.now() };
    }
    if (sandboxSubmission.status !== "VALIDATED") {
      return { error: "The invoice must pass FBR sandbox validation before sandbox submission.", successToken: Date.now() };
    }

    const result = await runFbrInvoiceSubmission(submissionId, "SANDBOX");
    revalidatePath(`/invoices/${invoiceId}`);

    if (result.status === "SUBMITTED") {
      return { success: "Invoice submitted to FBR sandbox successfully.", successToken: Date.now() };
    }
    return {
      error: result.submission.lastErrorMessage ?? "FBR sandbox submission did not complete.",
      successToken: Date.now(),
    };
  } catch (error) {
    return {
      error: error instanceof Error && error.message
        ? error.message
        : "FBR sandbox submission could not be completed.",
      successToken: Date.now(),
    };
  }
}

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
    applyToOpeningBalance: formData.get("applyToOpeningBalance") === "true",
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
    await recordPayment({ ...context, userId: context.user.id }, parsed.data);
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
