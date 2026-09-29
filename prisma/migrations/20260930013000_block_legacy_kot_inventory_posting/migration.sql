-- Legacy sales-linked kitchen tickets are compatibility status records only.
-- Normal ERP sales and restaurant-native orders own inventory posting.
-- Fail closed if the retired legacy KITCHEN adjustment path is called again.

CREATE OR REPLACE FUNCTION reject_legacy_kitchen_inventory_posting()
RETURNS trigger AS $$
BEGIN
  IF NEW."reference" LIKE 'KITCHEN:%' THEN
    RAISE EXCEPTION 'Legacy kitchen tickets are status-only and cannot post inventory';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "inventory_transactions_block_legacy_kitchen_posting" ON "inventory_transactions";
CREATE TRIGGER "inventory_transactions_block_legacy_kitchen_posting"
BEFORE INSERT OR UPDATE OF "reference"
ON "inventory_transactions"
FOR EACH ROW EXECUTE FUNCTION reject_legacy_kitchen_inventory_posting();
