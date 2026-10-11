import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/server/db";

export const RECOVERY_EMAIL_LIMIT = 3;
export const RECOVERY_WINDOW_SECONDS = 15 * 60;

export function recoveryEmailHash(email: string) {
  return createHash("sha256").update(`munshios:password-recovery:v1:${email.trim().toLowerCase()}`).digest("hex");
}

/** A database-clock UPSERT arbitrates workers; denied attempts do not extend the window. */
export async function consumeRecoveryEmailBudget(email: string): Promise<boolean> {
  const hash = recoveryEmailHash(email);
  const rows = await db.$queryRaw<Array<{ attempts: number }>>`
    WITH expired AS (
      SELECT "emailHash" FROM "auth_recovery_buckets"
      WHERE "windowStartedAt" < statement_timestamp() - interval '1 day' AND "emailHash" <> ${hash}
      ORDER BY "windowStartedAt" LIMIT 64 FOR UPDATE SKIP LOCKED
    ), cleanup AS (
      DELETE FROM "auth_recovery_buckets" b USING expired e WHERE b."emailHash"=e."emailHash"
    )
    INSERT INTO "auth_recovery_buckets" ("emailHash", "windowStartedAt", "attempts")
    VALUES (${hash}, statement_timestamp(), 1)
    ON CONFLICT ("emailHash") DO UPDATE SET
      "attempts" = CASE WHEN "auth_recovery_buckets"."windowStartedAt" <= statement_timestamp() - make_interval(secs => ${RECOVERY_WINDOW_SECONDS})
        THEN 1 ELSE "auth_recovery_buckets"."attempts" + 1 END,
      "windowStartedAt" = CASE WHEN "auth_recovery_buckets"."windowStartedAt" <= statement_timestamp() - make_interval(secs => ${RECOVERY_WINDOW_SECONDS})
        THEN statement_timestamp() ELSE "auth_recovery_buckets"."windowStartedAt" END
    WHERE "auth_recovery_buckets"."attempts" < ${RECOVERY_EMAIL_LIMIT}
      OR "auth_recovery_buckets"."windowStartedAt" <= statement_timestamp() - make_interval(secs => ${RECOVERY_WINDOW_SECONDS})
    RETURNING "attempts"
  `;
  return rows.length === 1;
}
