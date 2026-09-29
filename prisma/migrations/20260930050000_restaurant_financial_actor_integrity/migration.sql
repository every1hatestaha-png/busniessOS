-- Restaurant financial mutations must retain an authenticated manager actor.
-- Existing tenant-parent guards remain authoritative for invalid parent references.

CREATE OR REPLACE FUNCTION restaurant_actor_is_manager(target_workspace uuid, actor_id text)
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
      AND wm."role" IN ('OWNER','ADMIN','MANAGER')
  );
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION enforce_restaurant_refund_manager_actor()
RETURNS trigger AS $$
BEGIN
  -- Preserve the established tenant-parent error contract for invalid references.
  IF NOT EXISTS (
    SELECT 1
    FROM "restaurant_payments" rp
    WHERE rp."id" = NEW."restaurantPaymentId"
      AND rp."workspaceId" = NEW."workspaceId"
      AND rp."restaurantOrderId" = NEW."restaurantOrderId"
      AND rp."cashBankAccountId" = NEW."cashBankAccountId"
  ) THEN
    RETURN NEW;
  END IF;

  IF NOT restaurant_actor_is_manager(NEW."workspaceId", NEW."createdById") THEN
    RAISE EXCEPTION 'Restaurant refund requires a manager actor from the same workspace';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_refunds_manager_actor_guard" ON "restaurant_refunds";
CREATE TRIGGER "restaurant_refunds_manager_actor_guard"
BEFORE INSERT OR UPDATE OF "workspaceId", "restaurantPaymentId", "restaurantOrderId", "cashBankAccountId", "createdById"
ON "restaurant_refunds"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_refund_manager_actor();

CREATE OR REPLACE FUNCTION enforce_restaurant_return_manager_actor()
RETURNS trigger AS $$
BEGIN
  -- Preserve tenant-parent errors when the order itself is invalid or cross-workspace.
  IF NOT EXISTS (
    SELECT 1 FROM "restaurant_orders" ro
    WHERE ro."id" = NEW."restaurantOrderId"
      AND ro."workspaceId" = NEW."workspaceId"
  ) THEN
    RETURN NEW;
  END IF;

  IF NOT restaurant_actor_is_manager(NEW."workspaceId", NEW."createdById") THEN
    RAISE EXCEPTION 'Restaurant return requires a manager actor from the same workspace';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_returns_manager_actor_guard" ON "restaurant_returns";
CREATE TRIGGER "restaurant_returns_manager_actor_guard"
BEFORE INSERT OR UPDATE OF "workspaceId", "restaurantOrderId", "createdById"
ON "restaurant_returns"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_return_manager_actor();

CREATE OR REPLACE FUNCTION enforce_restaurant_payment_void_manager_actor()
RETURNS trigger AS $$
BEGIN
  IF OLD."voidedAt" IS NULL AND NEW."voidedAt" IS NOT NULL THEN
    IF NOT restaurant_actor_is_manager(NEW."workspaceId", NEW."voidedById") THEN
      RAISE EXCEPTION 'Restaurant payment void requires a manager actor from the same workspace';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_payments_void_manager_actor_guard" ON "restaurant_payments";
CREATE TRIGGER "restaurant_payments_void_manager_actor_guard"
BEFORE UPDATE OF "voidedAt", "voidedById", "workspaceId"
ON "restaurant_payments"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_payment_void_manager_actor();