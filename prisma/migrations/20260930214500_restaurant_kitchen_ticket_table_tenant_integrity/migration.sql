-- kitchen_tickets.restaurantTableId proves that a table exists, but a plain FK
-- does not prove that the ticket and table belong to the same workspace.
-- Fail closed on historical mismatches, then enforce same-workspace ownership.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "kitchen_tickets" kt
    JOIN "restaurant_tables" rt ON rt."id" = kt."restaurantTableId"
    WHERE kt."restaurantTableId" IS NOT NULL
      AND rt."workspaceId" <> kt."workspaceId"
  ) THEN
    RAISE EXCEPTION 'Existing kitchen ticket table workspace mismatch';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_kitchen_ticket_table_tenant_parent()
RETURNS trigger AS $$
BEGIN
  IF NEW."restaurantTableId" IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM "restaurant_tables" rt
       WHERE rt."id" = NEW."restaurantTableId"
         AND rt."workspaceId" = NEW."workspaceId"
     ) THEN
    RAISE EXCEPTION 'Kitchen ticket table must belong to the same workspace';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "kitchen_tickets_table_tenant_parent_guard" ON "kitchen_tickets";
CREATE TRIGGER "kitchen_tickets_table_tenant_parent_guard"
BEFORE INSERT OR UPDATE OF "workspaceId", "restaurantTableId"
ON "kitchen_tickets"
FOR EACH ROW EXECUTE FUNCTION enforce_kitchen_ticket_table_tenant_parent();
