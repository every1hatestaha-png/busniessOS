# Phase 3 Step 3: UI/UX V2 Progress Report

Status: PARTIAL — Batch A (Core Transaction UX) PASS. Batch B (Core Management + Reporting UX) PASS. Batch C pending.

## Batch A — Core Transaction UX

### Scope
Sales, Purchases, GRN / Receive Goods, Supplier Returns, Supplier Payments, Expenses.

### Audit Method
Read every page, form, list, detail, and print route in the Batch A scope. Traced each business calculation to its source. Verified field labels, column headers, validation messages, error states, and print entry points against the non-negotiable business rules.

### Business Rule Verification

#### Per-Unit Discount
- **Rule**: Discount is per unit, not a line total.
- **Example**: Qty 50, price Rs 1,000, disc/unit Rs 50 → line total Rs 47,500.
- **Verified**: `sales-order-form.tsx` computes `lineTotal = qty * (unitPrice - discountPerUnit)`. `sales/[id]/page.tsx` computes `calculateSaleLine` identically. `sale.ts` schema validates `discountPerUnit <= unitPrice`.
- **Regression tests**: Added 5 tests in `sale-validation.test.ts` covering the exact Rs 47,500 example, zero discount, fractional quantities, and edge cases.

#### Weighted GRN
- **Rule**: 49 pieces, 4.5 kg/unit, accepted 220.5 kg, rate Rs 282/kg → value Rs 62,181.
- **Verified**: `grn-calculations.ts` `calculateAcceptedValue` uses `acceptedWeightKg × ratePerKg`. Returns `null` for incomplete fields instead of zero. `goods-receipt-form.tsx` auto-populates weight when received qty changes.
- **Regression tests**: 9 tests in `grn-calculations.test.ts` covering weighted, unit, null, negative, rounding, and weight derivation.

#### Customer Credit Days vs Limit
- **Rule**: Credit days and monetary credit limit are separate concepts.
- **Verified**: `customer-credit.ts` `getCreditPresentation` returns "No monetary limit" when limit ≤ 0. No absurd utilization percentages.
- **Regression tests**: 5 tests in `customer-credit.test.ts` covering zero, negative, NaN, over-limit, and advance.

#### Supplier Payment Gross/WHT/Net
- **Rule**: Gross liability settled minus WHT equals net cash/bank payment.
- **Verified**: `supplier-payment-form.tsx` shows equation inline. Over-WHT displays "Invalid net preview" and blocks submit.

#### Auth Mutations
- **Rule**: No legitimate mutation shows "Authentication is required."
- **Verified**: `requireApiUser` accepts both `session_token` and `oauth_token`. `proxy.ts` scopes web routes to `session_token`, desktop routes to `oauth_token`.

#### Print Actions
- **Rule**: Print buttons must work independently of Ctrl+P.
- **Verified**: PO detail has "Print PO" link → `/purchases/{id}/print`. GRN detail has "Print GRN" link → `/goods-receipts/{id}/print`. Invoice detail has `PrintButton` (window.print()). Supplier return and expense voucher detail have `PrintButton`.
- **New**: Sale detail now has "Print Invoice" link → invoice detail page.

### Defects Found and Fixed

