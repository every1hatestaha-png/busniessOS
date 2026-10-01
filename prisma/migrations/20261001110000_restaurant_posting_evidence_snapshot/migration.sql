-- Restaurant accounting and inventory postings are evidence, not editable
-- application state. Identify only rows backed by Restaurant domain parents so
-- existing non-Restaurant accounting workflows retain their current behavior.

CREATE OR REPLACE FUNCTION is_restaurant_general_ledger_evidence(
  entry_source_type text,
  entry_source_id text,
  entry_workspace_id text,
  entry_reversal_of_id text
)
RETURNS boolean AS $$
  SELECT CASE
    WHEN entry_source_type = 'SALE' THEN EXISTS (
      SELECT 1 FROM "restaurant_orders" ro
      WHERE ro."id"::text = entry_source_id
        AND ro."workspaceId"::text = entry_workspace_id
    )
    WHEN entry_source_type = 'RECEIPT' THEN EXISTS (
      SELECT 1 FROM "restaurant_payments" rp
      WHERE rp."id"::text = entry_source_id
        AND rp."workspaceId"::text = entry_workspace_id
    )
    WHEN entry_source_type = 'CUSTOMER_RETURN' THEN EXISTS (
      SELECT 1 FROM "restaurant_returns" rr
      WHERE rr."id"::text = entry_source_id
        AND rr."workspaceId"::text = entry_workspace_id
    )
    WHEN entry_source_type = 'REVERSAL' THEN EXISTS (
      SELECT 1
      FROM "general_ledger_entries" original
      WHERE original."id" = entry_reversal_of_id
        AND original."workspaceId" = entry_workspace_id
        AND (
          (original."sourceType" = 'SALE' AND EXISTS (
            SELECT 1 FROM "restaurant_orders" ro
            WHERE ro."id"::text = original."sourceId"
              AND ro."workspaceId"::text = original."workspaceId"
          ))
          OR (original."sourceType" = 'RECEIPT' AND EXISTS (
            SELECT 1 FROM "restaurant_payments" rp
            WHERE rp."id"::text = original."sourceId"
              AND rp."workspaceId"::text = original."workspaceId"
          ))
          OR (original."sourceType" = 'CUSTOMER_RETURN' AND EXISTS (
            SELECT 1 FROM "restaurant_returns" rr
            WHERE rr."id"::text = original."sourceId"
              AND rr."workspaceId"::text = original."workspaceId"
          ))
        )
    )
    ELSE false
  END;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public;

CREATE OR REPLACE FUNCTION enforce_restaurant_general_ledger_evidence_snapshot()
RETURNS trigger AS $$
BEGIN
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

DROP TRIGGER IF EXISTS "general_ledger_entries_restaurant_evidence_snapshot" ON "general_ledger_entries";
CREATE TRIGGER "general_ledger_entries_restaurant_evidence_snapshot"
BEFORE UPDATE ON "general_ledger_entries"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_general_ledger_evidence_snapshot();

CREATE OR REPLACE FUNCTION enforce_restaurant_general_ledger_delete_integrity()
RETURNS trigger AS $$
BEGIN
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

DROP TRIGGER IF EXISTS "general_ledger_entries_restaurant_delete_integrity" ON "general_ledger_entries";
CREATE TRIGGER "general_ledger_entries_restaurant_delete_integrity"
BEFORE DELETE ON "general_ledger_entries"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_general_ledger_delete_integrity();

CREATE OR REPLACE FUNCTION is_restaurant_inventory_evidence(
  entry_reference text,
  entry_workspace_id text
)
RETURNS boolean AS $$
  SELECT CASE
    WHEN starts_with(entry_reference, 'RESTAURANT:') THEN EXISTS (
      SELECT 1 FROM "restaurant_orders" ro
      WHERE ro."id"::text = substring(entry_reference from char_length('RESTAURANT:') + 1)
        AND ro."workspaceId"::text = entry_workspace_id
    )
    WHEN starts_with(entry_reference, 'RESTAURANT_RETURN:') THEN EXISTS (
      SELECT 1 FROM "restaurant_returns" rr
      WHERE rr."id"::text = substring(entry_reference from char_length('RESTAURANT_RETURN:') + 1)
        AND rr."workspaceId"::text = entry_workspace_id
    )
    WHEN starts_with(entry_reference, 'RESTAURANT_RETURN_REVERSAL:') THEN EXISTS (
      SELECT 1 FROM "restaurant_returns" rr
      WHERE rr."id"::text = substring(entry_reference from char_length('RESTAURANT_RETURN_REVERSAL:') + 1)
        AND rr."workspaceId"::text = entry_workspace_id
    )
    ELSE false
  END;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public;

CREATE OR REPLACE FUNCTION enforce_restaurant_inventory_evidence_snapshot()
RETURNS trigger AS $$
BEGIN
  IF (
    is_restaurant_inventory_evidence(OLD."reference", OLD."workspaceId")
    OR is_restaurant_inventory_evidence(NEW."reference", NEW."workspaceId")
  ) AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Restaurant inventory transaction evidence is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "inventory_transactions_restaurant_evidence_snapshot" ON "inventory_transactions";
CREATE TRIGGER "inventory_transactions_restaurant_evidence_snapshot"
BEFORE UPDATE ON "inventory_transactions"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_inventory_evidence_snapshot();

CREATE OR REPLACE FUNCTION enforce_restaurant_inventory_delete_integrity()
RETURNS trigger AS $$
BEGIN
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

DROP TRIGGER IF EXISTS "inventory_transactions_restaurant_delete_integrity" ON "inventory_transactions";
CREATE TRIGGER "inventory_transactions_restaurant_delete_integrity"
BEFORE DELETE ON "inventory_transactions"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_inventory_delete_integrity();
