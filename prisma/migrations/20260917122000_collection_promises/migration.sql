CREATE TABLE "collection_promises" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "amount" DECIMAL(15,2) NOT NULL,
  "promiseDate" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "note" TEXT,
  "createdById" TEXT,
  "fulfilledAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "collection_promises_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "collection_promises_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "collection_promises_status_check" CHECK ("status" IN ('PENDING', 'FULFILLED', 'CANCELLED')),
  CONSTRAINT "collection_promises_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "collection_promises_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "collection_promises_workspace_status_date_idx"
  ON "collection_promises"("workspaceId", "status", "promiseDate");

CREATE INDEX "collection_promises_customer_date_idx"
  ON "collection_promises"("workspaceId", "customerId", "promiseDate");

CREATE UNIQUE INDEX "collection_promises_one_pending_per_customer_idx"
  ON "collection_promises"("workspaceId", "customerId")
  WHERE "status" = 'PENDING';