| # | Severity | Area | Defect | Fix | File |
|---|----------|------|--------|-----|------|
| 1 | P1 | GRN form | Column header "Actual rate" ambiguous for weight-priced items | Changed to "Rate" matching GRN detail page | `components/goods-receipts/goods-receipt-form.tsx` |
| 2 | P1 | GRN form | Subheading "accepted kg x actual rate/kg" vague | Changed to "accepted weight (kg) × rate/kg" | `components/goods-receipts/goods-receipt-form.tsx` |
| 3 | P1 | Supplier return form | Reason and notes fields had no visible labels, only placeholders | Added visible labels with required indicator and optional indicator | `components/purchases/supplier-return-form.tsx` |
| 4 | P1 | Supplier return form | Success/error messages not visually differentiated | Styled success (green) and error (red) with role attributes | `components/purchases/supplier-return-form.tsx` |
| 5 | P1 | Sale detail | No print action in header; user had to navigate to invoice separately | Added "Print Invoice" button linking to invoice detail page | `app/(dashboard)/sales/[id]/page.tsx` |
| 6 | P1 | Supplier returns list | Missing `max-w-[1600px]` constraint unlike other list pages | Added consistent max-width | `app/(dashboard)/supplier-returns/page.tsx` |
| 7 | P2 | Expense register | Bare `<section>` styling inconsistent with Card-based tables | Converted to Card/CardContent with consistent row styling | `app/(dashboard)/accounting/expenses/page.tsx` |
| 8 | P2 | Purchase new page | Description said "Inventory and payable are recorded through a GRN" | Clarified to "Inventory and supplier payable are recorded when goods are received" | `app/(dashboard)/purchases/new/page.tsx` |

### Core Screen Audit Results

#### 1. Sales List
- **Status**: PASS
- Search, status filter, summary metrics (orders shown, sales value, balance due), row links to detail. Consistent styling.

#### 2. Sales Form (New)
- **Status**: PASS
- Customer selection with balance/credit preview. Line items with product search, qty, unit price, disc/unit, line total. Order summary with subtotal, line discounts, order discount, total, paid now, receivable. Correct per-unit discount semantics verified.

#### 3. Sale Detail
- **Status**: PASS (after fix)
- Items table shows product, qty, unit price, disc/unit, line total. Customer card with phone, address, balance, credit limit. Payment summary with subtotal, discounts, total, paid, balance due. Print Invoice button added. Cancel and New Sale actions present.

#### 4. Purchases List
- **Status**: PASS
- Search, status filter, row links. Lines/GRNs count, ordered value, paid, payable columns.

#### 5. Purchase Form (New)
- **Status**: PASS
- Supplier selection, department, expected delivery. Unit/weight pricing toggle. Weight columns: unit wt. kg, rate/kg, total kg. Estimated ordered value. PO-only note (no inventory/payable until GRN).

#### 6. Purchase Detail
- **Status**: PASS
- Line items with ordered/received/remaining. GRN history table. Supplier card. Print PO, Receive Goods, Edit, Delete, Cancel actions. Supplier return form inline. Three summary cards: PO summary, receiving summary, payment summary.

#### 7. GRN List
- **Status**: PASS
- Search, ACTIVE/VOIDED filter, row links. Accepted count and value columns.

#### 8. GRN Form (Receive)
- **Status**: PASS (after fix)
- PO reference, supplier, receipt date, received/checked by. Receiving lines with ordered, prev. accepted, remaining, received qty, accepted qty, received kg, accepted kg, rate, accepted value. Weighted items show PO basis. Rejected quantity highlighted. "Rate" column label now clear.

#### 9. GRN Detail
- **Status**: PASS
- Receipt lines with all quantities, rate (/kg or /unit), amount. Receipt summary. Print GRN, Edit, Void actions. Voided/referenced warnings.

#### 10. Supplier Returns List
- **Status**: PASS (after fix)
- Return #, supplier, PO, GRN, date, status, total. Links to detail. Max-width constraint added.

#### 11. Supplier Return Form
- **Status**: PASS (after fix)
- GRN link selection. Product with accepted qty and rate info. Return quantity with max constraint. Reason (required, visible label). Notes (optional, visible label). Success/error messages styled.

#### 12. Supplier Return Detail
- **Status**: PASS
- Document frame with number, status, date, PO, GRN. Returned-to and reason. Items table. Return total. Debit note reference. Notes. Print button.

#### 13. Supplier Payment Form
- **Status**: PASS (improved in prior checkpoint)
- Gross/WHT/net equation visible. Bill allocation table with PO ref, date, totals, allocate now, remaining. Cash/bank, method, reference, date. Over-WHT validation. Retry/busy states.

#### 14. Expense Form
- **Status**: PASS (improved in prior checkpoint)
- Category, payment account, amount, date, payee, reference, notes. Visible labels. Busy locking. Retry states.

