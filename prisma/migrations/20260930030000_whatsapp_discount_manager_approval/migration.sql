-- External WhatsApp intake is unauthenticated staging. Requested discount or tax
-- values may be stored for review, but they cannot enter the confirmed workflow
-- unless confirmedById is a manager-level member of the same workspace.
-- This remains fail-closed until restaurant tax is derived from authoritative
-- workspace tax configuration rather than external-message payload values.

CREATE OR REPLACE FUNCTION enforce_whatsapp_financial_override_manager_approval()
RETURNS trigger AS $$
BEGIN
  IF NEW."source" = 'WHATSAPP'
     AND NEW."status" = 'CONFIRMED'
     AND OLD."status" = 'PENDING_REVIEW'
     AND (NEW."discountAmount" > 0 OR NEW."taxAmount" > 0) THEN
    IF NEW."confirmedById" IS NULL OR NOT EXISTS (
      SELECT 1
      FROM "workspace_members" wm
      WHERE wm."workspaceId" = NEW."workspaceId"::text
        AND wm."userId" = NEW."confirmedById"::text
        AND wm."role" IN ('OWNER','ADMIN','MANAGER')
    ) THEN
      RAISE EXCEPTION 'Manager approval is required to confirm a WhatsApp order with financial overrides';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_orders_whatsapp_discount_approval" ON "restaurant_orders";
DROP TRIGGER IF EXISTS "restaurant_orders_whatsapp_financial_approval" ON "restaurant_orders";
CREATE TRIGGER "restaurant_orders_whatsapp_financial_approval"
BEFORE UPDATE OF "status", "confirmedById"
ON "restaurant_orders"
FOR EACH ROW EXECUTE FUNCTION enforce_whatsapp_financial_override_manager_approval();
