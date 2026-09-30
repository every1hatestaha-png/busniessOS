-- Orders own line snapshots and operational/financial dependencies. Membership
-- in both tenants does not authorize moving an existing order between them.
CREATE OR REPLACE FUNCTION enforce_restaurant_order_workspace_immutable()
RETURNS trigger AS $$
BEGIN
  IF NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId" THEN
    RAISE EXCEPTION 'Restaurant order workspace is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "restaurant_orders_workspace_immutable"
BEFORE UPDATE OF "workspaceId" ON "restaurant_orders"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_order_workspace_immutable();
