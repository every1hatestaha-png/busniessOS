import "server-only";

import { randomUUID } from "node:crypto";

import type { BusinessType } from "@prisma/client";

import { PROVISIONING_MODULE_KEYS, type ProvisioningModuleKey } from "@/lib/saas/provisioning-selection";
import { db } from "@/lib/server/db";
import { ensureWorkspaceSubscription } from "@/lib/server/subscriptions";
import { withSerializableRetry } from "@/lib/server/tx-retry";
import { onboardingSchema, type OnboardingInput } from "@/lib/validation/onboarding";

type ProvisioningInput = {
  modules: ProvisioningModuleKey[];
  billing: "monthly" | "annual";
  builderBusiness: string | null;
};

type WorkspaceCreationOptions = {
  allowAdditional?: boolean;
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

async function ensureWorkspaceModules(
  workspaceId: string,
  businessType: BusinessType,
  provisioning?: ProvisioningInput,
) {
  const existing = await db.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS "count"
    FROM "workspace_modules"
    WHERE "workspaceId" = ${workspaceId}::uuid
  `;

  const hasExplicitSelection = Boolean(provisioning?.modules.length);
  if ((existing[0]?.count ?? 0) > 0 && !hasExplicitSelection) return;

  const enabled = new Set<ProvisioningModuleKey>(
    hasExplicitSelection ? provisioning!.modules : defaultModulesForBusinessType(businessType),
  );

  await db.$transaction(
    PROVISIONING_MODULE_KEYS.map((moduleKey) =>
      db.$executeRaw`
        INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
        VALUES (${workspaceId}::uuid, ${moduleKey}, ${enabled.has(moduleKey)}, '{}'::jsonb, now())
        ON CONFLICT ("workspaceId", "moduleKey")
        DO UPDATE SET "enabled" = EXCLUDED."enabled", "updatedAt" = now()
      `,
    ),
  );
}

async function recordCheckoutPreference(
  workspaceId: string,
  userId: string,
  provisioning?: ProvisioningInput,
) {
  if (!provisioning) return;

  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "workspace_subscriptions"
    WHERE "workspaceId" = ${workspaceId}
    LIMIT 1
  `;
  const subscriptionId = rows[0]?.id;
  if (!subscriptionId) return;

  const metadata = JSON.stringify({
    billing: provisioning.billing,
    modules: provisioning.modules,
    builderBusiness: provisioning.builderBusiness,
    source: "get-your-munshi",
  });

  await db.$executeRaw`
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

export async function createInitialWorkspace(
  userId: string,
  input: OnboardingInput,
  provisioning?: ProvisioningInput,
  options: WorkspaceCreationOptions = {},
) {
  const data = onboardingSchema.parse(input);
  const nameParts = data.ownerName.split(/\s+/);
  const firstName = nameParts.shift() ?? data.ownerName;
  const lastName = nameParts.join(" ") || null;

  try {
    const result = await withSerializableRetry(async (tx) => {
      const existing = await tx.workspaceMember.findFirst({ where: { userId }, select: { workspaceId: true } });
      if (existing && !options.allowAdditional) return existing;

      if (options.allowAdditional) {
        const recentMatch = await tx.workspaceMember.findFirst({
          where: {
            userId,
            role: "OWNER",
            workspace: {
              name: data.businessName,
              phone: data.phone,
              email: data.email,
              address: data.address,
              city: data.city,
              country: data.country,
              createdAt: { gte: new Date(Date.now() - 5 * 60_000) },
            },
          },
          select: { workspaceId: true },
          orderBy: { workspace: { createdAt: "desc" } },
        });
        if (recentMatch) return recentMatch;
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
        },
        select: { id: true },
      });
      await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId, role: "OWNER" } });
      await tx.user.update({ where: { id: userId }, data: { firstName, lastName } });
      return { workspaceId: workspace.id };
    });

    await ensureWorkspaceSubscription(result.workspaceId);
    await ensureWorkspaceModules(result.workspaceId, data.businessType, provisioning);
    await recordCheckoutPreference(result.workspaceId, userId, provisioning);
    return result;
  } catch (error) {
    if (!options.allowAdditional) {
      const existing = await db.workspaceMember.findFirst({ where: { userId }, select: { workspaceId: true } });
      if (existing) {
        const workspace = await db.workspace.findUnique({
          where: { id: existing.workspaceId },
          select: { businessType: true },
        });
        await ensureWorkspaceSubscription(existing.workspaceId);
        if (workspace) await ensureWorkspaceModules(existing.workspaceId, workspace.businessType, provisioning);
        return existing;
      }
    }
    throw error;
  }
}
