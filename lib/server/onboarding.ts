import "server-only";

import { randomUUID } from "node:crypto";

import { Prisma, type BusinessType } from "@prisma/client";

import { PROVISIONING_MODULE_KEYS, type ProvisioningModuleKey } from "@/lib/saas/provisioning-selection";
import { writeAudit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { withSerializableRetry } from "@/lib/server/tx-retry";
import { onboardingSchema, type OnboardingInput } from "@/lib/validation/onboarding";
import { initialVerticalForBusinessType } from "@/lib/verticals/registry";

type ProvisioningInput = {
  modules: ProvisioningModuleKey[];
  billing: "monthly" | "annual";
  builderBusiness: string | null;
};

type WorkspaceCreationOptions = {
  allowAdditional?: boolean;
  provisioningRequestId?: string;
};

function defaultModulesForBusinessType(businessType: BusinessType): ProvisioningModuleKey[] {
  switch (businessType) {
    case "RETAILER":
      return ["inventory"];
    case "MANUFACTURER":
      return ["inventory", "wholesale", "manufacturing", "accounting"];
    case "DISTRIBUTOR":
    case "WHOLESALER":
      return ["inventory", "wholesale", "accounting"];
    case "OTHER":
    default:
      return ["accounting"];
  }
}

function sanitizeProvisioningRequestId(value?: string) {
  const requestId = value?.trim();
  if (!requestId) return randomUUID();
  if (!/^[A-Za-z0-9:_-]{8,128}$/.test(requestId)) throw new Error("Invalid workspace provisioning request.");
  return requestId;
}

async function ensureWorkspaceSubscriptionInTransaction(tx: Prisma.TransactionClient, workspaceId: string) {
  const id = `sub_${randomUUID().replaceAll("-", "")}`;
  await tx.$executeRaw`
    INSERT INTO "workspace_subscriptions" (
      "id", "workspaceId", "planId", "status", "trialStartedAt", "trialEndsAt"
    )
    VALUES (
      ${id},
      ${workspaceId},
      (SELECT "id" FROM "saas_plans" WHERE "code" = 'starter' LIMIT 1),
      'TRIALING',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP + INTERVAL '30 days'
    )
    ON CONFLICT ("workspaceId") DO NOTHING
  `;
}

async function ensureWorkspaceModulesInTransaction(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  businessType: BusinessType,
  provisioning?: ProvisioningInput,
) {
  const existing = await tx.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS "count"
    FROM "workspace_modules"
    WHERE "workspaceId" = ${workspaceId}::uuid
  `;

  const hasExplicitSelection = Boolean(provisioning?.modules.length);
  if ((existing[0]?.count ?? 0) > 0 && !hasExplicitSelection) return;

  const enabled = new Set<ProvisioningModuleKey>(
    hasExplicitSelection ? provisioning!.modules : defaultModulesForBusinessType(businessType),
  );

  for (const moduleKey of PROVISIONING_MODULE_KEYS) {
    await tx.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceId}::uuid, ${moduleKey}, ${enabled.has(moduleKey)}, '{}'::jsonb, now())
      ON CONFLICT ("workspaceId", "moduleKey")
      DO UPDATE SET "enabled" = EXCLUDED."enabled", "updatedAt" = now()
    `;
  }
}

