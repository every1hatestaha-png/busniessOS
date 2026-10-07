-- Restaurant V1.66: preserve Restaurant table identity and tenant ownership once referenced.
--
-- Orders and kitchen tickets keep restaurantTableId for operational and historical context.
-- Their FKs use ON DELETE SET NULL, so deleting a referenced table can silently erase that
-- context, and a parent workspace move can create a cross-tenant link. Freeze parent identity
-- and workspace while any Restaurant order or kitchen ticket references the table.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "restaurant_orders" ro
    JOIN "restaurant_tables" rt ON rt."id" = ro."restaurantTableId"
    WHERE ro."restaurantTableId" IS NOT NULL
      AND rt."workspaceId" IS DISTINCT FROM ro."workspaceId"
  ) THEN
    RAISE EXCEPTION 'Restaurant table parent integrity check failed: historical order table mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "kitchen_tickets" kt
    JOIN "restaurant_tables" rt ON rt."id" = kt."restaurantTableId"
    WHERE kt."restaurantTableId" IS NOT NULL
      AND rt."workspaceId" IS DISTINCT FROM kt."workspaceId"
  ) THEN
    RAISE EXCEPTION 'Restaurant table parent integrity check failed: historical kitchen ticket table mismatch';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION restaurant_table_is_referenced(table_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "restaurant_orders" ro
    WHERE ro."restaurantTableId" = table_id
  ) OR EXISTS (
    SELECT 1 FROM "kitchen_tickets" kt
    WHERE kt."restaurantTableId" = table_id
  );
$$;

CREATE OR REPLACE FUNCTION reject_restaurant_table_parent_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF restaurant_table_is_referenced(OLD."id") THEN
      RAISE EXCEPTION 'Restaurant-linked table cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW."id" IS NOT DISTINCT FROM OLD."id"
     AND NEW."workspaceId" IS NOT DISTINCT FROM OLD."workspaceId" THEN
    RETURN NEW;
  END IF;

  IF restaurant_table_is_referenced(OLD."id") THEN
    RAISE EXCEPTION 'Restaurant-linked table identity and workspace are immutable';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS restaurant_table_parent_update_guard ON "restaurant_tables";
CREATE TRIGGER restaurant_table_parent_update_guard
BEFORE UPDATE OF "id", "workspaceId"
ON "restaurant_tables"
FOR EACH ROW
EXECUTE FUNCTION reject_restaurant_table_parent_mutation();

DROP TRIGGER IF EXISTS restaurant_table_parent_delete_guard ON "restaurant_tables";
CREATE TRIGGER restaurant_table_parent_delete_guard
BEFORE DELETE
ON "restaurant_tables"
FOR EACH ROW
EXECUTE FUNCTION reject_restaurant_table_parent_mutation();
