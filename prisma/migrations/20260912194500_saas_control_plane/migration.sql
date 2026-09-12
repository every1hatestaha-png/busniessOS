-- SaaS control plane: plans, workspace subscriptions, and auditable billing events.

CREATE TABLE "saas_plans" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "billingInterval" TEXT NOT NULL DEFAULT 'MONTHLY',
  "pricePkr" DECIMAL(15,2),
  "maxUsers" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "saas_plans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "saas_plans_billing_interval_check" CHECK ("billingInterval" IN ('MONTHLY','YEARLY','CUSTOM'))
);

CREATE UNIQUE INDEX "saas_plans_code_key" ON "saas_plans"("code");

CREATE TABLE "workspace_subscriptions" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "planId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'TRIALING',
  "trialStartedAt" TIMESTAMP(3),
  "trialEndsAt" TIMESTAMP(3),
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "graceEndsAt" TIMESTAMP(3),
  "overrideUntil" TIMESTAMP(3),
  "suspendedAt" TIMESTAMP(3),
  "suspensionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workspace_subscriptions_status_check" CHECK ("status" IN ('TRIALING','ACTIVE','PAST_DUE','EXPIRED','CANCELLED','SUSPENDED')),
  CONSTRAINT "workspace_subscriptions_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "workspace_subscriptions_plan_fkey" FOREIGN KEY ("planId") REFERENCES "saas_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "workspace_subscriptions_workspaceId_key" ON "workspace_subscriptions"("workspaceId");
CREATE INDEX "workspace_subscriptions_status_idx" ON "workspace_subscriptions"("status");
CREATE INDEX "workspace_subscriptions_trialEndsAt_idx" ON "workspace_subscriptions"("trialEndsAt");
CREATE INDEX "workspace_subscriptions_currentPeriodEnd_idx" ON "workspace_subscriptions"("currentPeriodEnd");

CREATE TABLE "subscription_events" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "type" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "subscription_events_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "subscription_events_subscription_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "workspace_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "subscription_events_actor_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "subscription_events_workspaceId_createdAt_idx" ON "subscription_events"("workspaceId", "createdAt");
CREATE INDEX "subscription_events_subscriptionId_createdAt_idx" ON "subscription_events"("subscriptionId", "createdAt");

INSERT INTO "saas_plans" ("id", "code", "name", "billingInterval", "pricePkr", "maxUsers") VALUES
  ('plan_starter', 'starter', 'Starter', 'MONTHLY', NULL, 3),
  ('plan_business', 'business', 'Business', 'MONTHLY', NULL, 10),
  ('plan_pro', 'pro', 'Pro', 'MONTHLY', NULL, NULL)
ON CONFLICT ("code") DO NOTHING;

-- Existing businesses receive a fresh 30-day trial when this control plane launches.
INSERT INTO "workspace_subscriptions" (
  "id", "workspaceId", "planId", "status", "trialStartedAt", "trialEndsAt"
)
SELECT
  'sub_' || replace(gen_random_uuid()::text, '-', ''),
  w."id",
  p."id",
  'TRIALING',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP + INTERVAL '30 days'
FROM "workspaces" w
CROSS JOIN LATERAL (
  SELECT "id" FROM "saas_plans" WHERE "code" = 'starter' LIMIT 1
) p
ON CONFLICT ("workspaceId") DO NOTHING;
