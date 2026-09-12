import "server-only";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

import { db } from "@/lib/server/db";
import { getCurrentUser, requireWorkspace } from "@/lib/server/auth";
import {
  computeWorkspaceAccess,
  type SubscriptionSnapshot,
  type SubscriptionStatus,
  type WorkspaceAccess,
} from "@/lib/subscriptions/access";

export type { WorkspaceAccess } from "@/lib/subscriptions/access";

export async function ensureWorkspaceSubscription(workspaceId: string) {
  const id = `sub_${randomUUID().replaceAll("-", "")}`;
  await db.$executeRaw`
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

export async function getWorkspaceAccess(workspaceId: string): Promise<WorkspaceAccess> {
  await ensureWorkspaceSubscription(workspaceId);
  const rows = await db.$queryRaw<SubscriptionSnapshot[]>`
    SELECT
      s."id",
      s."workspaceId",
      s."planId",
      p."code" AS "planCode",
      p."name" AS "planName",
      s."status",
      s."trialStartedAt",
      s."trialEndsAt",
      s."currentPeriodStart",
      s."currentPeriodEnd",
      s."graceEndsAt",
      s."overrideUntil",
      s."suspendedAt",
      s."suspensionReason"
    FROM "workspace_subscriptions" s
    LEFT JOIN "saas_plans" p ON p."id" = s."planId"
    WHERE s."workspaceId" = ${workspaceId}
    LIMIT 1
  `;

  if (!rows[0]) throw new Error("Workspace subscription could not be initialized.");
  return computeWorkspaceAccess(rows[0]);
}

export async function requireWorkspaceAccess() {
  const context = await requireWorkspace();
  const access = await getWorkspaceAccess(context.workspaceId);
  if (!access.allowed) redirect("/subscription");
  return { ...context, subscription: access };
}

export async function requirePlatformOwner() {
  const user = await getCurrentUser();
  const configuredOwner = process.env.MUNSHIOS_PLATFORM_OWNER_EMAIL?.trim().toLowerCase();
  if (!configuredOwner || user.email.toLowerCase() !== configuredOwner) redirect("/dashboard");
  return user;
}

export type PlatformWorkspaceRow = {
  workspaceId: string;
  workspaceName: string;
  workspaceEmail: string | null;
  workspaceCity: string | null;
  ownerEmail: string | null;
  memberCount: number;
  planCode: string | null;
  planName: string | null;
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  graceEndsAt: Date | null;
  suspendedAt: Date | null;
  createdAt: Date;
};

export async function getPlatformDashboard() {
  await requirePlatformOwner();

  const workspaces = await db.$queryRaw<PlatformWorkspaceRow[]>`
    SELECT
      w."id" AS "workspaceId",
      w."name" AS "workspaceName",
      w."email" AS "workspaceEmail",
      w."city" AS "workspaceCity",
      owner_user."email" AS "ownerEmail",
      COUNT(DISTINCT wm."id")::int AS "memberCount",
      p."code" AS "planCode",
      p."name" AS "planName",
      s."status",
      s."trialEndsAt",
      s."currentPeriodEnd",
      s."graceEndsAt",
      s."suspendedAt",
      w."createdAt"
    FROM "workspaces" w
    JOIN "workspace_subscriptions" s ON s."workspaceId" = w."id"
    LEFT JOIN "saas_plans" p ON p."id" = s."planId"
    LEFT JOIN "workspace_members" wm ON wm."workspaceId" = w."id"
    LEFT JOIN "workspace_members" owner_member ON owner_member."workspaceId" = w."id" AND owner_member."role" = 'OWNER'
    LEFT JOIN "users" owner_user ON owner_user."id" = owner_member."userId"
    GROUP BY w."id", owner_user."email", p."code", p."name", s."status", s."trialEndsAt", s."currentPeriodEnd", s."graceEndsAt", s."suspendedAt"
    ORDER BY w."createdAt" DESC
  `;

  const now = Date.now();
  const active = workspaces.filter((w) => {
    if (w.status === "SUSPENDED") return false;
    if (w.status === "ACTIVE" && (!w.currentPeriodEnd || w.currentPeriodEnd.getTime() > now)) return true;
    if (w.status === "TRIALING" && w.trialEndsAt && w.trialEndsAt.getTime() > now) return true;
    return Boolean(w.graceEndsAt && w.graceEndsAt.getTime() > now);
  }).length;

  return {
    workspaces,
    metrics: {
      total: workspaces.length,
      active,
      trials: workspaces.filter((w) => w.status === "TRIALING" && w.trialEndsAt && w.trialEndsAt.getTime() > now).length,
      paid: workspaces.filter((w) => w.status === "ACTIVE").length,
      suspended: workspaces.filter((w) => w.status === "SUSPENDED").length,
      expired: workspaces.filter((w) => w.status === "EXPIRED" || w.status === "CANCELLED" || (w.status === "TRIALING" && (!w.trialEndsAt || w.trialEndsAt.getTime() <= now))).length,
    },
  };
}

async function writeSubscriptionEvent(workspaceId: string, subscriptionId: string, actorUserId: string, type: string, metadata: object) {
  await db.$executeRaw`
    INSERT INTO "subscription_events" ("id", "workspaceId", "subscriptionId", "actorUserId", "type", "metadata")
    VALUES (${`evt_${randomUUID().replaceAll("-", "")}`}, ${workspaceId}, ${subscriptionId}, ${actorUserId}, ${type}, ${JSON.stringify(metadata)}::jsonb)
  `;
}

export async function extendTrial(workspaceId: string, days: number) {
  const actor = await requirePlatformOwner();
  const safeDays = Math.max(1, Math.min(365, Math.trunc(days)));
  const rows = await db.$queryRaw<{ id: string }[]>`
    UPDATE "workspace_subscriptions"
    SET
      "status" = 'TRIALING',
      "trialEndsAt" = GREATEST(COALESCE("trialEndsAt", CURRENT_TIMESTAMP), CURRENT_TIMESTAMP) + (${safeDays} * INTERVAL '1 day'),
      "suspendedAt" = NULL,
      "suspensionReason" = NULL,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "workspaceId" = ${workspaceId}
    RETURNING "id"
  `;
  if (!rows[0]) throw new Error("Subscription not found.");
  await writeSubscriptionEvent(workspaceId, rows[0].id, actor.id, "TRIAL_EXTENDED", { days: safeDays });
}

export async function activateSubscription(workspaceId: string, planCode: string, days = 30) {
  const actor = await requirePlatformOwner();
  const safeDays = Math.max(1, Math.min(3660, Math.trunc(days)));
  const rows = await db.$queryRaw<{ id: string }[]>`
    UPDATE "workspace_subscriptions" s
    SET
      "planId" = p."id",
      "status" = 'ACTIVE',
      "currentPeriodStart" = CURRENT_TIMESTAMP,
      "currentPeriodEnd" = CURRENT_TIMESTAMP + (${safeDays} * INTERVAL '1 day'),
      "graceEndsAt" = NULL,
      "suspendedAt" = NULL,
      "suspensionReason" = NULL,
      "updatedAt" = CURRENT_TIMESTAMP
    FROM "saas_plans" p
    WHERE s."workspaceId" = ${workspaceId} AND p."code" = ${planCode} AND p."isActive" = true
    RETURNING s."id"
  `;
  if (!rows[0]) throw new Error("Subscription or plan not found.");
  await writeSubscriptionEvent(workspaceId, rows[0].id, actor.id, "SUBSCRIPTION_ACTIVATED", { planCode, days: safeDays });
}

export async function suspendSubscription(workspaceId: string, reason: string) {
  const actor = await requirePlatformOwner();
  const cleanReason = reason.trim().slice(0, 500) || "Suspended by platform owner";
  const rows = await db.$queryRaw<{ id: string }[]>`
    UPDATE "workspace_subscriptions"
    SET "status" = 'SUSPENDED', "suspendedAt" = CURRENT_TIMESTAMP, "suspensionReason" = ${cleanReason}, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "workspaceId" = ${workspaceId}
    RETURNING "id"
  `;
  if (!rows[0]) throw new Error("Subscription not found.");
  await writeSubscriptionEvent(workspaceId, rows[0].id, actor.id, "SUBSCRIPTION_SUSPENDED", { reason: cleanReason });
}

export async function grantGracePeriod(workspaceId: string, days: number) {
  const actor = await requirePlatformOwner();
  const safeDays = Math.max(1, Math.min(90, Math.trunc(days)));
  const rows = await db.$queryRaw<{ id: string }[]>`
    UPDATE "workspace_subscriptions"
    SET "graceEndsAt" = CURRENT_TIMESTAMP + (${safeDays} * INTERVAL '1 day'), "updatedAt" = CURRENT_TIMESTAMP
    WHERE "workspaceId" = ${workspaceId}
    RETURNING "id"
  `;
  if (!rows[0]) throw new Error("Subscription not found.");
  await writeSubscriptionEvent(workspaceId, rows[0].id, actor.id, "GRACE_GRANTED", { days: safeDays });
}
