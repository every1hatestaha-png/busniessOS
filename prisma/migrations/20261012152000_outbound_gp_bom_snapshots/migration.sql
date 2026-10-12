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
