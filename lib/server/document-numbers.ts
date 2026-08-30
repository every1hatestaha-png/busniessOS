import "server-only";

import type { DocumentKind, Prisma } from "@prisma/client";

const prefixes: Record<DocumentKind, string> = { SALES_ORDER: "SO", PURCHASE_ORDER: "PO", INVOICE: "INV", PAYMENT_RECEIPT: "PAY", CREDIT_NOTE: "CN", DEBIT_NOTE: "DN", CUSTOMER_RETURN: "CR", SUPPLIER_RETURN: "SR", EXPENSE_VOUCHER: "EXP" };

export async function nextDocumentNumber(tx: Prisma.TransactionClient, workspaceId: string, kind: DocumentKind) {
  const sequence = await tx.documentSequence.upsert({
    where: { workspaceId_kind: { workspaceId, kind } },
    create: { workspaceId, kind, nextNumber: 2 },
    update: { nextNumber: { increment: 1 } },
    select: { nextNumber: true },
  });
  return `${prefixes[kind]}-${String(sequence.nextNumber - 1).padStart(6, "0")}`;
}
