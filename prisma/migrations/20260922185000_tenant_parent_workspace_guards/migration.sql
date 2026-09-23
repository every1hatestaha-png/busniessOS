-- Defense in depth: prevent cross-workspace parent/child links even if a future
-- application path forgets to scope a foreign key lookup by workspace.
-- Existing foreign keys still handle missing parents; this function only checks
-- workspace ownership for parents that exist.

CREATE OR REPLACE FUNCTION "enforce_same_workspace_parent"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_workspace TEXT;
  parent_id TEXT;
BEGIN
  parent_id := to_jsonb(NEW) ->> TG_ARGV[1];
  IF parent_id IS NULL OR parent_id = '' THEN
    RETURN NEW;
  END IF;

  EXECUTE format(
    'SELECT "workspaceId"::text FROM %I WHERE "id"::text = $1',
    TG_ARGV[0]
  )
  INTO parent_workspace
  USING parent_id;

  -- Let the ordinary foreign key constraint report a missing parent.
  IF parent_workspace IS NULL THEN
    RETURN NEW;
  END IF;

  IF parent_workspace <> NEW."workspaceId"::text THEN
    RAISE EXCEPTION 'Cross-workspace reference rejected on %.% -> %',
      TG_TABLE_NAME, TG_ARGV[1], TG_ARGV[0]
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  rel RECORD;
  mismatch_exists BOOLEAN;
  trigger_name TEXT;
BEGIN
  FOR rel IN
    SELECT *
    FROM (VALUES
      ('sales_orders', 'customerId', 'customers'),
      ('purchase_orders', 'supplierId', 'suppliers'),
      ('goods_received_notes', 'purchaseOrderId', 'purchase_orders'),
      ('goods_received_notes', 'supplierId', 'suppliers'),
      ('invoices', 'customerId', 'customers'),
      ('invoices', 'salesOrderId', 'sales_orders'),
      ('invoice_document_versions', 'invoiceId', 'invoices'),
      ('payments', 'customerId', 'customers'),
      ('payments', 'supplierId', 'suppliers'),
      ('payments', 'invoiceId', 'invoices'),
      ('payments', 'cashBankAccountId', 'cash_bank_accounts'),
      ('payments', 'reversalOfId', 'payments'),
      ('ledger_entries', 'customerId', 'customers'),
      ('ledger_entries', 'supplierId', 'suppliers'),
      ('payment_allocations', 'paymentId', 'payments'),
      ('payment_allocations', 'invoiceId', 'invoices'),
      ('payment_allocations', 'purchaseOrderId', 'purchase_orders'),
      ('payment_allocations', 'goodReceivedNoteId', 'goods_received_notes'),
      ('credit_notes', 'customerId', 'customers'),
      ('credit_notes', 'salesOrderId', 'sales_orders'),
      ('credit_notes', 'customerReturnId', 'customer_returns'),
      ('customer_credit_allocations', 'creditNoteId', 'credit_notes'),
      ('customer_credit_allocations', 'invoiceId', 'invoices'),
      ('debit_notes', 'supplierId', 'suppliers'),
      ('debit_notes', 'purchaseOrderId', 'purchase_orders'),
      ('customer_returns', 'customerId', 'customers'),
      ('customer_returns', 'salesOrderId', 'sales_orders'),
      ('supplier_returns', 'supplierId', 'suppliers'),
      ('supplier_returns', 'purchaseOrderId', 'purchase_orders'),
      ('supplier_returns', 'goodReceivedNoteId', 'goods_received_notes'),
      ('inventory_transactions', 'productId', 'products'),
      ('general_ledger_entries', 'accountId', 'accounts'),
      ('general_ledger_entries', 'reversalOfId', 'general_ledger_entries'),
      ('expenses', 'expenseAccountId', 'accounts'),
      ('expenses', 'paymentAccountId', 'accounts'),
      ('cash_bank_accounts', 'accountId', 'accounts'),
      ('fbr_invoice_submissions', 'invoiceId', 'invoices')
    ) AS relations(child_table, fk_column, parent_table)
  LOOP
    EXECUTE format(
      'SELECT EXISTS (
         SELECT 1
         FROM %I child
         JOIN %I parent ON parent."id"::text = child.%I::text
         WHERE child.%I IS NOT NULL
           AND child."workspaceId"::text <> parent."workspaceId"::text
       )',
      rel.child_table,
      rel.parent_table,
      rel.fk_column,
      rel.fk_column
    )
    INTO mismatch_exists;

    IF mismatch_exists THEN
      RAISE EXCEPTION
        'Cannot install tenant invariant: existing cross-workspace link %.% -> %',
        rel.child_table,
        rel.fk_column,
        rel.parent_table;
    END IF;

    trigger_name := 'tenant_guard_' || rel.child_table || '_' || lower(rel.fk_column);

    EXECUTE format(
      'CREATE TRIGGER %I
       BEFORE INSERT OR UPDATE OF "workspaceId", %I ON %I
       FOR EACH ROW
       EXECUTE FUNCTION "enforce_same_workspace_parent"(%L, %L)',
      trigger_name,
      rel.fk_column,
      rel.child_table,
      rel.parent_table,
      rel.fk_column
    );
  END LOOP;
END;
$$;
