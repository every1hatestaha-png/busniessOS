import "server-only";

import type { Prisma } from "@prisma/client";
import { ownerBillingAuditSchema, ownerBillingDeclarationSchema } from "@/lib/delivery-acceptance/owner-billing-declaration";
import { gatePassIssueStockMode } from "@/lib/delivery-acceptance/issue-stock-rollout";
import { outboundGatePassDraftFeatureEnabled } from "@/lib/server/outbound-gate-pass-feature";
import { writeAudit } from "@/lib/server/audit";
import { assertOutboundGatePassActor } from "@/lib/server/outbound-gate-pass-actor";

export class GatePassBillingAuthorizationError extends Error {}

type Document = { id: string; workspaceId: string; customerId: string; createdAt: Date; status: string; version: number; issueStockDeductedAt: Date | null };
const action = "gate_pass.owner_billing_declared";

function issueMode(gp: Document) {
  return gatePassIssueStockMode(gp.createdAt,
    process.env.OUTBOUND_GP_ISSUE_STOCK_V2_ENABLED,
    process.env.OUTBOUND_GP_ISSUE_STOCK_V2_CUTOVER_AT);
}

/** The explicit legacy opt-in permits real owner authorization at DISPATCH.
 * Existing issued documents keep their dispatch-time stock rule unchanged. */
function eligible(gp: Document) {
  const mode = issueMode(gp);
  const v2 = Boolean(gp.issueStockDeductedAt) || mode === "v2";
  const legacy = mode === "legacy" && !gp.issueStockDeductedAt
    && process.env.OUTBOUND_GP_LEGACY_OWNER_DISPATCH_ENABLED === "true";
  return process.env.OUTBOUND_GP_OWNER_ATTESTATION_ENABLED === "true"
    && outboundGatePassDraftFeatureEnabled(gp.workspaceId)
    && (v2 || legacy);
}

export async function readOwnerBillingDeclaration(db: Pick<Prisma.TransactionClient, "auditLog">, gp: Document) {
  if (!eligible(gp)) return null;
  const row = await db.auditLog.findFirst({
    where: { workspaceId: gp.workspaceId, entityType: "OutboundGatePass", entityId: gp.id, action },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { actorId: true, createdAt: true, metadata: true },
  });
  if (!row?.actorId || row.createdAt < gp.createdAt) return null;
  const parsed = ownerBillingAuditSchema.safeParse(row.metadata);
  if (!parsed.success || parsed.data.customerId !== gp.customerId
    || parsed.data.gatePassCreatedAt !== gp.createdAt.toISOString()) return null;
  return { ...parsed.data, actorId: row.actorId };
}

/** Called only inside the locked, serializable ISSUE transaction. */
export async function recordOwnerBillingDeclaration(
  tx: Prisma.TransactionClient,
  ctx: { workspaceId: string; userId: string },
  gp: Document,
  input: unknown,
) {
  const v2Issue = issueMode(gp) === "v2" && gp.status === "DRAFT";
  const legacyDispatch = issueMode(gp) === "legacy" && gp.status === "ISSUED"
    && !gp.issueStockDeductedAt && process.env.OUTBOUND_GP_LEGACY_OWNER_DISPATCH_ENABLED === "true";
  if (gp.workspaceId !== ctx.workspaceId || !eligible(gp) || !(v2Issue || legacyDispatch))
    throw new GatePassBillingAuthorizationError("Owner declarations require an eligible V2 draft or legacy issued Gate Pass in the enabled workspace.");
  await assertOutboundGatePassActor(tx, ctx, "financial.manage");
  // The lifecycle already holds this membership FOR SHARE. Never trust ctx.role,
  // form fields or a stale session for the declaration's signing authority.
  const member = await tx.workspaceMember.findUnique({ where: {
    workspaceId_userId: { workspaceId: ctx.workspaceId, userId: ctx.userId },
  }, select: { role: true } });
  if (member?.role !== "OWNER") throw new GatePassBillingAuthorizationError("Only the current workspace OWNER can make this declaration.");
  const declaration = ownerBillingDeclarationSchema.parse(input);
  if (declaration.draftVersion !== gp.version)
    throw new GatePassBillingAuthorizationError("This draft changed after review. Refresh and review the current customer and items before declaring.");
  await writeAudit(tx, {
    workspaceId: ctx.workspaceId, actorId: ctx.userId, entityType: "OutboundGatePass", entityId: gp.id, action,
    metadata: { ...declaration, version: 1, kind: "OWNER_DECLARATION_NOT_INDEPENDENT_CLEARANCE", actorRole: "OWNER",
      customerId: gp.customerId, gatePassCreatedAt: gp.createdAt.toISOString(),
      declarationStage: v2Issue ? "V2_ISSUE" : "LEGACY_DISPATCH" },
  });
}
