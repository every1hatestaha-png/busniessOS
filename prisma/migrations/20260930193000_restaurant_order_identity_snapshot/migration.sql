-- Core restaurant order identity and external idempotency fields are established
-- at INSERT and are never legitimately rewritten. Changing orderNumber can detach
-- downstream document/audit references; changing source/externalReference can
-- corrupt channel attribution and WhatsApp duplicate-intake protection; changing
-- createdAt rewrites historical chronology.

CREATE OR REPLACE FUNCTION enforce_restaurant_order_identity_snapshot_immutable()
RETURNS trigger AS $$
BEGIN
  IF NEW."orderNumber" IS DISTINCT FROM OLD."orderNumber"
     OR NEW."source" IS DISTINCT FROM OLD."source"
     OR NEW."externalReference" IS DISTINCT FROM OLD."externalReference"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Restaurant order identity snapshot is immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_orders_identity_snapshot_guard" ON "restaurant_orders";
CREATE TRIGGER "restaurant_orders_identity_snapshot_guard"
BEFORE UPDATE OF "orderNumber", "source", "externalReference", "createdAt"
ON "restaurant_orders"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_order_identity_snapshot_immutable();