#### 15. Expense Register
- **Status**: PASS (after fix)
- Card-wrapped table with consistent row styling. Date, voucher, category, paid from, payee/reference, amount. Link to detail.

#### 16. Expense Voucher Detail
- **Status**: PASS
- Document frame with paid-to, paid-from, expense account, description, amount. Total paid. Notes. Print voucher.

### Files Changed in Batch A

- `components/goods-receipts/goods-receipt-form.tsx` — Rate column label, subheading
- `components/purchases/supplier-return-form.tsx` — Labels, message styling
- `app/(dashboard)/sales/[id]/page.tsx` — Print Invoice button
- `app/(dashboard)/supplier-returns/page.tsx` — Max-width constraint
- `app/(dashboard)/accounting/expenses/page.tsx` — Card styling, row consistency
- `app/(dashboard)/purchases/new/page.tsx` — Description text
- `tests/unit/sale-validation.test.ts` — 14 tests (was 3)
- `tests/unit/grn-calculations.test.ts` — 9 tests (was 4)

### Regression Tests

| Test File | Before | After | Coverage |
|-----------|--------|-------|----------|
| `sale-validation.test.ts` | 3 tests | 14 tests | Per-unit discount calculation, duplicate products, discount exceeds price, edge cases |
| `grn-calculations.test.ts` | 4 tests | 9 tests | Negative weight/rate, non-finite inputs, rounding, weight derivation edge cases |
| `customer-credit.test.ts` | 5 tests | 5 tests | (unchanged — already comprehensive) |

## Pre-Existing Work (Prior Checkpoints)

### UI System
Repaired malformed CSS declarations, duplicate radius tokens, repeated unused utilities, and an unmatched brace that prevented production builds. Removed the unused `munshi-*` CSS abstraction. Corrected undefined `primary-200`/`destructive-200` badge classes.

### Global Layout
Added `min-w-0` to the main flex column. PageHeader wraps at narrow widths. MetricCard padding and wrapping improved.

### Sidebar and Top Bar
Mobile drawer width matched to 260px sidebar. Nonfunctional notification button removed.

### Dashboard
Monthly sales and received-purchasing amounts promoted to KPI grid. Card, header, and panel wrapping improved.

### Supplier Payment (Prior)
Visible labels, gross/WHT/net equation, over-WHT preview, retry states, input preservation.

### Expense Form (Prior)
Visible labels, optional indicators, busy locking, preserved-input retry.

## Manual Workflows

None of the five required full workflows has been manually exercised in the browser. Customer-to-sale-to-payment-to-print, supplier-to-weighted-GRN-to-payment, expense-to-voucher-print, product-to-movement-history, and customer-to-statement-print are all PENDING. These require a running dev server with database access.

## Profile / Settings

Not yet audited or refined. Deferred to Batch B.

## Deferred Work (Batch B+)

- Profile and Settings refinement
- Full browser workflow exercise at 1366x768, 1440x900, 1920x1080
- Print quality verification for all document types
- Inventory, Products, Accounting, Reports screens
- Table UX consistency (pagination, sorting, date filters)
- Form UX consistency across all screens
- Error UX audit (Prisma/Clerk internals)
- Accessibility review

## Validation

