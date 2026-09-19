"use server";

import { revalidatePath } from "next/cache";

import { fbrRemoteUiBlock, requiresFbrManualReconciliation } from "@/lib/fbr/control-plane";
import { requirePermission } from "@/lib/server/authorization";
import {
  getFbrSubmissionForInvoice,
  prepareFbrInvoiceSubmission,
} from "@/lib/server/fbr-digital-invoicing";
import { runFbrInvoiceSubmission } from "@/lib/server/fbr-remote-submission";
import { runFbrRemoteValidation } from "@/lib/server/fbr-remote-validation";

export type FbrInvoiceActionState = {
  status?: "success" | "error";
  message?: string;
};

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function refreshInvoice(invoiceId: string) {
  revalidatePath("/invoices");
  revalidatePath("/invoices/" + invoiceId);
}

export async function prepareFbrInvoiceAction(
  invoiceId: string,
  _previousState: FbrInvoiceActionState,
  _formData: FormData,
): Promise<FbrInvoiceActionState> {
  try {
    const result = await prepareFbrInvoiceSubmission(invoiceId);
    refreshInvoice(invoiceId);
    if (requiresFbrManualReconciliation(result.submission.status, result.submission.lastErrorCode)) {
      return {
        status: "error",
        message: result.submission.lastErrorMessage ?? "This FBR submission requires manual reconciliation before any retry.",
      };
    }
    if (!result.readyForRemoteValidation) {
      const first = result.issues[0]?.message ?? "Resolve the FBR preflight blockers.";
      return { status: "error", message: "FBR preflight found " + result.issues.length + " blocker(s). " + first };
    }
    return { status: "success", message: "FBR payload prepared and preflight passed." };
  } catch (error) {
    return { status: "error", message: messageFrom(error, "FBR preflight could not be prepared.") };
  }
}

export async function validateFbrSandboxAction(
  invoiceId: string,
  _previousState: FbrInvoiceActionState,
  _formData: FormData,
): Promise<FbrInvoiceActionState> {
  try {
    const prepared = await prepareFbrInvoiceSubmission(invoiceId);
    if (requiresFbrManualReconciliation(prepared.submission.status, prepared.submission.lastErrorCode)) {
      return {
        status: "error",
        message: prepared.submission.lastErrorMessage ?? "This FBR submission requires manual reconciliation before any retry.",
      };
    }
    const blocked = fbrRemoteUiBlock(prepared.submission.environment, "VALIDATE");
    if (blocked) return { status: "error", message: blocked.message };
    if (!prepared.readyForRemoteValidation) {
      return {
        status: "error",
        message: prepared.issues[0]?.message ?? "Resolve the FBR preflight blockers before sandbox validation.",
      };
    }

    const result = await runFbrRemoteValidation(prepared.submission.id);
    refreshInvoice(invoiceId);
    if (result.status === "VALIDATED") {
      return { status: "success", message: "FBR sandbox validation passed." };
    }
    if (result.status === "SUBMITTED") {
      return { status: "success", message: "This sandbox invoice has already been submitted." };
    }
    return {
      status: "error",
      message: result.submission.lastErrorMessage ?? "FBR sandbox validation did not pass.",
    };
  } catch (error) {
    return { status: "error", message: messageFrom(error, "FBR sandbox validation failed.") };
  }
}

export async function submitFbrSandboxAction(
  invoiceId: string,
  _previousState: FbrInvoiceActionState,
  _formData: FormData,
): Promise<FbrInvoiceActionState> {
  try {
    const context = await requirePermission("financial.manage");
    const submission = await getFbrSubmissionForInvoice(context.workspaceId, invoiceId, "SANDBOX");
    if (!submission) {
      return { status: "error", message: "Prepare and validate the invoice in FBR sandbox first." };
    }

    const blocked = fbrRemoteUiBlock(submission.environment, "SUBMIT");
    if (blocked) return { status: "error", message: blocked.message };
    if (submission.status === "SUBMITTED") {
      return { status: "success", message: "This sandbox invoice has already been submitted." };
    }
    if (submission.status !== "VALIDATED") {
      return { status: "error", message: "The invoice must pass FBR sandbox validation before sandbox submission." };
    }

    const result = await runFbrInvoiceSubmission(submission.id);
    refreshInvoice(invoiceId);
    if (result.status === "SUBMITTED") {
      return { status: "success", message: "Invoice submitted to FBR sandbox successfully." };
    }
    return {
      status: "error",
      message: result.submission.lastErrorMessage ?? "FBR sandbox submission did not complete.",
    };
  } catch (error) {
    return { status: "error", message: messageFrom(error, "FBR sandbox submission failed.") };
  }
}
