-- kitchen_tickets.restaurantOrderId has a plain FK to restaurant_orders(id),
-- which proves existence but not workspace ownership. Fail migration if historical
-- mismatches exist, then enforce the same-workspace parent relation for all writes.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "kitchen_tickets" kt
    JOIN "restaurant_orders" ro ON ro."id" = kt."restaurantOrderId"
    WHERE kt."restaurantOrderId" IS NOT NULL
      AND ro."workspaceId" <> kt."workspaceId"
  ) THEN
    RAISE EXCEPTION 'Existing kitchen ticket order workspace mismatch';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_kitchen_ticket_order_tenant_parent()
RETURNS trigger AS $$
BEGIN
  IF NEW."restaurantOrderId" IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM "restaurant_orders" ro
       WHERE ro."id" = NEW."restaurantOrderId"
         AND ro."workspaceId" = NEW."workspaceId"
     ) THEN
    RAISE EXCEPTION 'Kitchen ticket order must belong to the same workspace';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "kitchen_tickets_order_tenant_parent_guard" ON "kitchen_tickets";
CREATE TRIGGER "kitchen_tickets_order_tenant_parent_guard"
BEFORE INSERT OR UPDATE OF "workspaceId", "restaurantOrderId"
ON "kitchen_tickets"
FOR EACH ROW EXECUTE FUNCTION enforce_kitchen_ticket_order_tenant_parent();
