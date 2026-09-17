# MunshiOS Industry Modules Audit — 2026-09-17

## Purpose
The public website must not advertise capabilities that are only marketing copy. This audit maps each public industry card to existing finance-grade MunshiOS capabilities or to the new additive industry backend in this branch.

## Coverage

### Retail
- Sales / POS — existing sales/order/invoice flow
- Inventory — existing products + inventory transactions
- Purchases — existing PO + GRN
- Customer khata — existing customer ledger/payments/allocations
- Supplier khata — existing supplier ledger/payables/payments
- Expenses — existing expense + accounting flow
- Daily reports — existing dashboard/reporting foundation

Status: **Existing core**

### Wholesale / Distribution
- Purchase orders — existing
- GRN — existing
- Inventory — existing
- Credit sales — existing
- Customer ledger — existing
- Supplier ledger — existing
- GST / WHT — existing tax/payment support
- Returns — existing customer/supplier returns

Status: **Existing core / strongest current fit**

### Restaurant
New backend added in this branch:
- Restaurant tables with capacity/area/status
- Recipes + ingredient quantities + wastage percentages
- Kitchen ticket workflow: QUEUED → PREPARING → READY → SERVED
- Ingredient consumption when a ticket is served, with negative-stock protection and idempotency guard
- Cash shift open/close with expected cash and variance
- Existing SalesOrder/Invoice remains the POS/order financial engine
- Existing Product/Inventory remains ingredient stock engine

Status: **Backend implemented in branch; migration tested on isolated Neon branch**

### Manufacturing
New backend added in this branch:
- Warehouses + per-warehouse stock
- Safe warehouse transfers
- Versioned BOMs + materials + wastage
- Production runs with DRAFT → APPROVED → POSTED lifecycle
- Manager approval gate
- Posting atomically consumes raw materials and adds finished goods
- Negative-stock protection
- Material-cost roll-up to finished product weighted cost
- Production inventory transactions reference the run for traceability
- Existing accounting remains the financial ledger foundation

Status: **Backend implemented in branch; migration tested on isolated Neon branch**

### Services
Existing + new backend:
- Clients — existing Customer model
- Quotations — new service quote + quote lines
- Jobs — new service job workflow
- Billing — existing sales/invoice engine
- Receipts — existing payment engine
- Expenses — existing expense engine
- Team access — existing workspace membership/RBAC foundation
- Reports — existing reporting foundation plus new health counters

Status: **Backend implemented in branch; migration tested on isolated Neon branch**

## Module entitlements
New `workspace_modules` storage and server-side `requireWorkspaceModule()` guard ensure industry features are not merely hidden in the UI: server domain methods reject access when the workspace has not enabled that module.

Industry templates:
- RETAIL: inventory
- RESTAURANT: inventory + restaurant
- WHOLESALE: inventory + wholesale + accounting
- MANUFACTURING: inventory + wholesale + manufacturing + accounting
- SERVICES: services + accounting

## QA performed
- Vercel TypeScript compilation completed successfully for the industry service commit.
- Preview deployment later failed in existing `/api/search` because preview environment lacks `DATABASE_URL`; this occurred after TypeScript completed and is unrelated to the new domain types.
- Migration first failed safely on a Neon temporary branch because existing Prisma UUID strings are stored as TEXT; production was untouched.
- Migration was corrected for legacy identifier compatibility and then applied successfully to a new temporary Neon migration branch.
- Smoke inserted and verified: workspace modules, restaurant table, recipe + ingredient, warehouse + warehouse stock, BOM + item, service quote + line, service job.
- Duplicate restaurant table name was rejected by unique constraint.
- Restaurant table capacity `0` was rejected by DB check constraint.

## Release gates before production
1. Apply the prepared migration to production only with explicit approval.
2. Merge this branch after migration approval.
3. Wire module selections from Get Your Munshi checkout into `workspace_modules` during workspace provisioning.
4. Add industry-specific dashboard/navigation screens; backend domain is designed so UI can call stable services instead of rebuilding business logic.
5. Run full production test suite after migration and before enabling modules for paying workspaces.
