-- Kitchen-ticket identity and parentage are established at creation time. Rewriting
-- tenant/document/table identity later can detach historical KDS evidence from the
-- order/table that produced it. Legacy sales-linked tickets also need an explicit
-- same-workspace parent guard because salesOrderId is not a composite tenant FK.

CREATE OR REPLACE FUNCTION enforce_restaurant_kitchen_ticket_identity_integrity()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId"
       OR NEW."salesOrderId" IS DISTINCT FROM OLD."salesOrderId"
       OR NEW."restaurantOrderId" IS DISTINCT FROM OLD."restaurantOrderId"
       OR NEW."restaurantTableId" IS DISTINCT FROM OLD."restaurantTableId"
       OR NEW."ticketNumber" IS DISTINCT FROM OLD."ticketNumber"
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
      RAISE EXCEPTION 'Restaurant kitchen ticket identity snapshot is immutable';
    END IF;
  END IF;

  IF NEW."salesOrderId" IS NOT NULL AND NEW."restaurantOrderId" IS NOT NULL THEN
    RAISE EXCEPTION 'Restaurant kitchen ticket cannot belong to both sales and restaurant orders';
  END IF;

  IF NEW."salesOrderId" IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM "sales_orders" so
       WHERE so."id" = NEW."salesOrderId"
         AND so."workspaceId" = NEW."workspaceId"
     ) THEN
    RAISE EXCEPTION 'Restaurant kitchen ticket sales order must belong to the same workspace';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "kitchen_tickets_00_identity_integrity_guard" ON "kitchen_tickets";
CREATE TRIGGER "kitchen_tickets_00_identity_integrity_guard"
BEFORE INSERT OR UPDATE OF "workspaceId", "salesOrderId", "restaurantOrderId", "restaurantTableId", "ticketNumber", "createdAt"
ON "kitchen_tickets"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_kitchen_ticket_identity_integrity();
