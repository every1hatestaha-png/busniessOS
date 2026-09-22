-- Enforce the invariant that a workspace can have at most one pending
-- invitation for a normalized email address. The service already normalizes
-- emails before insert; this database guard closes the concurrent-invite race.

WITH ranked_pending AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "workspaceId", "email"
      ORDER BY "createdAt" DESC, "id" DESC
    ) AS rn
  FROM "workspace_invitations"
  WHERE "status" = 'PENDING'
)
UPDATE "workspace_invitations" AS invitation
SET "status" = 'REVOKED',
    "updatedAt" = CURRENT_TIMESTAMP
FROM ranked_pending
WHERE invitation."id" = ranked_pending."id"
  AND ranked_pending.rn > 1;

CREATE UNIQUE INDEX "workspace_invitations_one_pending_per_email"
ON "workspace_invitations" ("workspaceId", "email")
WHERE "status" = 'PENDING';
