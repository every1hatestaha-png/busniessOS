"use server";

import { revalidatePath } from "next/cache";

import { prepareFbrInvoiceSubmission } from "@/lib/server/fbr-digital-invoicing";
import { runFbrRemoteValidation } from "@/lib/server/fbr-remote-validation";
import { runFbrInvoiceSubmission } from "@/lib/server/fbr-remote-submission";

export type FbrInvoiceActionResult = {
  ok: boolean;
  message: string;
};

function refreshInvoice(invoiceId: string) {
  revalidatePath(`/invoices/${invoiceId}`);
}

export async function prepareFbrInvoiceAction(invoiceId: string): Promise<FbrInvoiceActionResult> {
  try {
    const result = await prepareFbrInvoiceSubmission(invoiceId);
    refreshInvoice(invoiceId);
    if (!result.readyForRemoteValidation) {
      return {
        ok: false,
        message: `FBR preflight found ${result.issues.length} issue${result.issues.length === 1 ? "" : "s"}. Resolve them before remote validation.`,
      };
    }
    return { ok: true, message: "FBR payload prepared and local preflight passed." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "FBR preparation failed." };
  }
}

export async function validateFbrInvoiceAction(
  invoiceId: string,
  submissionId: string,
): Promise<FbrInvoiceActionResult> {
  try {
    const result = await runFbrRemoteValidation(submissionId);
    refreshInvoice(invoiceId);
    if (result.status === "VALIDATED") return { ok: true, message: "FBR remote validation passed." };
    if (result.status === "BLOCKED") {
      return { ok: false, message: result.submission.lastErrorMessage ?? "FBR validation is blocked." };
    }
    return { ok: false, message: result.submission.lastErrorMessage ?? "FBR validation did not pass." };
  } catch (error) {
    refreshInvoice(invoiceId);
    return { ok: false, message: error instanceof Error ? error.message : "FBR validation failed." };
  }
}

export async function submitFbrInvoiceAction(
  invoiceId: string,
  submissionId: string,
): Promise<FbrInvoiceActionResult> {
  try {
    const result = await runFbrInvoiceSubmission(submissionId);
    refreshInvoice(invoiceId);
    if (result.status === "SUBMITTED") {
      return {
        ok: true,
        message: result.submission.fbrInvoiceNumber
          ? `Submitted to FBR as ${result.submission.fbrInvoiceNumber}.`
          : "Invoice submitted to FBR.",
      };
    }
    return { ok: false, message: result.submission.lastErrorMessage ?? "FBR submission did not complete." };
  } catch (error) {
    refreshInvoice(invoiceId);
    return { ok: false, message: error instanceof Error ? error.message : "FBR submission failed." };
  }
}