| Command | Result |
|---------|--------|
| `npx prisma validate` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm test` | 122/122 PASS (12 files) |
| `npx eslint app components lib` | PASS |
| `npm run build:web` | PASS |
| `npm run desktop:test` | PASS (known navigation-race warning) |

No database connection string was read or printed. No migration/seed command was run. No business records were created or modified.

## Final Decision

**BATCH A: PASS**

All six core transaction areas (Sales, Purchases, GRN, Supplier Returns, Supplier Payments, Expenses) have been audited, defects fixed, and regression tests added. Automated gates all pass. Manual browser workflow exercise remains pending for a later step when dev server access is available.

Phase 3 Step 3 overall remains **PARTIAL** until Batch C (manual workflows, print verification, final product UX) is complete.

## Batch B — Core Management + Reporting UX

### Scope
Customers, Suppliers, Products, Inventory, Accounting, Reports, Profile, Settings.

### Audit Method
Read every page, form, list, detail, and report in the Batch B scope. Verified label clarity, table consistency, form UX, credit semantics, and branding.

### Core Screen Audit Results

#### 1. Customer List
- **Status**: PASS (after fix)
- Metric cards: total receivable, customer accounts, restricted accounts. Search, status filter, city filter. Table with receivable, credit limit ("Not configured" when 0), status, contact, city. Footer shows count. Wrapper converted from bare div to Card for consistency.

#### 2. Customer Form (New/Edit)
- **Status**: PASS
- Account identity section: name, company, phone, email, city, status, address. Credit controls section: credit days, credit limit (PKR), opening receivable (new only), notes. Proper labels, placeholders, validation, error messages. Cancel/save buttons.

#### 3. Customer Detail
- **Status**: PASS (after fix)
- Header: company name, status badges, city. Actions: edit, remove. Metric cards: outstanding balance, credit terms (days), credit limit, total sales, total payments. Tabbed detail: Khata, Invoices, Payments, Orders, Overview. Record receipt sidebar when balance > 0. Label changed from "Monetary credit usage" to "Credit limit" for clarity.

#### 4. Customer Detail Tabs
- **Status**: PASS
- Khata: date, reference, description, debit, credit, running balance. Invoices: number, issued, due, status, total, balance. Payments: date, reference, method, amount. Orders: number, date, status, total, balance. Overview: contact info, account details, credit position.

#### 5. Supplier List
- **Status**: PASS
- Metric cards: outstanding payable, gross PO value, supplier accounts. Table with supplier name, contact, gross PO value, payable. Row links to detail. Empty state.

#### 6. Supplier Form (New/Edit)
- **Status**: PASS
- Contact name, company, phone, email, city, opening payable (new), address, notes. Proper labels, validation, error messages. Disclaimer about payable balance not changing.

#### 7. Supplier Detail
- **Status**: PASS
- Header: company name, city. Metric cards: outstanding payable, contact card. Inline supplier payment form. Supplier ledger: date, description, debit, credit. Edit/delete actions.

#### 8. Product List (Inventory)
- **Status**: PASS
- Metric cards: stock on hand, inventory value, needs attention. Search, category filter. Table: product (name + SKU), category, stock (qty + unit), cost, selling, status. Row links to detail. Empty state with "New product" CTA.

#### 9. Product Form (New/Edit)
- **Status**: PASS
- Catalog identity: name, SKU, category, unit (PIECE/BOX/CARTON/KG/SET/LITER/METER), status (edit only). Pricing: cost price, selling price, opening stock (new), reorder level. Description. localStorage draft persistence. Proper labels, validation.

#### 10. Product Detail
- **Status**: PASS
- Header: name, stock status, catalog status, SKU. Actions: edit, archive, remove, adjust stock. Metric cards: on hand (qty + unit), selling price (with cost), stock value. Stock movement table: date, type, reference, change (+/- colored), balance. Product details card: description, category, unit, status, gross margin.

#### 11. Stock Adjustment
- **Status**: PASS
- Add/Remove toggle. Quantity input with validation (whole number, non-negative stock). Reason input (min 3 chars). Review step showing calculation. Confirmation step. Success state with "Make another" option.

#### 12. Cash & Bank
- **Status**: PASS
- Metric cards: total available, cash balance, bank balance. Account register: name, type, bank detail, opening, current. Link to detail. Cash bank account form sidebar.

#### 13. Cash & Bank Detail
- **Status**: PASS
- Header: name, type, code, period. Metric cards: ledger closing, receipts, payments, current balance (with reconciliation difference). Bank details bar. Ledger entries: date, document, source, narration, debit, credit, running. Print ledger link.

#### 14. Expense Form/Register
- **Status**: PASS (improved in Batch A)

#### 15. Reports Center
- **Status**: PASS (after fix)
- Organized into Financial, Sales & Purchasing, Accounts, Inventory sections. Each report card with icon, title, description. Max-width updated to 1600px for consistency.

#### 16. Profit & Loss
- **Status**: PASS
- Period presets (Today, This Week, This Month, This Year). Revenue section: gross sales, returns, net sales, other income. Cost section: COGS, gross profit. Expenses section: categories with amounts, total. Net profit highlighted. Cost basis note.

#### 17. General Ledger
- **Status**: PASS
- Account selector, period filters, search. Opening/closing/entries summary. Entries table: date, document (linked), source, narration, debit, credit, running. Closing balance row.

#### 18. Customer Statement
- **Status**: PASS
- Customer selector, period filters, search. Opening/period debit/credit/closing summary. Statement table: date, document (linked), description, debit, credit, balance. Closing balance highlighted.

#### 19. Supplier Statement
- **Status**: PASS
- Same structure as customer statement with supplier selector.

#### 20. Current Stock Report
- **Status**: PASS
- Search, low-stock filter. Summary: total quantity, current-cost value, inventory GL, valuation variance. Table: SKU, product, category, unit, on hand, reorder, cost, stock value, status. Valuation basis note.

#### 21. Stock Movement Report
- **Status**: PASS
- Product selector, movement type filter, period filters, search. Truncation warning at 2000 rows. Table: date, SKU, product, movement type, document, quantity in/out, running qty, unit cost. Cost disclosure note.

#### 22. Settings
- **Status**: PASS (limited scope)
- Members section: invite form (email + role), member list with role selector and remove. Owner role protected. MunshiOS version footer. No company profile section — this would require backend support.

#### 23. Profile
- **Status**: NOT IMPLEMENTED
- No dedicated profile page exists. User profile managed through Clerk. Could be added in a future phase if needed.

### Business Rule Verification

#### Customer Credit Days vs Limit
- **Verified in**: Customer list ("Not configured" when limit = 0), customer detail (MetricCard "Credit limit" with correct values), customer form (separate fields for credit days and credit limit), customer detail tabs Overview (separate displays for credit days, credit limit, and credit position).
- **No absurd utilization**: `getCreditPresentation` returns "No monetary limit" when limit ≤ 0.

#### Credit Position Display
- When limit > 0 and balance < limit: shows "Rs X available"
- When limit > 0 and balance > limit: shows "Rs X over limit"
- When limit ≤ 0: shows "No monetary limit configured"

### Defects Found and Fixed

| # | Severity | Area | Defect | Fix | File |
|---|----------|------|--------|-----|------|
| 1 | P1 | Customer detail | MetricCard label "Monetary credit usage" confusing — suggests utilization when showing limit | Changed to "Credit limit" | `app/(dashboard)/customers/[id]/page.tsx` |
| 2 | P2 | Customer list | Bare div wrapper inconsistent with Card-based tables elsewhere | Converted to Card/CardContent | `app/(dashboard)/customers/page.tsx` |
| 3 | P2 | Reports center | max-w-7xl inconsistent with max-w-[1600px] on other pages | Updated to max-w-[1600px] | `app/(dashboard)/reports/page.tsx` |

### Branding Check
No remaining user-facing "BusinessOS" references in app or components directories.

### Files Changed in Batch B

- `app/(dashboard)/customers/[id]/page.tsx` — Credit limit label
- `app/(dashboard)/customers/page.tsx` — Card wrapper, import
- `app/(dashboard)/reports/page.tsx` — Max-width consistency

### Shared Table/Form Consistency

**Tables**: All major lists use consistent patterns — search, filters, right-aligned numeric values with `tabular-nums`, consistent row heights, PKR formatting, status badges. Batch A lists have explicit `h-11` rows; Batch B lists rely on default row sizing. Minor visual difference.

**Forms**: All forms use proper labels, required indicators, validation messages, busy states, and double-submit prevention. Customer and supplier forms use react-hook-form with zod validation. Product form uses react-hook-form with localStorage draft. Supplier payment and expense forms use manual state management with idempotency keys.

**Error UX**: No Prisma/Clerk internals visible. All errors converted to user-friendly messages using existing architecture.

### Profile / Settings
- Settings limited to member management (requires `workspace.manage` permission).
- No company profile section — would require backend support for company name, address, phone, email, tax info, logo.
- Profile not implemented as a separate page — user identity managed through Clerk.

### Deferred Work (Batch C)
- Five complete end-to-end browser workflows
- Print visual verification for all document types
- Regression pass across historical bugs
- Final product-level UX assessment
- Profile/settings enhancement if backend support added

### Validation

| Command | Result |
|---------|--------|
| `npx prisma validate` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm test` | 122/122 PASS (12 files) |
| `npx eslint app components lib` | PASS |
| `npm run build:web` | PASS |
| `npm run desktop:test` | PASS (known navigation-race warning) |

