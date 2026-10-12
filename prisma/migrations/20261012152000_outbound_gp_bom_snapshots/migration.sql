-- Customer BOM components are physically consumed at gate-pass dispatch.
-- This optional immutable snapshot records exactly which components and costs
-- travelled with each customer assembly; never re-read mutable BOM at invoicing.
ALTER TABLE "outbound_gate_pass_items" ADD COLUMN "bomComponentsSnapshot" JSONB;
ALTER TABLE "outbound_gate_pass_items"
  ADD CONSTRAINT "outbound_gp_bom_snapshot_shape"
  CHECK ("bomComponentsSnapshot" IS NULL OR
    (jsonb_typeof("bomComponentsSnapshot") = 'object'
      AND "bomComponentsSnapshot"->>'version' = '1'
      AND jsonb_typeof("bomComponentsSnapshot"->'components') = 'array'));

-- A customer assembly's physical component and cost snapshot is immutable
-- once captured at an ISSUED gate pass. No later BOM configuration edit,
-- receiving update, refund or invoice posting can rewrite historical costs.
CREATE FUNCTION prevent_outbound_gp_bom_snapshot_rewrite()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pass_status TEXT;
BEGIN
  IF OLD."unitCostSnapshot" IS DISTINCT FROM NEW."unitCostSnapshot" THEN
    SELECT "status"::text INTO pass_status
    FROM "outbound_gate_passes" WHERE "id"=NEW."gatePassId" FOR SHARE;
    IF pass_status NOT IN ('DRAFT','ISSUED') THEN
      RAISE EXCEPTION 'Gate Pass dispatch valuation is immutable after shipment'
        USING ERRCODE='23514';
    END IF;
  END IF;
  IF OLD."bomComponentsSnapshot" IS DISTINCT FROM NEW."bomComponentsSnapshot" THEN
    IF OLD."bomComponentsSnapshot" IS NOT NULL THEN
      RAISE EXCEPTION 'Gate Pass component snapshot is immutable' USING ERRCODE='23514';
    END IF;
    SELECT "status"::text INTO pass_status
    FROM "outbound_gate_passes" WHERE "id"=NEW."gatePassId" FOR SHARE;
    IF pass_status IS DISTINCT FROM 'ISSUED' THEN
      RAISE EXCEPTION 'Gate Pass components may only be frozen at dispatch'
        USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER outbound_gp_bom_snapshot_immutable
BEFORE UPDATE OF "bomComponentsSnapshot", "unitCostSnapshot" ON "outbound_gate_pass_items"
FOR EACH ROW EXECUTE FUNCTION prevent_outbound_gp_bom_snapshot_rewrite();