async function recordCheckoutPreferenceInTransaction(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  userId: string,
  provisioning?: ProvisioningInput,
) {
  if (!provisioning) return;

  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "workspace_subscriptions"
    WHERE "workspaceId" = ${workspaceId}
    LIMIT 1
  `;
  const subscriptionId = rows[0]?.id;
  if (!subscriptionId) throw new Error("Workspace subscription could not be initialized.");

  const metadata = JSON.stringify({
    billing: provisioning.billing,
    modules: provisioning.modules,
    builderBusiness: provisioning.builderBusiness,
    source: "get-your-munshi",
  });

  await tx.$executeRaw`
    INSERT INTO "subscription_events" (
      "id", "workspaceId", "subscriptionId", "actorUserId", "type", "metadata"
    )
    VALUES (
      ${`sevt_${randomUUID().replaceAll("-", "")}`},
      ${workspaceId},
      ${subscriptionId},
      ${userId},
      'checkout.preference_captured',
      ${metadata}::jsonb
    )
  `;
}

async function findProvisionedWorkspace(
  tx: Prisma.TransactionClient,
  userId: string,
  provisioningRequestId: string,
) {
  const rows = await tx.$queryRaw<Array<{ workspaceId: string }>>`
    SELECT a."entityId" AS "workspaceId"
    FROM "audit_logs" a
    INNER JOIN "workspace_members" m
      ON m."workspaceId" = a."entityId"::uuid
      AND m."userId" = ${userId}::uuid
    WHERE a."actorId" = ${userId}::uuid
      AND a."action" = 'workspace.provisioned'
      AND a."entityType" = 'Workspace'
      AND a."metadata"->>'provisioningRequestId' = ${provisioningRequestId}
    ORDER BY a."createdAt" DESC
    LIMIT 1
  `;
  return rows[0]?.workspaceId ?? null;
}

export async function createInitialWorkspace(
  userId: string,
  input: OnboardingInput,
  provisioning?: ProvisioningInput,
  options: WorkspaceCreationOptions = {},
) {
  const data = onboardingSchema.parse(input);
  if (provisioning?.builderBusiness === "restaurant" || provisioning?.builderBusiness === "services"
    || provisioning?.modules.some((module) => module === "restaurant" || module === "services")) {
    throw new Error("This workspace experience is not available for new workspaces yet.");
  }

  const provisioningRequestId = sanitizeProvisioningRequestId(options.provisioningRequestId);
  const nameParts = data.ownerName.split(/\s+/);
  const firstName = nameParts.shift() ?? data.ownerName;
  const lastName = nameParts.join(" ") || null;

  return withSerializableRetry(async (tx) => {
    // Serialize provisioning for one user so double submits cannot create two workspaces.
    const lockedUsers = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"::text AS "id" FROM "users" WHERE "id" = ${userId}::uuid FOR UPDATE
    `;
    if (!lockedUsers[0]) throw new Error("User not found.");

    const alreadyProvisioned = await findProvisionedWorkspace(tx, userId, provisioningRequestId);
    if (alreadyProvisioned) return { workspaceId: alreadyProvisioned };

    const existing = await tx.workspaceMember.findFirst({ where: { userId }, select: { workspaceId: true } });
    if (existing && !options.allowAdditional) {
      const workspace = await tx.workspace.findUnique({ where: { id: existing.workspaceId }, select: { businessType: true } });
      await ensureWorkspaceSubscriptionInTransaction(tx, existing.workspaceId);
      if (workspace) await ensureWorkspaceModulesInTransaction(tx, existing.workspaceId, workspace.businessType, provisioning);
      return existing;
    }

    const workspace = await tx.workspace.create({
      data: {
        name: data.businessName,
        phone: data.phone,
        email: data.email,
        address: data.address,
        city: data.city,
        country: data.country,
        currency: data.currency.toUpperCase(),
        timezone: data.timezone,
        businessType: data.businessType,
        vertical: initialVerticalForBusinessType(data.businessType),
      },
      select: { id: true, vertical: true },
    });

    await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId, role: "OWNER" } });
    await tx.user.update({ where: { id: userId }, data: { firstName, lastName } });
    await ensureWorkspaceSubscriptionInTransaction(tx, workspace.id);
    await ensureWorkspaceModulesInTransaction(tx, workspace.id, data.businessType, provisioning);
    await recordCheckoutPreferenceInTransaction(tx, workspace.id, userId, provisioning);
    await writeAudit(tx, {
      workspaceId: workspace.id,
      actorId: userId,
      action: "workspace.provisioned",
      entityType: "Workspace",
      entityId: workspace.id,
      metadata: {
        provisioningRequestId,
        vertical: workspace.vertical,
        businessType: data.businessType,
        modules: provisioning?.modules ?? defaultModulesForBusinessType(data.businessType),
        billing: provisioning?.billing ?? null,
        builderBusiness: provisioning?.builderBusiness ?? null,
        source: provisioning ? "get-your-munshi" : "onboarding",
      },
    });

    return { workspaceId: workspace.id };
  });
}
