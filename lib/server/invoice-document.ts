import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/server/db";
import { withSerializableRetry } from "@/lib/server/tx-retry";
import { writeAudit } from "@/lib/server/audit";

export class InvoiceDocumentError extends Error {}

export function deriveDcNumber(invoiceNumber: string) {
  const clean = invoiceNumber.trim().toUpperCase();
  if (clean.startsWith("INV-")) return `DC-${clean.slice(4)}`;
  const suffix = clean.replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `DC-${suffix || "0001"}`.slice(0, 32);
}

export function normalizeDcNumber(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9/_-]{1,31}$/.test(normalized)) {
    throw new InvoiceDocumentError("DC number must be 2-32 characters using letters, numbers, /, _ or -.");
  }
  return normalized;
}

function collisionCandidate(base: string, attempt: number) {
  if (attempt === 0) return base;
  const numeric = /^DC-(\d+)$/.exec(base);
  if (numeric) {
    const width = numeric[1].length;
    return `DC-${String(Number(numeric[1]) + attempt).padStart(width, "0")}`;
  }
  return `${base.slice(0, 27)}-${String(attempt).padStart(4, "0")}`;
}

async function reserveInvoiceDocumentMetadata(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  invoiceId: string,
  invoiceNumber: string,
) {
  const existing = await tx.$queryRaw<Array<{ dcNumber: string; notes: string | null }>>`
    SELECT "dcNumber", "notes"
    FROM "invoice_document_metadata"
    WHERE "workspaceId" = ${workspaceId} AND "invoiceId" = ${invoiceId}
    LIMIT 1
  `;
  if (existing[0]) return existing[0];

  const base = deriveDcNumber(invoiceNumber);
  for (let attempt = 0; attempt <= 9999; attempt += 1) {
    const dcNumber = collisionCandidate(base, attempt);
    const inserted = await tx.$executeRaw`
      INSERT INTO "invoice_document_metadata" ("invoiceId", "workspaceId", "dcNumber", "createdAt", "updatedAt")
      VALUES (${invoiceId}, ${workspaceId}, ${dcNumber}, NOW(), NOW())
      ON CONFLICT DO NOTHING
    `;
    if (inserted === 1) return { dcNumber, notes: null };

    const byInvoice = await tx.$queryRaw<Array<{ dcNumber: string; notes: string | null }>>`
      SELECT "dcNumber", "notes"
      FROM "invoice_document_metadata"
      WHERE "workspaceId" = ${workspaceId} AND "invoiceId" = ${invoiceId}
      LIMIT 1
    `;
    if (byInvoice[0]) return byInvoice[0];
  }
  throw new InvoiceDocumentError("A unique DC number could not be allocated.");
}

export async function getInvoiceDocumentMetadata(workspaceId: string, invoiceId: string, invoiceNumber: string) {
  const rows = await db.$queryRaw<Array<{ dcNumber: string; notes: string | null }>>`
    SELECT "dcNumber", "notes"
    FROM "invoice_document_metadata"
    WHERE "workspaceId" = ${workspaceId} AND "invoiceId" = ${invoiceId}
    LIMIT 1
  `;
  if (rows[0]) return rows[0];
  return withSerializableRetry((tx) => reserveInvoiceDocumentMetadata(tx, workspaceId, invoiceId, invoiceNumber));
}

export async function updateInvoiceDocumentDetails(
  context: { workspaceId: string; userId?: string },
  invoiceId: string,
  input: { issuedAt: Date; dueDate: Date | null; dcNumber: string; notes: string },
) {
  const dcNumber = normalizeDcNumber(input.dcNumber);
  if (input.dueDate && input.dueDate.getTime() < input.issuedAt.getTime()) {
    throw new InvoiceDocumentError("Due date cannot be earlier than the invoice issue date.");
  }
  if (input.notes.length > 500) throw new InvoiceDocumentError("Notes cannot exceed 500 characters.");

  return withSerializableRetry(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, workspaceId: context.workspaceId },
      select: { id: true, invoiceNumber: true, status: true },
    });
    if (!invoice) throw new InvoiceDocumentError("Invoice not found.");
    if (invoice.status === "CANCELLED") throw new InvoiceDocumentError("A cancelled invoice cannot be edited.");

    await tx.invoice.update({
      where: { id: invoice.id, workspaceId: context.workspaceId },
      data: { issuedAt: input.issuedAt, dueDate: input.dueDate },
    });

    try {
      await tx.$executeRaw`
        INSERT INTO "invoice_document_metadata" ("invoiceId", "workspaceId", "dcNumber", "notes", "createdAt", "updatedAt")
        VALUES (${invoice.id}, ${context.workspaceId}, ${dcNumber}, ${input.notes || null}, NOW(), NOW())
        ON CONFLICT ("invoiceId") DO UPDATE SET
          "dcNumber" = EXCLUDED."dcNumber",
          "notes" = EXCLUDED."notes",
          "updatedAt" = NOW()
      `;
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (message.includes("invoice_document_metadata_workspaceid_dcnumber_key") || message.includes("unique")) {
        throw new InvoiceDocumentError("That DC number is already in use.");
      }
      throw error;
    }

    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "invoice.document_updated",
      entityType: "Invoice",
      entityId: invoice.id,
      metadata: {
        invoiceNumber: invoice.invoiceNumber,
        dcNumber,
        issuedAt: input.issuedAt.toISOString(),
        dueDate: input.dueDate?.toISOString() ?? null,
      } as Prisma.InputJsonValue,
    });

    return { id: invoice.id, dcNumber };
  });
}
