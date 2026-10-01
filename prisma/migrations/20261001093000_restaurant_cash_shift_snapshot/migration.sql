-- Cash shifts are financial reconciliation records. Opening identity is fixed at
-- creation, closure is a single OPEN -> CLOSED transition, and closed rows are
-- append-only evidence. Application roles may never physically delete a shift.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "cash_shifts"
    WHERE "openingCash" < 0
       OR (
         "status" = 'OPEN'
         AND ("closedAt" IS NOT NULL OR "closedById" IS NOT NULL OR "expectedCash" IS NOT NULL
              OR "closingCash" IS NOT NULL OR "variance" IS NOT NULL)
       )
       OR (
         "status" = 'CLOSED'
         AND ("closedAt" IS NULL OR "closedById" IS NULL OR "expectedCash" IS NULL
              OR "closingCash" IS NULL OR "variance" IS NULL OR "closingCash" < 0
              OR "closedAt" < "openedAt" OR "variance" <> "closingCash" - "expectedCash")
       )
  ) THEN
    RAISE EXCEPTION 'Restaurant cash shift snapshot integrity check failed: historical invalid shift exists';
  END IF;
END;
$$;

ALTER TABLE "cash_shifts"
  DROP CONSTRAINT IF EXISTS "cash_shifts_opening_cash_nonnegative",
  DROP CONSTRAINT IF EXISTS "cash_shifts_lifecycle_snapshot_consistent";

ALTER TABLE "cash_shifts"
  ADD CONSTRAINT "cash_shifts_opening_cash_nonnegative"
    CHECK ("openingCash" >= 0),
  ADD CONSTRAINT "cash_shifts_lifecycle_snapshot_consistent"
    CHECK (
      (
        "status" = 'OPEN'
        AND "closedAt" IS NULL
        AND "closedById" IS NULL
        AND "expectedCash" IS NULL
        AND "closingCash" IS NULL
        AND "variance" IS NULL
      ) OR (
        "status" = 'CLOSED'
        AND "closedAt" IS NOT NULL
        AND "closedById" IS NOT NULL
        AND "expectedCash" IS NOT NULL
        AND "closingCash" IS NOT NULL
        AND "closingCash" >= 0
        AND "variance" IS NOT NULL
        AND "closedAt" >= "openedAt"
        AND "variance" = "closingCash" - "expectedCash"
      )
    );

CREATE OR REPLACE FUNCTION enforce_restaurant_cash_shift_snapshot()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles r
      WHERE r.rolname = current_user AND r.rolsuper
    ) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Restaurant cash shift history cannot be deleted';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'OPEN'
       OR NEW."closedAt" IS NOT NULL
       OR NEW."closedById" IS NOT NULL
       OR NEW."expectedCash" IS NOT NULL
       OR NEW."closingCash" IS NOT NULL
       OR NEW."variance" IS NOT NULL THEN
      RAISE EXCEPTION 'Restaurant cash shift must begin open without closure values';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId"
     OR NEW."openedById" IS DISTINCT FROM OLD."openedById"
     OR NEW."openedAt" IS DISTINCT FROM OLD."openedAt"
     OR NEW."openingCash" IS DISTINCT FROM OLD."openingCash" THEN
    RAISE EXCEPTION 'Restaurant cash shift opening snapshot is immutable';
  END IF;

  IF OLD."status" = 'CLOSED' THEN
    IF NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'Restaurant closed cash shift history is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."status" = 'OPEN' THEN
    IF NEW."closedAt" IS NOT NULL
       OR NEW."closedById" IS NOT NULL
       OR NEW."expectedCash" IS NOT NULL
       OR NEW."closingCash" IS NOT NULL
       OR NEW."variance" IS NOT NULL THEN
      RAISE EXCEPTION 'Open restaurant cash shift cannot contain closure values';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."status" <> 'CLOSED'
     OR NEW."closedAt" IS NULL
     OR NEW."closedById" IS NULL
     OR NEW."expectedCash" IS NULL
     OR NEW."closingCash" IS NULL
     OR NEW."variance" IS NULL THEN
    RAISE EXCEPTION 'Restaurant cash shift closure snapshot is incomplete';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "cash_shifts_00_snapshot_guard" ON "cash_shifts";
CREATE TRIGGER "cash_shifts_00_snapshot_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "cash_shifts"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_cash_shift_snapshot();
