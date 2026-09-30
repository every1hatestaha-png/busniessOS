-- Restaurant Workspace V1.72: preserve inbound WhatsApp provider-message evidence.
--
-- A recorded provider message is immutable audit and idempotency evidence. The
-- application inserts it once alongside the staged Restaurant order and has no
-- legitimate post-insert edit or delete flow. Rewriting provider identity,
-- sender/body evidence, tenant/order association or timestamps would detach the
-- intake record from the event that created it.
--
-- One narrow exception preserves the existing approved cleanup contract for a
-- truly uncommitted Restaurant order. restaurant_whatsapp_messages.restaurantOrderId
-- uses ON DELETE SET NULL. When the guarded parent delete has already succeeded,
-- PostgreSQL may therefore clear this FK. A direct caller cannot use this path:
-- while the old parent still exists, clearing or replacing the association is
-- rejected like every other evidence rewrite.

CREATE OR REPLACE FUNCTION enforce_restaurant_whatsapp_message_snapshot()
RETURNS trigger AS $$
DECLARE
  approved_parent_cleanup boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Restaurant WhatsApp message history cannot be deleted';
  END IF;

  IF NEW."restaurantOrderId" IS DISTINCT FROM OLD."restaurantOrderId"
    AND OLD."restaurantOrderId" IS NOT NULL
    AND NEW."restaurantOrderId" IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "restaurant_orders" ro
      WHERE ro."id" = OLD."restaurantOrderId"
    )
  THEN
    approved_parent_cleanup := true;
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId"
    OR NEW."externalMessageId" IS DISTINCT FROM OLD."externalMessageId"
    OR NEW."customerPhone" IS DISTINCT FROM OLD."customerPhone"
    OR NEW."customerName" IS DISTINCT FROM OLD."customerName"
    OR NEW."body" IS DISTINCT FROM OLD."body"
    OR NEW."receivedAt" IS DISTINCT FROM OLD."receivedAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    OR (
      NEW."restaurantOrderId" IS DISTINCT FROM OLD."restaurantOrderId"
      AND NOT approved_parent_cleanup
    )
  THEN
    RAISE EXCEPTION 'Restaurant WhatsApp message evidence is immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_whatsapp_messages_snapshot_guard"
  ON "restaurant_whatsapp_messages";
CREATE TRIGGER "restaurant_whatsapp_messages_snapshot_guard"
BEFORE UPDATE OR DELETE ON "restaurant_whatsapp_messages"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_whatsapp_message_snapshot();
