-- restaurant_orders.restaurantTableId has a plain FK to restaurant_tables(id),
-- which proves existence but not tenant ownership. Enforce the workspace parent
-- relation in PostgreSQL so direct SQL/lower-level callers cannot attach an order
-- to another workspace's table.

CREATE OR REPLACE FUNCTION enforce_restaurant_order_table_tenant_parent()
RETURNS trigger AS $$
BEGIN
  IF NEW."restaurantTableId" IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM "restaurant_tables" rt
       WHERE rt."id" = NEW."restaurantTableId"
         AND rt."workspaceId" = NEW."workspaceId"
     ) THEN
    RAISE EXCEPTION 'Restaurant order table must belong to the same workspace';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_orders_table_tenant_parent_guard" ON "restaurant_orders";
CREATE TRIGGER "restaurant_orders_table_tenant_parent_guard"
BEFORE INSERT OR UPDATE OF "workspaceId", "restaurantTableId"
ON "restaurant_orders"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_order_table_tenant_parent();
