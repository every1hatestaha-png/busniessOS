-- Allow physical tenant removal ONLY inside a transaction with a specific
-- workspace deletion context, set after server-side owner/MFA and membership
-- checks. Outside that context, financial and operational evidence protections
-- are unchanged. This is not a privilege boundary for database owners; no
-- untrusted client can execute privileged SQL.
--
-- A workspace-scoped transaction setting prevents a purge for workspace A from
-- skipping the guard for workspace B. Commit/rollback clears the setting.
CREATE OR REPLACE FUNCTION munshios_admin_purge_matches_workspace(target_id text)
RETURNS boolean AS $$
BEGIN
  RETURN target_id IS NOT NULL
    AND target_id <> ''
    AND target_id = NULLIF(pg_catalog.current_setting('munshios.purge_workspace_id', true), '');
END;
$$ LANGUAGE plpgsql VOLATILE;

CREATE OR REPLACE FUNCTION enforce_restaurant_order_delete_integrity()
RETURNS trigger AS $$
DECLARE
  caller_is_superuser boolean;
BEGIN
  IF munshios_admin_purge_matches_workspace(OLD."workspaceId"::text) THEN
    RETURN OLD;
  END IF;

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

CREATE OR REPLACE FUNCTION enforce_restaurant_payment_delete_integrity()
RETURNS trigger AS $$
BEGIN
  IF munshios_admin_purge_matches_workspace(OLD."workspaceId"::text) THEN
    RETURN OLD;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles r
    WHERE r.rolname = current_user AND r.rolsuper
  ) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Restaurant payment history cannot be deleted';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_restaurant_refund_delete_integrity()
RETURNS trigger AS $$
BEGIN
  IF munshios_admin_purge_matches_workspace(OLD."workspaceId"::text) THEN
    RETURN OLD;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles r
    WHERE r.rolname = current_user AND r.rolsuper
  ) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Restaurant refund history cannot be deleted';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_restaurant_return_delete_integrity()
RETURNS trigger AS $$
BEGIN
  IF munshios_admin_purge_matches_workspace(OLD."workspaceId"::text) THEN
    RETURN OLD;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles r
    WHERE r.rolname = current_user AND r.rolsuper
  ) THEN
    RETURN OLD;
  END IF;

  IF TG_TABLE_NAME = 'restaurant_returns' THEN
    RAISE EXCEPTION 'Restaurant return history cannot be deleted';
  ELSIF TG_TABLE_NAME = 'restaurant_return_items' THEN
    RAISE EXCEPTION 'Restaurant return item history cannot be deleted';
  ELSIF TG_TABLE_NAME = 'restaurant_return_payment_allocations' THEN
    RAISE EXCEPTION 'Restaurant return payment allocation history cannot be deleted';
  END IF;

  RAISE EXCEPTION 'Restaurant return history cannot be deleted';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_restaurant_inventory_consumption_delete_integrity()
RETURNS trigger AS $$
BEGIN
  IF munshios_admin_purge_matches_workspace(OLD."workspaceId"::text) THEN
    RETURN OLD;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles r
    WHERE r.rolname = current_user AND r.rolsuper
  ) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Restaurant inventory consumption history cannot be deleted';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_restaurant_cash_shift_snapshot()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND munshios_admin_purge_matches_workspace(OLD."workspaceId"::text) THEN
    RETURN OLD;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles r
      WHERE r.rolname = current_user AND r.rolsuper
    ) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Restaurant cash shift history cannot be deleted';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'OPEN'
       OR NEW."closedAt" IS NOT NULL
       OR NEW."closedById" IS NOT NULL
       OR NEW."expectedCash" IS NOT NULL
       OR NEW."closingCash" IS NOT NULL
       OR NEW."variance" IS NOT NULL THEN
      RAISE EXCEPTION 'Restaurant cash shift must begin open without closure values';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId" THEN
    RAISE EXCEPTION 'Restaurant cash shift workspace is immutable';
  END IF;

  IF NEW."openedById" IS DISTINCT FROM OLD."openedById" THEN
    RAISE EXCEPTION 'Restaurant cash shift ownership is immutable';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."openedAt" IS DISTINCT FROM OLD."openedAt"
     OR NEW."openingCash" IS DISTINCT FROM OLD."openingCash" THEN
    RAISE EXCEPTION 'Restaurant cash shift opening snapshot is immutable';
  END IF;

  IF OLD."status" = 'CLOSED' THEN
    IF NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'Restaurant closed cash shift history is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."status" = 'OPEN' THEN
    IF NEW."closedAt" IS NOT NULL
       OR NEW."closedById" IS NOT NULL
       OR NEW."expectedCash" IS NOT NULL
       OR NEW."closingCash" IS NOT NULL
       OR NEW."variance" IS NOT NULL THEN
      RAISE EXCEPTION 'Open restaurant cash shift cannot contain closure values';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."status" <> 'CLOSED'
     OR NEW."closedAt" IS NULL
     OR NEW."closedById" IS NULL
     OR NEW."expectedCash" IS NULL
     OR NEW."closingCash" IS NULL
     OR NEW."variance" IS NULL THEN
    RAISE EXCEPTION 'Restaurant cash shift closure snapshot is incomplete';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_restaurant_whatsapp_message_snapshot()
