-- Restaurant cash shifts are financial history owned by exactly one workspace.
-- V1.18 validates opener and closer membership, but a user who belongs to two
-- workspaces could otherwise move an existing shift between tenants by changing
-- workspaceId while retaining the same opener. Tenant ownership is immutable.

CREATE OR REPLACE FUNCTION enforce_restaurant_cash_shift_actor_integrity()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."openedById" IS NULL
       OR NOT restaurant_actor_is_workspace_member(NEW."workspaceId", NEW."openedById"::text) THEN
      RAISE EXCEPTION 'Restaurant cash shift opener must be a member of the same workspace';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId" THEN
    RAISE EXCEPTION 'Restaurant cash shift workspace is immutable';
  END IF;

  IF NEW."openedById" IS DISTINCT FROM OLD."openedById" THEN
    RAISE EXCEPTION 'Restaurant cash shift ownership is immutable';
  END IF;

  IF OLD."status" = 'OPEN' AND NEW."status" = 'CLOSED' THEN
    IF NEW."closedById" IS NULL
       OR NOT restaurant_actor_is_workspace_member(NEW."workspaceId", NEW."closedById"::text) THEN
      RAISE EXCEPTION 'Restaurant cash shift closer must be a member of the same workspace';
    END IF;

    IF NEW."closedById" IS DISTINCT FROM OLD."openedById"
       AND NOT restaurant_actor_is_manager(NEW."workspaceId", NEW."closedById"::text) THEN
      RAISE EXCEPTION 'Only a manager can close another user''s restaurant cash shift';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "cash_shifts_actor_integrity_guard" ON "cash_shifts";
CREATE TRIGGER "cash_shifts_actor_integrity_guard"
BEFORE INSERT OR UPDATE OF "workspaceId", "openedById", "closedById", "status"
ON "cash_shifts"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_cash_shift_actor_integrity();
