-- Additive integrity controls for the opt-in Ahmad-only workflow.
ALTER TABLE "outbound_gate_passes" ADD CONSTRAINT "outbound_gp_exact_workspace"
  CHECK ("workspaceId" = '4bc313cf-2869-4d87-8f1e-22a147f18d2d');
ALTER TABLE "outbound_gate_passes"
  ADD CONSTRAINT "outbound_gp_invoice_fk" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "outbound_gp_sale_fk" FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE RESTRICT;

CREATE FUNCTION assert_outbound_gp_tenant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- SHARE also blocks updates of workspace/customer fields, unlike KEY SHARE.
  PERFORM 1 FROM "customers" WHERE "id"=NEW."customerId" AND "workspaceId"=NEW."workspaceId" FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gate pass customer tenant mismatch' USING ERRCODE='23514'; END IF;
  IF NEW."warehouseId" IS NOT NULL THEN
    PERFORM 1 FROM "warehouses" WHERE "id"=NEW."warehouseId" AND "workspaceId"=NEW."workspaceId"::uuid FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Gate pass warehouse tenant mismatch' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW."invoiceId" IS NOT NULL THEN
    PERFORM 1 FROM "invoices" WHERE "id"=NEW."invoiceId" AND "workspaceId"=NEW."workspaceId" AND "customerId"=NEW."customerId" AND "salesOrderId"=NEW."salesOrderId" FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Gate pass invoice tenant mismatch' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW."salesOrderId" IS NOT NULL THEN
    PERFORM 1 FROM "sales_orders" WHERE "id"=NEW."salesOrderId" AND "workspaceId"=NEW."workspaceId" AND "customerId"=NEW."customerId" FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Gate pass sale tenant mismatch' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER outbound_gp_tenant BEFORE INSERT OR UPDATE ON "outbound_gate_passes"
  FOR EACH ROW EXECUTE FUNCTION assert_outbound_gp_tenant();

CREATE FUNCTION assert_outbound_gp_item_tenant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tenant TEXT;
BEGIN
  SELECT "workspaceId" INTO tenant FROM "outbound_gate_passes" WHERE "id"=NEW."gatePassId" FOR KEY SHARE;
  PERFORM 1 FROM "products" WHERE "id"=NEW."productId" AND "workspaceId"=tenant FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gate pass product tenant mismatch' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER outbound_gp_item_tenant BEFORE INSERT OR UPDATE ON "outbound_gate_pass_items"
  FOR EACH ROW EXECUTE FUNCTION assert_outbound_gp_item_tenant();

CREATE FUNCTION prevent_outbound_gp_parent_tenant_move() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId" THEN
    IF TG_TABLE_NAME='products' THEN
      IF EXISTS (SELECT 1 FROM "outbound_gate_pass_items" WHERE "productId"=OLD."id") THEN RAISE EXCEPTION 'Referenced gate pass product tenant is immutable' USING ERRCODE='23514'; END IF;
    ELSIF TG_TABLE_NAME='customers' THEN
      IF EXISTS (SELECT 1 FROM "outbound_gate_passes" WHERE "customerId"=OLD."id") THEN RAISE EXCEPTION 'Referenced gate pass customer tenant is immutable' USING ERRCODE='23514'; END IF;
    ELSIF TG_TABLE_NAME='warehouses' THEN
      IF EXISTS (SELECT 1 FROM "outbound_gate_passes" WHERE "warehouseId"=OLD."id") THEN RAISE EXCEPTION 'Referenced gate pass warehouse tenant is immutable' USING ERRCODE='23514'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER outbound_gp_product_parent BEFORE UPDATE OF "workspaceId" ON "products" FOR EACH ROW EXECUTE FUNCTION prevent_outbound_gp_parent_tenant_move();
CREATE TRIGGER outbound_gp_customer_parent BEFORE UPDATE OF "workspaceId" ON "customers" FOR EACH ROW EXECUTE FUNCTION prevent_outbound_gp_parent_tenant_move();
CREATE TRIGGER outbound_gp_warehouse_parent BEFORE UPDATE OF "workspaceId" ON "warehouses" FOR EACH ROW EXECUTE FUNCTION prevent_outbound_gp_parent_tenant_move();

CREATE FUNCTION prevent_outbound_gp_financial_parent_move() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='invoices' THEN
    IF EXISTS (SELECT 1 FROM "outbound_gate_passes" g WHERE g."invoiceId"=OLD."id" AND (g."workspaceId"<>NEW."workspaceId" OR g."customerId"<>NEW."customerId" OR g."salesOrderId" IS DISTINCT FROM NEW."salesOrderId")) THEN RAISE EXCEPTION 'Gate pass invoice parent is immutable' USING ERRCODE='23514'; END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM "outbound_gate_passes" g WHERE g."salesOrderId"=OLD."id" AND (g."workspaceId"<>NEW."workspaceId" OR g."customerId"<>NEW."customerId")) THEN RAISE EXCEPTION 'Gate pass sale parent is immutable' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER outbound_gp_invoice_parent BEFORE UPDATE OF "workspaceId", "customerId", "salesOrderId" ON "invoices" FOR EACH ROW EXECUTE FUNCTION prevent_outbound_gp_financial_parent_move();
CREATE TRIGGER outbound_gp_sale_parent BEFORE UPDATE OF "workspaceId", "customerId" ON "sales_orders" FOR EACH ROW EXECUTE FUNCTION prevent_outbound_gp_financial_parent_move();
