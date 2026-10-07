-- POS orders may be created by operational staff, but manual discount or tax
-- overrides are financial configuration. Require a manager-level workspace
-- member at the database boundary whenever a confirmed POS order is inserted
-- with a nonzero financial override.

CREATE OR REPLACE FUNCTION enforce_pos_financial_override_manager_approval()
RETURNS trigger AS $$
BEGIN
  IF NEW."source" = 'POS'
     AND (NEW."discountAmount" > 0 OR NEW."taxAmount" > 0) THEN
    IF NEW."createdById" IS NULL OR NOT EXISTS (
      SELECT 1
      FROM "workspace_members" wm
      WHERE wm."workspaceId" = NEW."workspaceId"::text
        AND wm."userId" = NEW."createdById"::text
        AND wm."role" IN ('OWNER','ADMIN','MANAGER')
    ) THEN
      RAISE EXCEPTION 'Manager approval is required for POS financial overrides';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_orders_pos_financial_approval" ON "restaurant_orders";
CREATE TRIGGER "restaurant_orders_pos_financial_approval"
BEFORE INSERT
ON "restaurant_orders"
FOR EACH ROW EXECUTE FUNCTION enforce_pos_financial_override_manager_approval();