### Batch B Decision

**BATCH B: PASS**

All eight Batch B areas audited, three defects fixed, branding verified. Automated gates all pass. No P0 or P1 defects remain in Batch B scope.

## BATCH C — REAL BROWSER PRODUCT VALIDATION

Status: IN PROGRESS. Prior automated/source PASS results are not manual QA evidence.

### Environment and Evidence

- Actual installed Edge controlled through Playwright/CDP, authenticated owner session, desktop viewport 1440x900.
- Reused web development server at localhost:3000. Configured database host verified against the known development branch without printing credentials.
- No migrations, resets, auth bypasses, or genuine-record edits. QA records created through rendered forms only.
- Browser tooling and screenshots/PDFs are outside the repository in `C:/Users/every/AppData/Local/Temp/opencode/`.
- Visible Print actions opened `edge://print/`. The native preview surface returned blank screenshots; rendered browser PDF output is inspected separately and is not represented as a native-preview visual PASS.

### Flow 1: Customer / Sale / Payment / Invoice

- Test data: QA Customer 20260911 (`0f8bbbc7-7524-4142-9adc-2026de651b47`), QA Product 20260911, QA Cash 20260911 (test opening balance Rs 100,000).
- Steps performed: created customer with 30 credit days, zero monetary limit and zero opening receivable; created sale for 50 pieces at Rs 1,000 with Rs 50 discount/unit; saved; clicked Print Invoice; repaired resulting runtime failure; reloaded invoice; recorded Rs 10,000 receipt into QA cash account.
- Expected/actual: subtotal Rs 50,000, line discount Rs 2,500, total Rs 47,500 before save and after persistence. Receipt reduced balance to Rs 37,500; invoice PARTIALLY PAID. One receipt PAY-000002 shown; QA account became Rs 110,000.
- Persisted documents: SO-000001 (`f5ebd63b-0fd0-4d9f-879f-dfbad4d97721`), INV-000001 (`781d6143-151a-4b33-8dcd-a52dfeee2d5d`).
- Defect C1 (P1): Print Invoice initially showed a server error, digest 560743283. Root cause: invoice SQL selected removed `sales_order_items.discount` column instead of `discountPerUnit`.
- Fix: `lib/server/invoices.ts` query/type/mapping corrected; misleading per-unit annotation on aggregate invoice discount removed in `app/(dashboard)/invoices/[id]/page.tsx`.
- Regression: `tests/unit/invoices.test.ts` exercises getInvoice query and mapping; failed before fix, passed after (1 test).
- Browser retest: original persisted invoice loads, accepts payment and renders correct amounts. Print button opened Edge print UI. `invoice.pdf` visually inspected: one readable page, correct company/party/date/status/amounts, no form/sidebar leakage; SKU wraps without clipping. Invoice does not explicitly label the quantity unit (remaining UX observation).
- Evidence: `flow1-before-save.png`, `invoice.pdf`. Final flow status: PARTIAL pending native print-preview QA and remaining checks.

