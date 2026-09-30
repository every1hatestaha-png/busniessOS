-- A receipt is a financial event, including legacy unposted and voided rows.
-- Application corrections use explicit void/refund flows, never hard deletion.
-- Preserve the explicit PostgreSQL superuser maintenance path used by V1.20;
-- application roles cannot obtain it through caller-provided role strings.
CREATE OR REPLACE FUNCTION enforce_restaurant_payment_delete_integrity()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles r
    WHERE r.rolname = current_user AND r.rolsuper
  ) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Restaurant payment history cannot be deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "restaurant_payments_delete_integrity"
BEFORE DELETE ON "restaurant_payments"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_payment_delete_integrity();
