import "server-only";
import { Prisma } from "@prisma/client";
import { canPerformAction, type Permission } from "@/lib/server/authorization";
import { outboundGatePassDraftFeatureEnabled } from "@/lib/server/outbound-gate-pass-feature";
import { computeWorkspaceAccess, type SubscriptionSnapshot } from "@/lib/subscriptions/access";

/** Lock persisted authorization and entitlement for the entire financial transaction. */
export async function assertOutboundGatePassActor(
  tx: Prisma.TransactionClient,
  context: { workspaceId: string; userId: string },
  permission: Permission,
) {
  if (!outboundGatePassDraftFeatureEnabled(context.workspaceId)) throw new Error("Gate pass workflow is unavailable in this workspace.");
  const members = await tx.$queryRaw<Array<{ role: import("@prisma/client").Role }>>`
    SELECT "role" FROM "workspace_members"
    WHERE "workspaceId"=${context.workspaceId} AND "userId"=${context.userId}
    FOR SHARE
  `;
  if (!members[0] || !canPerformAction(members[0].role, permission)) throw new Error("Gate pass permission denied.");
  const subscriptions = await tx.$queryRaw<SubscriptionSnapshot[]>`
    SELECT s.*, NULL::text AS "planCode", NULL::text AS "planName"
    FROM "workspace_subscriptions" s WHERE s."workspaceId"=${context.workspaceId}
    FOR SHARE
  `;
  if (!subscriptions[0] || !computeWorkspaceAccess(subscriptions[0]).allowed) throw new Error("Active workspace entitlement required.");
}
