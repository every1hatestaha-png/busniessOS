-- Restaurant receipts are immutable evidence with two controlled lifecycle
-- initializations: accounting may post once, and a manager may void once. A
-- receipt automatically voided by a full item return may become active again
-- only after immutable compensating return-allocation evidence has been written.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "restaurant_payments" rp
    WHERE (rp."voidedAt" IS NULL) <> (rp."voidedById" IS NULL)
       OR (rp."voidedAt" IS NULL) <> (rp."voidReason" IS NULL)
  ) THEN
    RAISE EXCEPTION 'Restaurant payment evidence integrity check failed: historical incomplete void snapshot exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "restaurant_payments" rp
    WHERE rp."postedAt" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "general_ledger_entries" gle
        WHERE gle."workspaceId" = rp."workspaceId"::text
          AND gle."sourceType" = 'RECEIPT'
          AND gle."sourceId" = rp."id"::text
          AND gle."reversalOfId" IS NULL
        GROUP BY gle."workspaceId", gle."sourceId"
        HAVING COUNT(*) = 2
           AND COALESCE(SUM(gle."debit"), 0) = rp."amount"
           AND COALESCE(SUM(gle."credit"), 0) = rp."amount"
      )
  ) THEN
    RAISE EXCEPTION 'Restaurant payment evidence integrity check failed: posted receipt lacks balanced ledger evidence';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_restaurant_payment_evidence_snapshot()
RETURNS trigger AS $$
DECLARE
  net_return_allocation numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."postedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Restaurant payment must be inserted before accounting is posted';
    END IF;
    IF NEW."voidedAt" IS NOT NULL OR NEW."voidedById" IS NOT NULL OR NEW."voidReason" IS NOT NULL THEN
      RAISE EXCEPTION 'Restaurant payment must be inserted active';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId"
     OR NEW."restaurantOrderId" IS DISTINCT FROM OLD."restaurantOrderId"
     OR NEW."cashBankAccountId" IS DISTINCT FROM OLD."cashBankAccountId"
     OR NEW."method" IS DISTINCT FROM OLD."method"
     OR NEW."amount" IS DISTINCT FROM OLD."amount"
     OR NEW."reference" IS DISTINCT FROM OLD."reference"
     OR NEW."notes" IS DISTINCT FROM OLD."notes"
     OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
     OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Restaurant payment evidence snapshot is immutable';
  END IF;

  IF NEW."postedAt" IS DISTINCT FROM OLD."postedAt" THEN
    IF OLD."postedAt" IS NOT NULL OR NEW."postedAt" IS NULL THEN
      RAISE EXCEPTION 'Restaurant payment posting evidence is immutable once recorded';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM "general_ledger_entries" gle
      WHERE gle."workspaceId" = NEW."workspaceId"::text
        AND gle."sourceType" = 'RECEIPT'
        AND gle."sourceId" = NEW."id"::text
        AND gle."reversalOfId" IS NULL
      GROUP BY gle."workspaceId", gle."sourceId"
      HAVING COUNT(*) = 2
         AND COALESCE(SUM(gle."debit"), 0) = NEW."amount"
         AND COALESCE(SUM(gle."credit"), 0) = NEW."amount"
    ) THEN
      RAISE EXCEPTION 'Restaurant payment cannot be marked posted without balanced ledger evidence';
    END IF;
  END IF;

  IF NEW."voidedAt" IS DISTINCT FROM OLD."voidedAt"
     OR NEW."voidedById" IS DISTINCT FROM OLD."voidedById"
     OR NEW."voidReason" IS DISTINCT FROM OLD."voidReason" THEN
    IF OLD."voidedAt" IS NULL AND OLD."voidedById" IS NULL AND OLD."voidReason" IS NULL
       AND NEW."voidedAt" IS NOT NULL AND NEW."voidedById" IS NOT NULL AND NEW."voidReason" IS NOT NULL THEN
      IF char_length(NEW."voidReason") NOT BETWEEN 3 AND 500
         OR NEW."voidedAt" < NEW."createdAt" THEN
        RAISE EXCEPTION 'Restaurant payment void snapshot is invalid';
      END IF;
      RETURN NEW;
    END IF;

    IF OLD."voidedAt" IS NOT NULL AND OLD."voidedById" IS NOT NULL AND OLD."voidReason" IS NOT NULL
       AND NEW."voidedAt" IS NULL AND NEW."voidedById" IS NULL AND NEW."voidReason" IS NULL
       AND OLD."voidReason" LIKE 'Fully refunded through restaurant item returns (%)' THEN
      SELECT COALESCE(SUM(a."amount"), 0)
      INTO net_return_allocation
      FROM "restaurant_return_payment_allocations" a
      WHERE a."workspaceId" = OLD."workspaceId"
        AND a."restaurantPaymentId" = OLD."id";

      IF net_return_allocation < OLD."amount"
         AND EXISTS (
           SELECT 1
           FROM "restaurant_return_payment_allocations" a
           INNER JOIN "restaurant_returns" rr
             ON rr."id" = a."restaurantReturnId"
            AND rr."workspaceId" = a."workspaceId"
           WHERE a."workspaceId" = OLD."workspaceId"
             AND a."restaurantPaymentId" = OLD."id"
             AND a."isReversal" = true
             AND a."amount" < 0
             AND rr."isReversal" = true
         ) THEN
        RETURN NEW;
      END IF;
    END IF;

    RAISE EXCEPTION 'Restaurant payment void evidence is immutable without a compensating return reversal';
  END IF;

  IF (NEW."voidedAt" IS NULL) <> (NEW."voidedById" IS NULL)
     OR (NEW."voidedAt" IS NULL) <> (NEW."voidReason" IS NULL) THEN
    RAISE EXCEPTION 'Restaurant payment void snapshot is incomplete';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_payments_00_evidence_snapshot_guard" ON "restaurant_payments";
CREATE TRIGGER "restaurant_payments_00_evidence_snapshot_guard"
BEFORE INSERT OR UPDATE ON "restaurant_payments"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_payment_evidence_snapshot();
