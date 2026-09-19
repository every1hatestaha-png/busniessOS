import "server-only";

import { Prisma } from "@prisma/client";

import { validateInvoiceWithFbr } from "@/lib/fbr/client";
import type { FbrInvoicePayload } from "@/lib/fbr/digital-invoicing";
import { writeAudit } from "@/lib/server/audit";
import { requirePermission } from "@/lib/server/authorization";
import { db } from "@/lib/server/db";
import { FbrCredentialError, resolveFbrBearerToken } from "@/lib/server/fbr-credentials";

type ValidationBody = {
  validationResponse?: {
    statusCode?: string | null;
    status?: string | null;
    errorCode?: string | null;
    error?: string | null;
  } | null;
};

function acceptedByFbr(body: unknown) {
  const validation = (body as ValidationBody | null)?.validationResponse;
  return validation?.statusCode === "00" && String(validation?.status ?? "").toLowerCase() === "valid";
}

export async function runFbrRemoteValidation(submissionId: string) {
  const context = await requirePermission("financial.manage");

  const submission = await db.fbrInvoiceSubmission.findFirst({
    where: { id: submissionId, workspaceId: context.workspaceId },
  });
  if (!submission) throw new Error("FBR submission not found.");
  if (submission.status === "SUBMITTED") return { status: "SUBMITTED" as const, submission };
  const credentialBlocked = submission.status === "BLOCKED"
    && ["CREDENTIAL_MISSING", "UNAUTHORIZED"].includes(submission.lastErrorCode ?? "");
  if (submission.status === "BLOCKED" && !credentialBlocked) {
    throw new Error(submission.lastErrorMessage ?? "Resolve FBR preflight blockers before remote validation.");
  }
  if (!submission.payloadSnapshot) throw new Error("FBR payload snapshot is missing.");

  const claimed = await db.fbrInvoiceSubmission.updateMany({
    where: {
      id: submission.id,
      workspaceId: context.workspaceId,
      status: { in: ["DRAFT", "VALIDATION_FAILED", "FAILED", ...(credentialBlocked ? ["BLOCKED" as const] : [])] },
    },
    data: {
      status: "VALIDATING",
      lastAttemptAt: new Date(),
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  });
  if (claimed.count !== 1) {
    const current = await db.fbrInvoiceSubmission.findUnique({ where: { id: submission.id } });
    if (current?.status === "VALIDATED") return { status: "VALIDATED" as const, submission: current };
    throw new Error("FBR validation is already in progress or the submission state changed.");
  }

  let token: string;
  try {
    token = resolveFbrBearerToken(context.workspaceId).token;
  } catch (error) {
    if (error instanceof FbrCredentialError) {
      const blocked = await db.fbrInvoiceSubmission.update({
        where: { id: submission.id },
        data: {
          status: "BLOCKED",
          lastErrorCode: "CREDENTIAL_MISSING",
          lastErrorMessage: error.message,
        },
      });
      return { status: "BLOCKED" as const, submission: blocked };
    }
    throw error;
  }

  const payload = submission.payloadSnapshot as unknown as FbrInvoicePayload;
  const remote = await validateInvoiceWithFbr({
    environment: submission.environment,
    token,
    payload,
  });
  const valid = remote.ok && acceptedByFbr(remote.body);
  const nextStatus = valid
    ? "VALIDATED"
    : remote.httpStatus === 401
      ? "BLOCKED"
      : remote.ok
        ? "VALIDATION_FAILED"
        : "FAILED";

  const updated = await db.$transaction(async (tx) => {
    await tx.fbrInvoiceAttempt.create({
      data: {
        submissionId: submission.id,
        kind: "VALIDATE",
        requestBody: payload as unknown as Prisma.InputJsonValue,
        responseBody: (remote.body ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        httpStatus: remote.httpStatus || null,
        succeeded: valid,
        errorCode: valid ? null : remote.errorCode ?? (remote.httpStatus === 401 ? "UNAUTHORIZED" : "FBR_VALIDATION_FAILED"),
        errorMessage: valid ? null : remote.errorMessage ?? "FBR validation did not accept the invoice.",
      },
    });

    const saved = await tx.fbrInvoiceSubmission.update({
      where: { id: submission.id },
      data: {
        status: nextStatus,
        validationResponse: (remote.body ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        attemptCount: { increment: 1 },
        validatedAt: valid ? new Date() : null,
        lastAttemptAt: new Date(),
        lastErrorCode: valid ? null : remote.errorCode ?? (remote.httpStatus === 401 ? "UNAUTHORIZED" : "FBR_VALIDATION_FAILED"),
        lastErrorMessage: valid ? null : remote.errorMessage ?? "FBR validation did not accept the invoice.",
      },
    });

    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.user.id,
      action: valid ? "fbr.validation_succeeded" : "fbr.validation_failed",
      entityType: "Invoice",
      entityId: submission.invoiceId,
      metadata: {
        submissionId: submission.id,
        environment: submission.environment,
        httpStatus: remote.httpStatus,
        retryable: remote.retryable,
        errorCode: remote.errorCode ?? null,
      },
    });

    return saved;
  });

  return { status: nextStatus, submission: updated, remote };
}
