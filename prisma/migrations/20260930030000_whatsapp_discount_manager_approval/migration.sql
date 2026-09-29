-- External WhatsApp intake is unauthenticated staging. A requested discount may
-- be stored for review, but a discounted WhatsApp order cannot become CONFIRMED
-- unless confirmedById is a manager-level member of the same workspace.

CREATE OR REPLACE FUNCTION enforce_whatsapp_discount_manager_approval()
RETURNS trigger AS $$
BEGIN
  IF NEW."source" = 'WHATSAPP'
     AND NEW."status" = 'CONFIRMED'
     AND OLD."status" = 'PENDING_REVIEW'
     AND NEW."discountAmount" > 0 THEN
    IF NEW."confirmedById" IS NULL OR NOT EXISTS (
      SELECT 1
      FROM "workspace_members" wm
      WHERE wm."workspaceId" = NEW."workspaceId"::text
        AND wm."userId" = NEW."confirmedById"::text
        AND wm."role" IN ('OWNER','ADMIN','MANAGER')
    ) THEN
      RAISE EXCEPTION 'Manager approval is required to confirm a discounted WhatsApp order';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_orders_whatsapp_discount_approval" ON "restaurant_orders";
CREATE TRIGGER "restaurant_orders_whatsapp_discount_approval"
BEFORE UPDATE OF "status", "confirmedById"
ON "restaurant_orders"
FOR EACH ROW EXECUTE FUNCTION enforce_whatsapp_discount_manager_approval();
