CREATE TABLE "customer_price_rules" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "minQuantity" DECIMAL(15,4) NOT NULL DEFAULT 1,
  "unitPrice" DECIMAL(15,2) NOT NULL,
  "discountPerUnit" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_price_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_price_rules_workspaceId_customerId_productId_minQuantity_key"
ON "customer_price_rules"("workspaceId", "customerId", "productId", "minQuantity");

CREATE INDEX "customer_price_rules_workspaceId_customerId_isActive_idx"
ON "customer_price_rules"("workspaceId", "customerId", "isActive");

CREATE INDEX "customer_price_rules_workspaceId_productId_idx"
ON "customer_price_rules"("workspaceId", "productId");

ALTER TABLE "customer_price_rules"
ADD CONSTRAINT "customer_price_rules_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_price_rules"
ADD CONSTRAINT "customer_price_rules_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_price_rules"
ADD CONSTRAINT "customer_price_rules_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
