-- Kitchen tickets are tenant-scoped operational records. Their restaurant order
-- and table foreign keys prove parent existence, but not that those parents belong
-- to the ticket workspace. Enforce same-workspace ownership at the database layer.
-- Legacy/compatibility KOTs may continue to have restaurantOrderId = NULL.

CREATE OR REPLACE FUNCTION enforce_restaurant_kitchen_ticket_tenant_parents()
RETURNS trigger AS $$
BEGIN
  IF NEW."restaurantOrderId" IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM "restaurant_orders" ro
       WHERE ro."id" = NEW."restaurantOrderId"
         AND ro."workspaceId" = NEW."workspaceId"
     ) THEN
    RAISE EXCEPTION 'Restaurant kitchen ticket order must belong to the same workspace';
  END IF;

  IF NEW."restaurantTableId" IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM "restaurant_tables" rt
       WHERE rt."id" = NEW."restaurantTableId"
         AND rt."workspaceId" = NEW."workspaceId"
     ) THEN
    RAISE EXCEPTION 'Restaurant kitchen ticket table must belong to the same workspace';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "kitchen_tickets_restaurant_tenant_parent_guard" ON "kitchen_tickets";
CREATE TRIGGER "kitchen_tickets_restaurant_tenant_parent_guard"
BEFORE INSERT OR UPDATE OF "workspaceId", "restaurantOrderId", "restaurantTableId"
ON "kitchen_tickets"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_kitchen_ticket_tenant_parents();
