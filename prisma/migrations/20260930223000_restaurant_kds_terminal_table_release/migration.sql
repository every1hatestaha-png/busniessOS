-- Terminal kitchen-ticket transitions should release their table even when a
-- lower-level caller bypasses the TypeScript service. The existing
-- preserve_restaurant_table_occupancy() guard remains authoritative: if another
-- active legacy KOT or any live restaurant-native order still uses the table, the
-- attempted AVAILABLE transition is automatically kept OCCUPIED.

CREATE OR REPLACE FUNCTION release_restaurant_table_after_terminal_kot()
RETURNS trigger AS $$
BEGIN
  IF NEW."status" IN ('SERVED','CANCELLED')
     AND OLD."status" IS DISTINCT FROM NEW."status"
     AND NEW."restaurantTableId" IS NOT NULL THEN
    UPDATE "restaurant_tables"
    SET "status"='AVAILABLE', "updatedAt"=now()
    WHERE "id"=NEW."restaurantTableId"
      AND "workspaceId"=NEW."workspaceId"
      AND "status"='OCCUPIED';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "kitchen_tickets_terminal_table_release" ON "kitchen_tickets";
CREATE TRIGGER "kitchen_tickets_terminal_table_release"
AFTER UPDATE OF "status"
ON "kitchen_tickets"
FOR EACH ROW EXECUTE FUNCTION release_restaurant_table_after_terminal_kot();
