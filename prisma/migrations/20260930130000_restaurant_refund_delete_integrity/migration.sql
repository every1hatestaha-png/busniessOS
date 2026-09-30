-- Refunds are financial history. Only an actual PostgreSQL superuser retains
-- the explicit DBA maintenance path, consistent with order/receipt retention.
CREATE OR REPLACE FUNCTION enforce_restaurant_refund_delete_integrity()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles r
    WHERE r.rolname = current_user AND r.rolsuper
  ) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Restaurant refund history cannot be deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "restaurant_refunds_delete_integrity"
BEFORE DELETE ON "restaurant_refunds"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_refund_delete_integrity();
