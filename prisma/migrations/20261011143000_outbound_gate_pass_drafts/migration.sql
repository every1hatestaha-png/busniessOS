-- Additive draft-only data structures. Do not execute against production
-- until exact-head migrations and disposable-db restore verification pass.
ALTER TYPE "DocumentKind" ADD VALUE 'GATE_PASS';

CREATE TYPE "OutboundGatePassStatus" AS ENUM (
  'DRAFT', 'ISSUED', 'IN_TRANSIT', 'RECEIVING_PENDING',
  'ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED', 'INVOICED', 'CANCELLED'
);

CREATE TABLE "outbound_gate_passes" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "warehouseId" UUID,
  "gatePassNumber" TEXT NOT NULL,
  "status" "OutboundGatePassStatus" NOT NULL DEFAULT 'DRAFT',
  "gatePassDate" TIMESTAMP(3) NOT NULL,
  "deliveryAddress" TEXT,
  "notes" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3),
  "dispatchedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "outbound_gate_passes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outbound_gate_pass_items" (
  "id" TEXT NOT NULL,
  "gatePassId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productNameSnapshot" TEXT NOT NULL,
  "productSkuSnapshot" TEXT,
  "productUnitSnapshot" "ProductUnit" NOT NULL,
  "dispatchedQuantity" DECIMAL(15,4) NOT NULL,
  "acceptedQuantity" DECIMAL(15,4) NOT NULL DEFAULT 0,
  "rejectedQuantity" DECIMAL(15,4) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "outbound_gate_pass_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "outbound_gate_pass_items_quantity_check" CHECK (
    "dispatchedQuantity" > 0
    AND "acceptedQuantity" >= 0
    AND "rejectedQuantity" >= 0
    AND "acceptedQuantity" + "rejectedQuantity" <= "dispatchedQuantity"
  )
);

CREATE UNIQUE INDEX "outbound_gate_passes_workspaceId_gatePassNumber_key"
  ON "outbound_gate_passes" ("workspaceId", "gatePassNumber");
CREATE UNIQUE INDEX "outbound_gate_passes_workspaceId_idempotencyKey_key"
  ON "outbound_gate_passes" ("workspaceId", "idempotencyKey");
CREATE INDEX "outbound_gate_passes_workspaceId_status_createdAt_idx"
  ON "outbound_gate_passes" ("workspaceId", "status", "createdAt");
CREATE INDEX "outbound_gate_passes_workspaceId_customerId_idx"
  ON "outbound_gate_passes" ("workspaceId", "customerId");
CREATE UNIQUE INDEX "outbound_gate_pass_items_gatePassId_productId_key"
  ON "outbound_gate_pass_items" ("gatePassId", "productId");
CREATE INDEX "outbound_gate_pass_items_productId_idx"
  ON "outbound_gate_pass_items" ("productId");

ALTER TABLE "outbound_gate_passes"
  ADD CONSTRAINT "outbound_gate_passes_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "outbound_gate_passes"
  ADD CONSTRAINT "outbound_gate_passes_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "outbound_gate_pass_items"
  ADD CONSTRAINT "outbound_gate_pass_items_gatePassId_fkey"
    FOREIGN KEY ("gatePassId") REFERENCES "outbound_gate_passes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "outbound_gate_pass_items"
  ADD CONSTRAINT "outbound_gate_pass_items_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
