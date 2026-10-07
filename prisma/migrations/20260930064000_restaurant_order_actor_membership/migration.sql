-- Operational restaurant actors must be real members of the workspace they act in.
-- External WhatsApp intake remains actorless while PENDING_REVIEW, but authenticated
-- POS/manual creation and human confirmation require same-workspace membership.

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

CREATE OR REPLACE FUNCTION enforce_restaurant_order_creator_membership()
RETURNS trigger AS $$
BEGIN
  IF NEW."source" IN ('POS','MANUAL')
     AND NOT restaurant_actor_is_workspace_member(NEW."workspaceId", NEW."createdById") THEN
    RAISE EXCEPTION 'Restaurant order creator must be a member of the same workspace';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_orders_creator_membership_guard" ON "restaurant_orders";
CREATE TRIGGER "restaurant_orders_creator_membership_guard"
BEFORE INSERT OR UPDATE OF "workspaceId", "source", "createdById"
ON "restaurant_orders"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_order_creator_membership();

CREATE OR REPLACE FUNCTION enforce_restaurant_order_confirmer_membership()
RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'PENDING_REVIEW' AND NEW."status" = 'CONFIRMED'
     AND NOT restaurant_actor_is_workspace_member(NEW."workspaceId", NEW."confirmedById") THEN
    RAISE EXCEPTION 'Restaurant order confirmer must be a member of the same workspace';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_orders_confirmer_membership_guard" ON "restaurant_orders";
CREATE TRIGGER "restaurant_orders_confirmer_membership_guard"
BEFORE UPDATE OF "status", "confirmedById", "workspaceId"
ON "restaurant_orders"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_order_confirmer_membership();