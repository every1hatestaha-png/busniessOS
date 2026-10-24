-- All new workspaces require an explicitly verified, single-use payment approval.
-- Payment evidence is recorded before provisioning. No trial is created.
-- Never use a screenshot, self-declared reference, or client-submitted status
-- as payment verification; approvals are issued only by the MFA-verified owner.
CREATE TABLE "prepaid_workspace_approvals" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "paymentReference" TEXT NOT NULL,
  "verifiedAmountPkr" INTEGER NOT NULL,
  "planCode" TEXT NOT NULL DEFAULT 'starter',
  "billingCycle" TEXT NOT NULL DEFAULT 'monthly',
  "verifiedByUserId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "consumedWorkspaceId" TEXT UNIQUE REFERENCES "workspaces"("id") ON DELETE RESTRICT,
  "consumedAt" TIMESTAMP(3),
  CONSTRAINT "prepaid_approval_amount_check" CHECK ("verifiedAmountPkr" >= 34000),
  CONSTRAINT "prepaid_approval_plan_check" CHECK ("planCode" = 'starter'),
  CONSTRAINT "prepaid_approval_cycle_check" CHECK ("billingCycle" = 'monthly'),
  CONSTRAINT "prepaid_approval_consume_check" CHECK (
    ("consumedAt" IS NULL AND "consumedWorkspaceId" IS NULL)
    OR ("consumedAt" IS NOT NULL AND "consumedWorkspaceId" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "prepaid_workspace_payment_reference_unique"
  ON "prepaid_workspace_approvals" (lower(btrim("paymentReference")));
CREATE INDEX "prepaid_workspace_approvals_available_idx"
  ON "prepaid_workspace_approvals" ("userId", "verifiedAt")
  WHERE "consumedWorkspaceId" IS NULL;
