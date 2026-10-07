-- restaurant_whatsapp_messages.restaurantOrderId has a plain FK to
-- restaurant_orders(id). That proves existence but not same-workspace ownership.
-- Fail closed on historical mismatches, then enforce the tenant parent on writes.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "restaurant_whatsapp_messages" wm
    JOIN "restaurant_orders" ro ON ro."id" = wm."restaurantOrderId"
    WHERE wm."restaurantOrderId" IS NOT NULL
      AND ro."workspaceId" <> wm."workspaceId"
  ) THEN
    RAISE EXCEPTION 'Existing WhatsApp message order workspace mismatch';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_restaurant_whatsapp_order_tenant_parent()
RETURNS trigger AS $$
BEGIN
  IF NEW."restaurantOrderId" IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM "restaurant_orders" ro
       WHERE ro."id" = NEW."restaurantOrderId"
         AND ro."workspaceId" = NEW."workspaceId"
     ) THEN
    RAISE EXCEPTION 'WhatsApp message order must belong to the same workspace';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_whatsapp_messages_order_tenant_parent_guard"
ON "restaurant_whatsapp_messages";
CREATE TRIGGER "restaurant_whatsapp_messages_order_tenant_parent_guard"
BEFORE INSERT OR UPDATE OF "workspaceId", "restaurantOrderId"
ON "restaurant_whatsapp_messages"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_whatsapp_order_tenant_parent();
