import type { FbrEnvironment } from "@/lib/fbr/digital-invoicing";

export type FbrRemoteUiOperation = "VALIDATE" | "SUBMIT";

export function fbrRemoteUiBlock(environment: FbrEnvironment, operation: FbrRemoteUiOperation) {
  if (environment === "SANDBOX") return null;

  return {
    code: "PRODUCTION_UI_LOCKED" as const,
    message: operation === "VALIDATE"
      ? "Production FBR validation is locked in the invoice UI until the live release checklist is complete."
      : "Production FBR submission is locked in the invoice UI until the live release checklist is complete.",
  };
}


export function requiresFbrManualReconciliation(status: string, lastErrorCode: string | null | undefined) {
  return status === "BLOCKED" && lastErrorCode === "AMBIGUOUS_POST_RESULT";
}
