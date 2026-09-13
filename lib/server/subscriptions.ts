import "server-only";

import { randomUUID } from "node:crypto";
import { auth, clerkClient } from "@clerk/nextjs/server";
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

const PLATFORM_PLANS = new Set(["starter", "business", "pro"]);

function assertWorkspaceId(workspaceId: string) {
  const value = workspaceId.trim();
  if (!value || value.length > 128) throw new Error("Invalid workspace.");
  return value;
}

function assertDays(days: number, max: number) {
  if (!Number.isInteger(days) || days < 1 || days > max) {
    throw new Error(`Days must be a whole number between 1 and ${max}.`);
  }
  return days;
}

export async function ensureWorkspaceSubscription(workspaceId: string) {
  const safeWorkspaceId = assertWorkspaceId(workspaceId);
  const id = `sub_${randomUUID().replaceAll("-", "")}`;
  await db.$executeRaw`
    INSERT INTO "workspace_subscriptions" (
      "id", "workspaceId", "planId", "status", "trialStartedAt", "trialEndsAt"
    )
    VALUES (
      ${id},
      ${safeWorkspaceId},
      (SELECT "id" FROM "saas_plans" WHERE "code" = 'starter' LIMIT 1),
      'TRIALING',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP + INTERVAL '30 days'
    )
    ON CONFLICT ("workspaceId") DO NOTHING
  `;
}

export async function getWorkspaceAccess(workspaceId: string): Promise<WorkspaceAccess> {
  const safeWorkspaceId = assertWorkspaceId(workspaceId);
  await ensureWorkspaceSubscription(safeWorkspaceId);
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
    WHERE s."workspaceId" = ${safeWorkspaceId}
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
  const configuredOwner = process.env.MUNSHIOS_PLATFORM_OWNER_EMAIL?.trim().toLowerCase();
  if (!configuredOwner) redirect("/dashboard");

  const session = await auth({ acceptsToken: ["session_token", "oauth_token"] });
  const userId = "userId" in session ? session.userId : null;
  if (!userId) redirect("/platform/sign-in");

  const clerkUser = await (await clerkClient()).users.getUser(userId);
  const primaryEmailAddress =
    clerkUser.emailAddresses.find((email) => email.id === clerkUser.primaryEmailAddressId) ??
    clerkUser.emailAddresses[0];
  const authenticatedEmail = primaryEmailAddress?.emailAddress?.trim().toLowerCase();

  if (
    !authenticatedEmail ||
    primaryEmailAddress?.verification?.status !== "verified" ||
    authenticatedEmail !== configuredOwner
  ) {
    redirect("/dashboard");
  }

  const user = await getCurrentUser();
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

  const metrics = workspaces.reduce(
    (acc, workspace) => {
      acc.total += 1;
      if (workspace.status === "TRIALING") acc.trials += 1;
      if (workspace.status === "ACTIVE") acc.paid += 1;
      if (workspace.status === "SUSPENDED") acc.suspended += 1;
      if (workspace.status === "EXPIRED") acc.expired += 1;
      if (workspace.status === "TRIALING" || workspace.status === "ACTIVE" || workspace.status === "GRACE") acc.active += 1;
      return acc;
    },
    { total: 0, active: 0, trials: 0, paid: 0, suspended: 0, expired: 0 },
  );

  return { workspaces, metrics };
}

async function writeSubscriptionAudit(input: {
  workspaceId: string;
  action: string;
  beforeState: unknown;
  afterState: unknown;
}) {
  const actor = await getCurrentUser();
  const beforeRecord = input.beforeState && typeof input.beforeState === "object"
    ? input.beforeState as Record<string, unknown>
    : null;
  const afterRecord = input.afterState && typeof input.afterState === "object"
    ? input.afterState as Record<string, unknown>
    : null;
  const subscriptionId = String(afterRecord?.id ?? beforeRecord?.id ?? "").trim();
  if (!subscriptionId) throw new Error("Subscription audit could not resolve the subscription id.");
  const metadata = JSON.stringify({ beforeState: input.beforeState, afterState: input.afterState });

  await db.$executeRaw`
    INSERT INTO "subscription_events" (
      "id", "workspaceId", "subscriptionId", "actorUserId", "type", "metadata"
    )
    VALUES (
      ${`sevt_${randomUUID().replaceAll("-", "")}`},
      ${input.workspaceId},
      ${subscriptionId},
      ${actor.id},
      ${input.action},
      ${metadata}::jsonb
    )
  `;
}

