import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { writeAudit } from "@/lib/server/audit";
import { canPerformAction } from "@/lib/server/authorization";
import { db } from "@/lib/server/db";
import type { ServiceContext } from "@/lib/server/sales";

const cashCountSchema = z.object({
  countedAmount: z.coerce.number().min(0).max(1000000000),
  notes: z.string().trim().max(500).optional().default(""),
});

export class CashReconciliationError extends Error {}

export async function recordCashDrawerReconciliation(
  context: ServiceContext,
  cashBankAccountId: string,
  input: z.input<typeof cashCountSchema>,
) {
  if (!canPerformAction(context.role, "financial.manage")) throw new CashReconciliationError("Unauthorized.");
  const data = cashCountSchema.parse(input);
  const countedAmount = new Prisma.Decimal(data.countedAmount);

  return db.$transaction(async (tx) => {
    const account = await tx.cashBankAccount.findFirst({
      where: { id: cashBankAccountId, workspaceId: context.workspaceId, isActive: true, isBank: false },
      select: { id: true, name: true, currentBalance: true },
    });
    if (!account) throw new CashReconciliationError("Active cash account not found.");

    const difference = countedAmount.minus(account.currentBalance);
    const audit = await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "cash_drawer.reconciled",
      entityType: "CashBankAccount",
      entityId: account.id,
      metadata: {
        accountName: account.name,
        expectedAmount: account.currentBalance.toString(),
        countedAmount: countedAmount.toString(),
        difference: difference.toString(),
        notes: data.notes,
      },
    });
    return {
      id: audit?.id ?? account.id,
      expectedAmount: account.currentBalance.toNumber(),
      countedAmount: countedAmount.toNumber(),
      difference: difference.toNumber(),
    };
  });
}

export async function listCashDrawerReconciliations(workspaceId: string, cashBankAccountId: string) {
  const rows = await db.auditLog.findMany({
    where: {
      workspaceId,
      entityId: cashBankAccountId,
      entityType: "CashBankAccount",
      action: "cash_drawer.reconciled",
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return rows.map((row) => {
    const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : {};
    return {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      expectedAmount: Number(metadata.expectedAmount ?? 0),
      countedAmount: Number(metadata.countedAmount ?? 0),
      difference: Number(metadata.difference ?? 0),
      notes: typeof metadata.notes === "string" ? metadata.notes : "",
      actorId: row.actorId,
    };
  });
}