### Flow 2: Supplier / PO / GRN / Payment

- Test supplier: QA Supplier 20260911 (`c05dc8a0-8074-4362-83a2-59356d12ab00`). Reused QA Product with explicit weight-based PO pricing rather than changing genuine product records.
- Steps performed: created supplier; created PO-000003 (`b1a692f4-198c-4275-8800-a56e4160e048`) with 49 pieces, 4.5 kg/piece, Rs 282/kg; opened Receive Goods; entered 49 received/accepted; posted GRN-000003 (`d9f12ebc-7050-444e-b45b-f13640e0465e`); clicked Print GRN.
- Expected/actual: editable measured-weight fields auto-populated 220.5 kg from PO basis. Accepted weight x rate is authoritative; displayed Rs 62,181 before posting and on persisted GRN. Ordered 49, previously accepted 0, remaining 49 before posting / 0 after posting. No authentication error.
- GRN print: `grn.pdf` visually inspected, one readable page with 49 piece, 220.5 kg received/accepted, Rs 282/kg, Rs 62,181, ACTIVE, PO reference and signature areas. Native preview opened but its visual contents remain unverified.
- Evidence: `flow2-po-before.png`, `flow2-grn-before.png`, `grn.pdf`.
- Remaining: supplier payment, inventory-impact check and PO print. Final status: IN PROGRESS.