async function getSubscriptionRow(workspaceId: string) {
  const safeWorkspaceId = assertWorkspaceId(workspaceId);
  const rows = await db.$queryRaw<Record<string, unknown>[]>`
    SELECT s.*, p."code" AS "planCode", p."name" AS "planName"
    FROM "workspace_subscriptions" s
    LEFT JOIN "saas_plans" p ON p."id" = s."planId"
    WHERE s."workspaceId" = ${safeWorkspaceId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function extendWorkspaceTrial(workspaceId: string, days: number) {
  await requirePlatformOwner();
  const safeWorkspaceId = assertWorkspaceId(workspaceId);
  const safeDays = assertDays(days, 365);
  const before = await getSubscriptionRow(safeWorkspaceId);
  if (!before) throw new Error("Customer subscription not found.");
  await db.$executeRaw`
    UPDATE "workspace_subscriptions"
    SET
      "status" = 'TRIALING',
      "trialEndsAt" = GREATEST(COALESCE("trialEndsAt", CURRENT_TIMESTAMP), CURRENT_TIMESTAMP) + (${safeDays} * INTERVAL '1 day'),
      "suspendedAt" = NULL,
      "suspensionReason" = NULL,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "workspaceId" = ${safeWorkspaceId}
  `;
  const after = await getSubscriptionRow(safeWorkspaceId);
  await writeSubscriptionAudit({ workspaceId: safeWorkspaceId, action: "trial.extended", beforeState: before, afterState: after });
}

export async function activateWorkspaceSubscription(workspaceId: string, planCode: string, days: number) {
  await requirePlatformOwner();
  const safeWorkspaceId = assertWorkspaceId(workspaceId);
  const safePlanCode = planCode.trim().toLowerCase();
  if (!PLATFORM_PLANS.has(safePlanCode)) throw new Error("Invalid subscription plan.");
  const safeDays = assertDays(days, 1095);
  const before = await getSubscriptionRow(safeWorkspaceId);
  if (!before) throw new Error("Customer subscription not found.");
  await db.$executeRaw`
    UPDATE "workspace_subscriptions"
    SET
      "planId" = (SELECT "id" FROM "saas_plans" WHERE "code" = ${safePlanCode} LIMIT 1),
      "status" = 'ACTIVE',
      "currentPeriodStart" = CURRENT_TIMESTAMP,
      "currentPeriodEnd" = CURRENT_TIMESTAMP + (${safeDays} * INTERVAL '1 day'),
      "graceEndsAt" = NULL,
      "suspendedAt" = NULL,
      "suspensionReason" = NULL,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "workspaceId" = ${safeWorkspaceId}
  `;
  const after = await getSubscriptionRow(safeWorkspaceId);
  await writeSubscriptionAudit({ workspaceId: safeWorkspaceId, action: "subscription.activated", beforeState: before, afterState: after });
}

export async function grantWorkspaceGrace(workspaceId: string, days: number) {
  await requirePlatformOwner();
  const safeWorkspaceId = assertWorkspaceId(workspaceId);
  const safeDays = assertDays(days, 90);
  const before = await getSubscriptionRow(safeWorkspaceId);
  if (!before) throw new Error("Customer subscription not found.");
  await db.$executeRaw`
    UPDATE "workspace_subscriptions"
    SET
      "status" = 'GRACE',
      "graceEndsAt" = CURRENT_TIMESTAMP + (${safeDays} * INTERVAL '1 day'),
      "suspendedAt" = NULL,
      "suspensionReason" = NULL,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "workspaceId" = ${safeWorkspaceId}
  `;
  const after = await getSubscriptionRow(safeWorkspaceId);
  await writeSubscriptionAudit({ workspaceId: safeWorkspaceId, action: "subscription.grace_granted", beforeState: before, afterState: after });
}

export async function suspendWorkspaceSubscription(workspaceId: string, reason: string) {
  await requirePlatformOwner();
  const safeWorkspaceId = assertWorkspaceId(workspaceId);
  const safeReason = reason.trim();
  if (!safeReason || safeReason.length > 240) throw new Error("Suspension reason must be between 1 and 240 characters.");
  const before = await getSubscriptionRow(safeWorkspaceId);
  if (!before) throw new Error("Customer subscription not found.");
  await db.$executeRaw`
    UPDATE "workspace_subscriptions"
    SET
      "status" = 'SUSPENDED',
      "suspendedAt" = CURRENT_TIMESTAMP,
      "suspensionReason" = ${safeReason},
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "workspaceId" = ${safeWorkspaceId}
  `;
  const after = await getSubscriptionRow(safeWorkspaceId);
  await writeSubscriptionAudit({ workspaceId: safeWorkspaceId, action: "subscription.suspended", beforeState: before, afterState: after });
}
