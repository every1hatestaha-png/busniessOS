import "server-only";

import type { Prisma } from "@prisma/client";

export function writeAudit(tx: Prisma.TransactionClient, data: { workspaceId: string; actorId?: string; action: string; entityType: string; entityId: string; metadata?: Prisma.InputJsonValue }) {
  return tx.auditLog.create({ data: { ...data, actorId: data.actorId ?? null } });
}
