-- Restaurant Workspace V1.20: protect order and line history from destructive deletion.
--
-- Application roles may only delete truly uncommitted PENDING_REVIEW orders and
-- their lines. PostgreSQL superusers retain the unavoidable DBA/maintenance
-- escape hatch; a superuser could disable user triggers regardless, so this does
-- not create an application-level bypass.
--
-- The child guard deliberately permits the FK cascade after an already-approved
-- parent delete. Depending on PostgreSQL RI trigger timing, the parent may no
-- longer be visible when the child BEFORE DELETE trigger runs. A direct child
-- delete cannot observe a missing parent while the FK is valid.

CREATE OR REPLACE FUNCTION restaurant_order_is_uncommitted_for_delete(target_order "restaurant_orders")
RETURNS boolean AS $$
BEGIN
  RETURN target_order."status" = 'PENDING_REVIEW'
    AND target_order."paymentStatus" = 'UNPAID'
    AND target_order."confirmedById" IS NULL
    AND target_order."confirmedAt" IS NULL
    AND target_order."completedAt" IS NULL
    AND target_order."cancelledAt" IS NULL
    AND target_order."inventoryPostedAt" IS NULL
    AND target_order."accountingPostedAt" IS NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION enforce_restaurant_order_delete_integrity()
RETURNS trigger AS $$
DECLARE
  caller_is_superuser boolean;
BEGIN
  SELECT COALESCE(r.rolsuper, false)
    INTO caller_is_superuser
  FROM pg_catalog.pg_roles r
  WHERE r.rolname = current_user;

  IF caller_is_superuser THEN
    RETURN OLD;
  END IF;

  IF NOT restaurant_order_is_uncommitted_for_delete(OLD) THEN
    RAISE EXCEPTION 'Restaurant order history cannot be deleted after commitment';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_orders_delete_integrity" ON "restaurant_orders";
CREATE TRIGGER "restaurant_orders_delete_integrity"
BEFORE DELETE ON "restaurant_orders"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_order_delete_integrity();

CREATE OR REPLACE FUNCTION enforce_restaurant_order_item_delete_integrity()
RETURNS trigger AS $$
DECLARE
  caller_is_superuser boolean;
  parent_order "restaurant_orders"%ROWTYPE;
BEGIN
  SELECT COALESCE(r.rolsuper, false)
    INTO caller_is_superuser
  FROM pg_catalog.pg_roles r
  WHERE r.rolname = current_user;

  IF caller_is_superuser THEN
    RETURN OLD;
  END IF;

  SELECT ro.*
    INTO parent_order
  FROM "restaurant_orders" ro
  WHERE ro."id" = OLD."restaurantOrderId"
  FOR KEY SHARE;

  -- If the parent is gone, this delete is the FK cascade from a parent delete
  -- that already passed restaurant_orders_delete_integrity. A direct child
  -- delete cannot reach this state while the FK remains valid.
  IF NOT FOUND THEN
    RETURN OLD;
  END IF;

  IF NOT restaurant_order_is_uncommitted_for_delete(parent_order) THEN
    RAISE EXCEPTION 'Restaurant order item history cannot be deleted after commitment';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_order_items_delete_integrity" ON "restaurant_order_items";
CREATE TRIGGER "restaurant_order_items_delete_integrity"
BEFORE DELETE ON "restaurant_order_items"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_order_item_delete_integrity();