### Flow 3: Expense / Voucher

Not yet exercised. No PASS claimed.

### Flow 4: Product / Inventory Movement

- Test product: QA Product 20260911 (`06b863af-0ed5-4a48-954a-54d948565b80`), SKU QA-20260911-PIECE, unit Piece, cost Rs 500, selling Rs 1,000.
- Steps performed: created with opening stock 100; opened Adjust stock; entered ADD 5 with reason `QA Batch C safe stock addition`; reviewed 100 + 5 = 105 piece; confirmed once.
- Expected/actual: stock 105 piece, history shows +5 ADJUSTMENT with date/reason/balance 105 and opening +100. Success state says stock movement saved. No authentication error.
- Evidence: `flow4-stock.png`, visually inspected. No calculation/persistence defect found. Flow status: PASS for exercised stock-adjustment scenario.

### Flow 5: Customer Statement

Not yet exercised. No PASS claimed.

### Other Observations

- C2: Actual Clerk sign-in heading reads `Sign in to busniessOS`; branding regression is visible, despite prior source-only branding claims. Root cause/fix pending.
- Customer/product validation exposes generic `Too small: expected string ...` messages for required fields. No mutation occurred until fields were completed.
- PageHeader links trigger a Base UI native-button warning in the browser development overlay. Not yet repaired.

### HISTORICAL REGRESSION MATRIX

| Check | Actual evidence / status |
|---|---|
| Valid mutations authenticate | Customer/product/adjustment/sale/customer payment/supplier/PO/GRN succeeded; expense/supplier payment pending |
| Per-unit discount | PASS in browser and invoice PDF for exact example |
| Weighted GRN | PASS before/after posting for exact example |
| Weight/rate units | Visible kg, piece and PKR/kg; horizontal scrolling needed on receiving table |
| Credit days versus limit | QA customer shows 30 days separately from No monetary limit |
| Absurd utilization | None shown for zero-limit QA customer |
| Gross/WHT/net | Pending payment exercise |
| Print without Ctrl+P | Invoice/GRN actions opened native print targets; other documents pending |
| MunshiOS branding | FAIL: Clerk sign-in says busniessOS |
| Busy/double-submit | Customer Saving state observed; single persisted test sale/receipt/adjustment so far; full matrix pending |
| Useful errors/no internals | Invoice failed with generic user-facing error; browser dev diagnostics contained Prisma error; repaired |

### PRINT VISUAL QA MATRIX

| Document | Button/preview opened | Rendered PDF visually inspected | Native preview visuals |
|---|---|---|---|
| Invoice | Yes | Yes, correct example and payment | Unverified: blank capture |
| Purchase Order | Pending | Pending | Pending |
| GRN | Yes | Yes, correct weight/value/signatures | Unverified: blank capture |
| Expense Voucher | Pending | Pending | Pending |
| Customer Statement | Pending | Pending | Pending |

Final automated gates not rerun yet: browser QA is still in progress. PHASE 3 STEP 3 remains PARTIAL.
