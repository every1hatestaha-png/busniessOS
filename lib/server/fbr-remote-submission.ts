import "server-only";

import { Prisma } from "@prisma/client";

import { postInvoiceToFbr, type FbrRemoteResult } from "@/lib/fbr/client";
import { redactSensitiveFbrData, sanitizeFbrErrorMessage } from "@/lib/fbr/redaction";
import { assertFbrExpectedEnvironment, type FbrEnvironment, type FbrInvoicePayload } from "@/lib/fbr/digital-invoicing";
import { writeAudit } from "@/lib/server/audit";
import { requirePermission } from "@/lib/server/authorization";
import { db } from "@/lib/server/db";
import { FbrCredentialError, resolveFbrBearerToken } from "@/lib/server/fbr-credentials";
import { checkFbrSubmissionFreshness } from "@/lib/server/fbr-digital-invoicing";

type PostBody = {
  invoiceNumber?: string | null;
  validationResponse?: {
    statusCode?: string | null;
    status?: string | null;
    errorCode?: string | null;
    error?: string | null;
  } | null;
};

export type FbrPostDisposition =
  | { state: "SUBMITTED"; invoiceNumber: string }
  | { state: "BLOCKED"; code: "UNAUTHORIZED" | "AMBIGUOUS_POST_RESULT"; message: string }
  | { state: "FAILED"; code: string; message: string };

export function interpretFbrPostResult(remote: FbrRemoteResult): FbrPostDisposition {
  const body = (remote.body ?? null) as PostBody | null;
  const invoiceNumber = String(body?.invoiceNumber ?? "").trim();
  const validation = body?.validationResponse;
  const accepted = remote.ok
    && validation?.statusCode === "00"
    && String(validation?.status ?? "").toLowerCase() === "valid"
    && Boolean(invoiceNumber);

  if (accepted) return { state: "SUBMITTED", invoiceNumber };

  if (remote.httpStatus === 401) {
    return {
      state: "BLOCKED",
      code: "UNAUTHORIZED",
      message: remote.errorMessage ?? "FBR rejected the configured credential.",
    };
  }

  // A timeout, network disconnect, or server-side failure can happen after the
  // remote service has already accepted the invoice. Blindly retrying could
  // create a duplicate fiscal invoice, so force reconciliation instead.
  if (remote.retryable) {
    return {
      state: "BLOCKED",
      code: "AMBIGUOUS_POST_RESULT",
      message: "The FBR submission outcome is uncertain. Do not retry until the remote result is reconciled.",
    };
  }

  return {
    state: "FAILED",
    code: remote.errorCode ?? "FBR_POST_REJECTED",
    message: remote.errorMessage ?? "FBR did not accept the invoice.",
  };
}

export async function runFbrInvoiceSubmission(submissionId: string, expectedEnvironment?: FbrEnvironment) {
  const context = await requirePermission("financial.manage");
  const submission = await db.fbrInvoiceSubmission.findFirst({
    where: { id: submissionId, workspaceId: context.workspaceId },
  });
  if (!submission) throw new Error("FBR submission not found.");
  assertFbrExpectedEnvironment(submission.environment, expectedEnvironment);
  if (submission.status === "SUBMITTED") return { status: "SUBMITTED" as const, submission };
  if (submission.status !== "VALIDATED") {
    throw new Error("The invoice must pass FBR remote validation before submission.");
  }
  if (!submission.payloadSnapshot) throw new Error("FBR payload snapshot is missing.");

  const freshness = await checkFbrSubmissionFreshness({
    workspaceId: context.workspaceId,
    invoiceId: submission.invoiceId,
    environment: submission.environment,
    payloadSnapshot: submission.payloadSnapshot,
  });
  if (!freshness.fresh) {
    const blocked = await db.fbrInvoiceSubmission.update({
      where: { id: submission.id },
      data: {
        status: "BLOCKED",
        lastErrorCode: freshness.code,
        lastErrorMessage: freshness.message,
        validatedAt: null,
      },
    });
    return { status: "BLOCKED" as const, submission: blocked };
  }

  const claimed = await db.fbrInvoiceSubmission.updateMany({
    where: {
      id: submission.id,
      workspaceId: context.workspaceId,
      status: "VALIDATED",
    },
    data: {
      status: "SUBMITTING",
      lastAttemptAt: new Date(),
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  });
  if (claimed.count !== 1) {
    const current = await db.fbrInvoiceSubmission.findUnique({ where: { id: submission.id } });
    if (current?.status === "SUBMITTED") return { status: "SUBMITTED" as const, submission: current };
    throw new Error("FBR submission is already in progress or the submission state changed.");
  }

  let token: string;
  try {
    token = resolveFbrBearerToken(context.workspaceId, submission.environment).token;
  } catch (error) {
    if (!(error instanceof FbrCredentialError)) throw error;
    const blocked = await db.fbrInvoiceSubmission.update({
      where: { id: submission.id },
      data: {
        status: "BLOCKED",
        lastErrorCode: error.code,
        lastErrorMessage: error.message,
      },
    });
    return { status: "BLOCKED" as const, submission: blocked };
  }

  const payload = submission.payloadSnapshot as unknown as FbrInvoicePayload;
  const remote = await postInvoiceToFbr({
    environment: submission.environment,
    token,
    payload,
  });
  const safeRemoteBody = redactSensitiveFbrData(remote.body, [token]);
  const safeRemote = {
    ...remote,
    body: safeRemoteBody,
    errorMessage: sanitizeFbrErrorMessage(remote.errorMessage, token),
  } satisfies FbrRemoteResult;
  const disposition = interpretFbrPostResult(safeRemote);

  const updated = await db.$transaction(async (tx) => {
    await tx.fbrInvoiceAttempt.create({
      data: {
        submissionId: submission.id,
        kind: "POST",
        requestBody: payload as unknown as Prisma.InputJsonValue,
        responseBody: (safeRemote.body ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        httpStatus: safeRemote.httpStatus || null,
        succeeded: disposition.state === "SUBMITTED",
        errorCode: disposition.state === "SUBMITTED" ? null : disposition.code,
        errorMessage: disposition.state === "SUBMITTED" ? null : disposition.message,
      },
    });

    const saved = await tx.fbrInvoiceSubmission.update({
      where: { id: submission.id },
      data: disposition.state === "SUBMITTED"
        ? {
            status: "SUBMITTED",
            submissionResponse: (safeRemote.body ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            fbrInvoiceNumber: disposition.invoiceNumber,
            attemptCount: { increment: 1 },
            submittedAt: new Date(),
            lastAttemptAt: new Date(),
            lastErrorCode: null,
            lastErrorMessage: null,
          }
        : {
            status: disposition.state,
            submissionResponse: (safeRemote.body ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            attemptCount: { increment: 1 },
            lastAttemptAt: new Date(),
            lastErrorCode: disposition.code,
            lastErrorMessage: disposition.message,
          },
    });

    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.user.id,
      action: disposition.state === "SUBMITTED" ? "fbr.invoice_submitted" : "fbr.invoice_submission_failed",
      entityType: "Invoice",
      entityId: submission.invoiceId,
      metadata: {
        submissionId: submission.id,
        environment: submission.environment,
        httpStatus: safeRemote.httpStatus,
        disposition: disposition.state,
        errorCode: disposition.state === "SUBMITTED" ? null : disposition.code,
        fbrInvoiceNumber: disposition.state === "SUBMITTED" ? disposition.invoiceNumber : null,
      },
    });

    return saved;
  });

  return { status: disposition.state, submission: updated, remote: safeRemote };
}
