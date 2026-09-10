# BusinessOS Finance-Grade Automated QA Architecture

## 1. Overview

This is a comprehensive, finance-grade automated QA system for BusinessOS — a production business management and accounting application. It goes far beyond UI smoke tests. The system simulates a real business, independently calculates expected financial outcomes, and verifies that BusinessOS produces correct results.

**Core Principle**: BusinessOS calculations are NOT the source of truth. An independent test-side oracle calculates expected values and compares them against BusinessOS database state.

## 2. Architecture

```
tests/finance-grade/
├── oracle/
│   ├── accounting-oracle.ts          # Independent GL, inventory, AP, AR calculator
│   ├── precision.ts                  # Decimal arithmetic, rounding rules
│   └── types.ts                      # Oracle types and interfaces
├── fixtures/
│   ├── golden-business.ts            # Deterministic seed data (5 suppliers, 20 customers, 100 products)
│   └── test-users.ts                 # RBAC test users (OWNER, ADMIN, MANAGER, STAFF)
├── helpers/
│   ├── db-helpers.ts                 # Database setup, teardown, verification
│   ├── assertion-helpers.ts          # Financial assertion helpers
│   ├── context-helpers.ts            # Service context builders
│   └── idempotency-helpers.ts        # Duplicate request simulation
├── invariant-checkers/
│   ├── gl-balanced.ts                # Debit = Credit verification
│   ├── customer-reconciliation.ts    # AR = sum(ledger debits - credits)
│   ├── supplier-reconciliation.ts    # AP = sum(ledger credits - debits)
│   ├── inventory-reconciliation.ts   # Stock qty = sum(inventory transactions)
│   ├── cash-reconciliation.ts        # Cash balance = GL balance
│   └── orphan-checker.ts             # No orphan accounting entries
├── scenarios/
│   ├── purchase-lifecycle.test.ts    # PO → GRN → Inventory → AP
│   ├── sale-lifecycle.test.ts        # Sale → Inventory → AR → COGS
│   ├── payment-lifecycle.test.ts     # Customer & supplier payments
│   ├── returns-lifecycle.test.ts     # Customer & supplier returns
│   ├── voids-reversals.test.ts       # Void GRN, cancel sale, reversals
│   ├── precision-edge-cases.test.ts  # Decimal quantities, per-kg, rounding
│   ├── concurrency-idempotency.test.ts # Double-submit, race conditions
│   ├── rbac-financial.test.ts        # Role permission testing
│   ├── report-reconciliation.test.ts # Trial balance, P&L, aging reports
│   └── long-running-simulation.test.ts # 30-day fake business
├── visual/
│   └── print-validation.test.ts      # A4 print layout validation
├── reports/
│   └── qa-report-generator.ts        # Final report generation
└── setup.ts                          # Global test setup
```

## 3. Independent Accounting Oracle

The oracle is a pure TypeScript module that independently tracks:

### 3.1 Inventory Oracle
- Tracks per-product quantity via inventory transaction log
- Calculates weighted average cost (WAC) after each receipt
- Verifies: `stockQty = sum(OPENING_STOCK + PURCHASE + RETURN_IN) - sum(SALE + RETURN_OUT + ADJUSTMENT)`

### 3.2 Accounts Payable Oracle
- Tracks supplier balances independently
- Verifies: `supplierBalance = sum(PURCHASE_RECEIPT credits) - sum(PAYMENT debits) - sum(SUPPLIER_RETURN debits)`

### 3.3 Accounts Receivable Oracle
- Tracks customer balances independently
- Verifies: `customerBalance = sum(SALE debits) - sum(PAYMENT credits) - sum(CUSTOMER_RETURN credits)`

### 3.4 Cash/Bank Oracle
- Tracks cash account movements independently
- Verifies: `cashBalance = opening + sum(RECEIPT debits) - sum(PAYMENT credits) - sum(EXPENSE credits)`

### 3.5 General Ledger Oracle
- Tracks all GL entries independently
- Verifies: `sum(debits) = sum(credits)` for every source document
- Verifies: trial balance balances

### 3.6 Profit & Loss Oracle
- Calculates: `Net Profit = Sales Revenue - COGS - Operating Expenses + Other Income`
- Verifies against GL account balances

## 4. Golden Business Scenario

A deterministic test business with known opening data:

| Entity | Count | Purpose |
|--------|-------|---------|
| Suppliers | 5 | Various payment terms |
| Customers | 20 | Mix of cash and credit |
| Products | 100 | Mix of units, weights, categories |
| Opening stock | Per product | Known quantities |
| Opening cash | PKR 500,000 | Known balance |
| Opening bank | PKR 2,000,000 | Known balance |
| Opening AR | PKR 300,000 | Known receivables |
| Opening AP | PKR 200,000 | Known payables |

## 5. Transaction Lifecycle Testing

Every major module is tested through its complete lifecycle:

```
Create → View → Edit → Post → Partial Process → Full Process → Void → Cancel → Reverse → Verify
```

### 5.1 Purchase → GRN → Inventory → AP
1. Create PO with 3 items
2. Receive partial GRN (50%)
3. Verify inventory +50%, AP increased
4. Receive second GRN (remaining 50%)
5. Verify inventory +100%, AP = full PO amount
6. Void second GRN
7. Verify inventory -50%, AP reduced
8. Create supplier return against first GRN
9. Verify inventory reduced, AP reduced

