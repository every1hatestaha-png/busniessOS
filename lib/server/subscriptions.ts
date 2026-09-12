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
  if (!configuredOwner) redirect("/dashboard");

  // Platform authorization must follow the authenticated Clerk identity, not a
  // potentially stale email stored in the local users table. The local row may
  // pre-date an email change/relink while the Clerk session is still correct.
  const session = await auth({ acceptsToken: ["session_token", "oauth_token"] });
  const userId = "userId" in session ? session.userId : null;
  if (!userId) redirect("/sign-in");

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
  await db.$executeRaw`
    INSERT INTO "subscription_events" (
      "id", "workspaceId", "actorUserId", "action", "beforeState", "afterState"
    )
    VALUES (
      ${`sevt_${randomUUID().replaceAll("-", "")}`},
      ${input.workspaceId},
      ${actor.id},
      ${input.action},
      ${JSON.stringify(input.beforeState)}::jsonb,
      ${JSON.stringify(input.afterState)}::jsonb
    )
  `;
}

async function getSubscriptionRow(workspaceId: string) {
  const rows = await db.$queryRaw<Record<string, unknown>[]>`
    SELECT s.*, p."code" AS "planCode", p."name" AS "planName"
    FROM "workspace_subscriptions" s
    LEFT JOIN "saas_plans" p ON p."id" = s."planId"
    WHERE s."workspaceId" = ${workspaceId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function extendWorkspaceTrial(workspaceId: string, days: number) {
  await requirePlatformOwner();
  const before = await getSubscriptionRow(workspaceId);
  await db.$executeRaw`
    UPDATE "workspace_subscriptions"
    SET
      "status" = 'TRIALING',
      "trialEndsAt" = GREATEST(COALESCE("trialEndsAt", CURRENT_TIMESTAMP), CURRENT_TIMESTAMP) + (${days} * INTERVAL '1 day'),
      "suspendedAt" = NULL,
      "suspensionReason" = NULL,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "workspaceId" = ${workspaceId}
  `;
  const after = await getSubscriptionRow(workspaceId);
  await writeSubscriptionAudit({ workspaceId, action: "trial.extended", beforeState: before, afterState: after });
}

export async function activateWorkspaceSubscription(workspaceId: string, planCode: string, days: number) {
  await requirePlatformOwner();
  const before = await getSubscriptionRow(workspaceId);
  await db.$executeRaw`
    UPDATE "workspace_subscriptions"
    SET
      "planId" = (SELECT "id" FROM "saas_plans" WHERE "code" = ${planCode} LIMIT 1),
      "status" = 'ACTIVE',
      "currentPeriodStart" = CURRENT_TIMESTAMP,
      "currentPeriodEnd" = CURRENT_TIMESTAMP + (${days} * INTERVAL '1 day'),
      "graceEndsAt" = NULL,
      "suspendedAt" = NULL,
      "suspensionReason" = NULL,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "workspaceId" = ${workspaceId}
  `;
  const after = await getSubscriptionRow(workspaceId);
  await writeSubscriptionAudit({ workspaceId, action: "subscription.activated", beforeState: before, afterState: after });
}

export async function grantWorkspaceGrace(workspaceId: string, days: number) {
  await requirePlatformOwner();
  const before = await getSubscriptionRow(workspaceId);
  await db.$executeRaw`
    UPDATE "workspace_subscriptions"
    SET
      "status" = 'GRACE',
      "graceEndsAt" = CURRENT_TIMESTAMP + (${days} * INTERVAL '1 day'),
      "suspendedAt" = NULL,
      "suspensionReason" = NULL,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "workspaceId" = ${workspaceId}
  `;
  const after = await getSubscriptionRow(workspaceId);
  await writeSubscriptionAudit({ workspaceId, action: "subscription.grace_granted", beforeState: before, afterState: after });
}

export async function suspendWorkspaceSubscription(workspaceId: string, reason: string) {
  await requirePlatformOwner();
  const before = await getSubscriptionRow(workspaceId);
  await db.$executeRaw`
    UPDATE "workspace_subscriptions"
    SET
      "status" = 'SUSPENDED',
      "suspendedAt" = CURRENT_TIMESTAMP,
      "suspensionReason" = ${reason},
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "workspaceId" = ${workspaceId}
  `;
  const after = await getSubscriptionRow(workspaceId);
  await writeSubscriptionAudit({ workspaceId, action: "subscription.suspended", beforeState: before, afterState: after });
}
