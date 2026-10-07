-- Restaurant V1.67: serialize the first order/kitchen-ticket table reference with parent mutation.
--
-- V1.66 freezes Restaurant table identity/workspace after a reference becomes visible.
-- Lock the table row during child tenant validation so a new reference cannot race a
-- workspace move, identity rewrite, or delete.

CREATE OR REPLACE FUNCTION lock_restaurant_table_parent(
  table_id uuid,
  expected_workspace uuid,
  error_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  actual_workspace uuid;
BEGIN
  IF table_id IS NULL THEN
    RETURN;
  END IF;

  SELECT rt."workspaceId"
    INTO actual_workspace
  FROM "restaurant_tables" rt
  WHERE rt."id" = table_id
  FOR SHARE;

  IF actual_workspace IS NULL OR actual_workspace IS DISTINCT FROM expected_workspace THEN
    RAISE EXCEPTION '%', error_message;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_restaurant_order_table_tenant_parent()
RETURNS trigger AS $$
BEGIN
  IF NEW."restaurantTableId" IS NOT NULL THEN
    PERFORM lock_restaurant_table_parent(
      NEW."restaurantTableId",
      NEW."workspaceId",
      'Restaurant order table must belong to the same workspace'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_kitchen_ticket_table_tenant_parent()
RETURNS trigger AS $$
BEGIN
  IF NEW."restaurantTableId" IS NOT NULL THEN
    PERFORM lock_restaurant_table_parent(
      NEW."restaurantTableId",
      NEW."workspaceId",
      'Kitchen ticket table must belong to the same workspace'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