### 5.2 Sale → Inventory → AR → COGS
1. Create credit sale (no payment)
2. Verify inventory reduced, AR increased, COGS booked
3. Record partial payment
4. Verify AR reduced, cash increased
5. Customer returns partial items
6. Verify inventory restored, AR reduced, credit note issued
7. Cancel original sale
8. Verify all entries reversed

### 5.3 Payments
1. Customer pays invoice partially
2. Verify cash increased, AR reduced
3. Supplier paid partially
4. Verify cash decreased, AP reduced
5. Test advance payment (no invoice allocation)
6. Test duplicate payment prevention

### 5.4 Voids and Reversals
1. Void a GRN
2. Verify reversal entries created
3. Verify inventory reversed
4. Verify AP reversed
5. Cancel a sale
6. Verify all GL entries reversed
7. Verify customer balance restored

## 6. Accounting Invariants

After every transaction, verify:

```typescript
// GL Balance
totalDebits === totalCredits

// Customer Reconciliation
customer.currentBalance === 
  sum(customerLedger.debits) - sum(customerLedger.credits)

// Supplier Reconciliation
supplier.currentBalance ===
  sum(supplierLedger.credits) - sum(supplierLedger.debits)

// Inventory Reconciliation
product.stockQuantity ===
  sum(inventoryTransactions where type IN [OPENING_STOCK, PURCHASE, RETURN_IN, SALE_CANCELLATION, PURCHASE_CANCELLATION]) 
  - sum(inventoryTransactions where type IN [SALE, RETURN_OUT, ADJUSTMENT, PURCHASE_RECEIPT])

// Cash Reconciliation
cashBankAccount.currentBalance ===
  openingBalance + sum(GL debits on cash account) - sum(GL credits on cash account)

// No Orphans
every GL entry has a valid sourceType + sourceId
every Payment has a valid allocation
every GRN has valid items

// Posted transactions are immutable
posted GRN cannot be hard-deleted
posted sale cannot be hard-deleted
```

## 7. Long-Running Business Simulation

A deterministic 30-day simulation generating ~500+ transactions:

| Day Range | Activity |
|-----------|----------|
| Day 1-3 | Setup suppliers, products, opening balances |
| Day 4-7 | First purchase orders, partial GRNs |
| Day 8-10 | First sales, mix of cash and credit |
| Day 11-15 | Payments start, partial GRNs continue |
| Day 16-20 | Returns processed, voids tested |
| Day 21-25 | High volume, concurrent operations |
| Day 26-28 | Expense vouchers, bank transfers |
| Day 29-30 | Final reconciliation |

At end, reconcile:
- Inventory quantities and values
- Cash and bank balances
- AR and AP balances
- Trial balance (debits = credits)
- P&L correctness
- Customer and supplier aging

## 8. Concurrency and Idempotency

| Scenario | Expected Result |
|----------|----------------|
| Double-click Save | Single record created (idempotency key) |
| Same request twice | Second returns existing record |
| Two sales, same stock | One succeeds, one fails (INSUFFICIENT_STOCK) |
| Two GRNs simultaneously | Both process correctly (serializable) |
| Duplicate payment | Rejected or idempotent |
| Page refresh during save | No duplicate records |
| Network failure mid-transaction | Rollback, no partial state |

## 9. Precision Rules

| Rule | Implementation |
|------|---------------|
| Money precision | 2 decimal places (PKR) |
| Quantity precision | 4 decimal places |
| WAC calculation | (existingValue + newValue) / (existingQty + newQty) — no intermediate rounding |
| Discount calculation | discountPerUnit × quantity — per line, not per order |
| Trial balance tolerance | 0.00 (exact match) |
| Rounding mode | Banker's rounding (round half to even) |

## 10. Report Reconciliation

| Report | Reconciliation |
|--------|---------------|
| Trial Balance | Sum of all GL debit balances = Sum of all GL credit balances |
| P&L | Revenue - COGS - Expenses = Net Profit (matches GL) |
| Customer Aging | Sum of overdue invoices per customer = customer.currentBalance |
| Supplier Aging | Sum of overdue POs per supplier = supplier.currentBalance |
| Inventory Valuation | Sum of (stockQty × costPrice) = GL Inventory account balance |
| Cash Book | GL cash account balance = CashBankAccount.currentBalance |

## 11. RBAC Testing

| Role | Can Do | Cannot Do |
|------|--------|-----------|
| OWNER | Everything | — |
| ADMIN | Everything except owner-only settings | Delete workspace |
| MANAGER | Create/edit transactions, view reports | Delete posted transactions, manage users |
| STAFF | View, create drafts | Post, void, delete, manage payments |

## 12. Release Gate

```
PASS:                    All tests pass, no accounting errors
PASS WITH WARNINGS:      Non-critical issues found (UX, performance)
BLOCK RELEASE:           Any accounting, inventory, data integrity, or security failure
```

## 13. Implementation Phases

### Phase 1: Core Infrastructure
- Accounting oracle
- Precision helpers
- Database helpers
- Invariant checkers

### Phase 2: Golden Scenario
- Seed data
- Test users
- Opening balance verification

### Phase 3: Transaction Lifecycle
- Purchase → GRN → AP
- Sale → AR → COGS
- Payments
- Returns

### Phase 4: Invariants and Reconciliation
- GL balanced check
- Customer/supplier reconciliation
- Inventory reconciliation
- Cash reconciliation

### Phase 5: Advanced Testing
- Voids and reversals
- Concurrency
- Precision edge cases
- RBAC

### Phase 6: Reports and Simulation
- Report reconciliation
- Long-running simulation

### Phase 7: Reporting
- QA report generation
- Release gate determination
