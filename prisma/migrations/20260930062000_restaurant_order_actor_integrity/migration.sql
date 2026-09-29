-- Restaurant order actor attribution is an audit boundary.
-- WhatsApp intake may remain anonymous while PENDING_REVIEW, but authenticated
-- POS/MANUAL creation and every confirmed order must retain a real member actor.

CREATE OR REPLACE FUNCTION restaurant_actor_is_workspace_member(target_workspace uuid, actor_id text)
RETURNS boolean AS $$
BEGIN
  IF actor_id IS NULL OR btrim(actor_id) = '' THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM "workspace_members" wm
    WHERE wm."workspaceId" = target_workspace::text
      AND wm."userId" = actor_id
  );
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION enforce_restaurant_order_actor_integrity()
RETURNS trigger AS $$
BEGIN
  IF NEW."source" IN ('POS', 'MANUAL') THEN
    IF NOT restaurant_actor_is_workspace_member(NEW."workspaceId", NEW."createdById") THEN
      RAISE EXCEPTION 'Restaurant POS or manual order requires a creator from the same workspace';
    END IF;
  ELSIF NEW."createdById" IS NOT NULL
    AND NOT restaurant_actor_is_workspace_member(NEW."workspaceId", NEW."createdById") THEN
    RAISE EXCEPTION 'Restaurant order creator must belong to the same workspace';
  END IF;

  IF NEW."status" = 'CONFIRMED' THEN
    IF NOT restaurant_actor_is_workspace_member(NEW."workspaceId", NEW."confirmedById") THEN
      RAISE EXCEPTION 'Confirmed restaurant order requires a confirmer from the same workspace';
    END IF;
  ELSIF NEW."confirmedById" IS NOT NULL
    AND NOT restaurant_actor_is_workspace_member(NEW."workspaceId", NEW."confirmedById") THEN
    RAISE EXCEPTION 'Restaurant order confirmer must belong to the same workspace';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_orders_actor_integrity_guard" ON "restaurant_orders";
CREATE TRIGGER "restaurant_orders_actor_integrity_guard"
BEFORE INSERT OR UPDATE OF "workspaceId", "source", "status", "createdById", "confirmedById"
ON "restaurant_orders"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_order_actor_integrity();
