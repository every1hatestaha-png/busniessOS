-- V2 issue-time stock valuation is immutable immediately after reservation.
-- Historical GPs without an issue-stock marker retain their legacy trigger behavior.
CREATE OR REPLACE FUNCTION prevent_outbound_gp_bom_snapshot_rewrite()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pass_status TEXT;
DECLARE reserved_at TIMESTAMP(3);
BEGIN
  IF OLD."unitCostSnapshot" IS DISTINCT FROM NEW."unitCostSnapshot"
    OR OLD."bomComponentsSnapshot" IS DISTINCT FROM NEW."bomComponentsSnapshot" THEN
    SELECT "status"::text, "issueStockDeductedAt"
      INTO pass_status, reserved_at
      FROM "outbound_gate_passes" WHERE "id"=NEW."gatePassId" FOR SHARE;
    IF reserved_at IS NOT NULL THEN
      RAISE EXCEPTION 'Issue-time Gate Pass stock valuation is immutable'
        USING ERRCODE='23514';
    END IF;
  END IF;
  IF OLD."unitCostSnapshot" IS DISTINCT FROM NEW."unitCostSnapshot"
    AND pass_status NOT IN ('DRAFT','ISSUED') THEN
    RAISE EXCEPTION 'Gate Pass dispatch valuation is immutable after shipment'
      USING ERRCODE='23514';
  END IF;
  IF OLD."bomComponentsSnapshot" IS DISTINCT FROM NEW."bomComponentsSnapshot" THEN
    IF OLD."bomComponentsSnapshot" IS NOT NULL THEN
      RAISE EXCEPTION 'Gate Pass component snapshot is immutable' USING ERRCODE='23514';
    END IF;
    IF pass_status IS DISTINCT FROM 'ISSUED' THEN
      RAISE EXCEPTION 'Gate Pass components may only be frozen at issue or legacy dispatch'
        USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