RETURNS trigger AS $$
DECLARE
  approved_parent_cleanup boolean := false;
BEGIN
  IF TG_OP = 'DELETE' AND munshios_admin_purge_matches_workspace(OLD."workspaceId"::text) THEN
    RETURN OLD;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Restaurant WhatsApp message history cannot be deleted';
  END IF;

  IF NEW."restaurantOrderId" IS DISTINCT FROM OLD."restaurantOrderId"
    AND OLD."restaurantOrderId" IS NOT NULL
    AND NEW."restaurantOrderId" IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "restaurant_orders" ro
      WHERE ro."id" = OLD."restaurantOrderId"
    )
  THEN
    approved_parent_cleanup := true;
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId"
    OR NEW."externalMessageId" IS DISTINCT FROM OLD."externalMessageId"
    OR NEW."customerPhone" IS DISTINCT FROM OLD."customerPhone"
    OR NEW."customerName" IS DISTINCT FROM OLD."customerName"
    OR NEW."body" IS DISTINCT FROM OLD."body"
    OR NEW."receivedAt" IS DISTINCT FROM OLD."receivedAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    OR (
      NEW."restaurantOrderId" IS DISTINCT FROM OLD."restaurantOrderId"
      AND NOT approved_parent_cleanup
    )
  THEN
    RAISE EXCEPTION 'Restaurant WhatsApp message evidence is immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_restaurant_kitchen_ticket_delete_integrity()
RETURNS trigger AS $$
BEGIN
  IF munshios_admin_purge_matches_workspace(OLD."workspaceId"::text) THEN
    RETURN OLD;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles r
    WHERE r.rolname = current_user AND r.rolsuper
  ) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Restaurant kitchen ticket history cannot be deleted';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_restaurant_general_ledger_delete_integrity()
RETURNS trigger AS $$
BEGIN
  IF munshios_admin_purge_matches_workspace(OLD."workspaceId"::text) THEN
    RETURN OLD;
  END IF;

  IF NOT is_restaurant_general_ledger_evidence(
    OLD."sourceType"::text, OLD."sourceId", OLD."workspaceId", OLD."reversalOfId"
  ) THEN
    RETURN OLD;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles r
    WHERE r.rolname = current_user AND r.rolsuper
  ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Restaurant general ledger evidence cannot be deleted';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_restaurant_inventory_delete_integrity()
RETURNS trigger AS $$
BEGIN
  IF munshios_admin_purge_matches_workspace(OLD."workspaceId"::text) THEN
    RETURN OLD;
  END IF;

  IF NOT is_restaurant_inventory_evidence(OLD."reference", OLD."workspaceId") THEN
    RETURN OLD;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles r
    WHERE r.rolname = current_user AND r.rolsuper
  ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Restaurant inventory transaction evidence cannot be deleted';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_restaurant_general_ledger_evidence_snapshot()
RETURNS trigger AS $$
BEGIN
  IF munshios_admin_purge_matches_workspace(OLD."workspaceId"::text) THEN
    RETURN NEW;
  END IF;

  IF (
    is_restaurant_general_ledger_evidence(
      OLD."sourceType"::text, OLD."sourceId", OLD."workspaceId", OLD."reversalOfId"
    )
    OR is_restaurant_general_ledger_evidence(
      NEW."sourceType"::text, NEW."sourceId", NEW."workspaceId", NEW."reversalOfId"
    )
  ) AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Restaurant general ledger evidence is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_restaurant_return_snapshot_immutable()
RETURNS trigger AS $$
BEGIN
  IF munshios_admin_purge_matches_workspace(OLD."workspaceId"::text) THEN
    RETURN NEW;
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId"
     OR NEW."restaurantOrderId" IS DISTINCT FROM OLD."restaurantOrderId"
     OR NEW."returnNumber" IS DISTINCT FROM OLD."returnNumber"
     OR NEW."reason" IS DISTINCT FROM OLD."reason"
     OR NEW."subtotal" IS DISTINCT FROM OLD."subtotal"
     OR NEW."discountAmount" IS DISTINCT FROM OLD."discountAmount"
     OR NEW."taxAmount" IS DISTINCT FROM OLD."taxAmount"
     OR NEW."total" IS DISTINCT FROM OLD."total"
     OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
     OR NEW."requestFingerprint" IS DISTINCT FROM OLD."requestFingerprint"
     OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
     OR NEW."isReversal" IS DISTINCT FROM OLD."isReversal"
     OR NEW."reversalOfId" IS DISTINCT FROM OLD."reversalOfId"
     OR NEW."reversalReason" IS DISTINCT FROM OLD."reversalReason" THEN
    RAISE EXCEPTION 'Restaurant return snapshot is immutable';
  END IF;

  IF NEW."inventoryCost" IS DISTINCT FROM OLD."inventoryCost" THEN
    IF NOT (
      OLD."inventoryCost" = 0
      AND NEW."inventoryCost" >= 0
      AND OLD."createdAt" = transaction_timestamp()
    ) THEN
      RAISE EXCEPTION 'Restaurant return snapshot is immutable';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
