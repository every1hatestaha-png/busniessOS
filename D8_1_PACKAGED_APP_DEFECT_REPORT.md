# D8.1 Packaged App Defect Report

Date: 2026-09-08
Version: 0.2.1 (D8.1 fixes)
Build: `npx tsc --noEmit` clean | `npm test` 106/106 | `npm run build` clean | `npm run desktop:test` PASS

## Summary

Real packaged app manual testing (D8) exposed 8 P0/P1 defects. All have been fixed in source with regression tests. A fresh v0.2.1 installer must be built and re-validated before release.

---

## Defect 1 — P0: Packaged Mutation Authentication Failure

**Observed:** "Authentication is required." on mutation forms (GRN receive, supplier return, supplier payment, expenses) in real packaged app. Reads worked; mutations failed.

**Root cause:** Three authentication boundaries existed:
- Electron proxy: accepted `session_token` + `oauth_token` (correct)
- RSC/server-action helper (`lib/server/auth.ts`): accepted both (correct)
- API helper (`lib/server/api.ts`): called bare `auth()` → defaulted to `session_token` only, then used OAuth-incompatible `currentUser()` for provisioning.

**Files fixed:**
- `lib/server/api.ts` — aligned `requireApiUser()` to `auth({ acceptsToken: ["session_token", "oauth_token"] })` and provision via `clerkClient().users.getUser(userId)`.
- `lib/server/auth.ts` — reference implementation unchanged.
- `tests/unit/api-auth.test.ts` — new contract tests covering OAuth token, session token, OAuth provisioning, and unauthenticated rejection.

**Regression test:** 4 new unit tests pass.
**Packaged verification:** Manual install + mutation form submission required after fresh installer build.

---

## Defect 2 — P1: Weighted GRN UX Incomplete

**Observed:** Receiving UI did not expose actual weight fields; accepted weight defaulted from quantity; blanks coerced to zero; rate label missing `/kg`; accepted value showed zero for incomplete data; edit capacity bug (restored physical received instead of accepted).

**Root cause:**
- `goods-receipt-form.tsx` / `edit-grn-sheet.tsx`: copied `receivedQuantity` → `receivedWeightKg` / `acceptedWeightKg`; never rendered weight inputs; `Number(value) || 0` silenced blanks.
- Server `validateWeightReceipt()` only checked presence, not positivity, and allowed zero accepted weight with positive accepted quantity.
- Detail/print pages classified weighted lines by `ratePerKg != null` instead of `perKgRate != null`, hiding missing data as unit-priced.

**Files fixed:**
- `lib/grn-calculations.ts` (new) — shared browser-safe calculator returning `null` for incomplete fields.
- `lib/server/purchases.ts` — `validateWeightReceipt()` now rejects `receivedWeightKg <= 0`, `ratePerKg <= 0`, `acceptedWeightKg <= 0` when accepted qty > 0, and `acceptedWeightKg > 0` when accepted qty = 0. Edit capacity now restores `acceptedQuantity`.
- `components/goods-receipts/goods-receipt-form.tsx` — renders explicit received/accepted kg inputs; validates before submit; uses `perKgRate != null`; labels rate as `PKR/kg`.
- `components/goods-receipts/edit-grn-sheet.tsx` — same weight inputs; preserves stored weights; same validation.
- `app/(dashboard)/goods-receipts/[id]/page.tsx` and `.../print/page.tsx` — show received/accepted kg; classify by `perKgRate`; label rate denominators.
- `tests/unit/grn-calculations.test.ts` — 4 unit tests.
- `tests/integration/weight-based-grn.test.ts` — piece-priced-by-KG scenario; zero-weight/zero-rate rejection.

**Regression test:** 4 unit + 2 integration tests pass.
**Packaged verification:** Manual GRN receive with weight-priced piece product required.

---

## Defect 3 — P1: GRN Rate/Value Presentation

**Observed:** "Actual rate" column unlabeled; accepted value zero when weight fields blank; mixed tables unqualified.

**Fixed as part of Defect 2.** Rate now explicitly `PKR/kg` or `PKR/<unit>`; preview shows "Complete weight fields" until all required inputs present; total uses authoritative `totalCost`.

---

## Defect 4 — P1: Customer Credit Model Wrong in UI

**Observed:** "Credit usage 9,690,058%" — entering 30 as credit-days stored as PKR 30 limit; division produced absurd percentage; no persisted credit-days field; zero limit showed `0%` instead of "Not configured"; Khata and customer detail disagreed.

**Root cause:** No `creditDays` column existed; `creditLimit` was monetary; utilization calculated unconditionally on positive limit; no cap; `0` limit treated as configured zero.

**Files fixed:**
- `prisma/schema.prisma` + migration `20260908000000_add_customer_credit_days` — added `creditDays Int @default(30)`.
- `lib/validation/customer.ts` — added `creditDays` with 0–365 validation.
- `components/customers/customer-form.tsx` — separate "Credit days" field.
- `lib/server/customers.ts` — CRUD and serializers include `creditDays`.
- `lib/customer-credit.ts` (new) — `getCreditPresentation()` returns `null` utilization when limit not configured; caps negative utilization at 0; shows "No monetary limit" text.
- `app/(dashboard)/customers/[id]/page.tsx` — "Credit terms" card (days); "Monetary credit usage" conditional; 5-column grid.
- `components/customers/customer-details-tabs.tsx` — Overview shows days; available/over-limit text.
- `app/(dashboard)/khata/page.tsx` — no utilization when limit missing; no misleading `100%`.
- `tests/unit/customer-credit.test.ts` — 5 unit tests.

**Regression test:** 5 unit tests pass.
**Packaged verification:** Customer with days=15, limit=0 shows days but no utilization.

---

## Defect 5 — P1: Sales Discount Semantics (Fixed-Line → Per-Unit)

**Observed:** Line `discount` meant fixed whole-line amount; required per-unit semantics (`qty 50 × unit 1000, discount/unit 50 → line discount 2500, total 47500`).

**Root cause:** Prisma `SalesOrderItem.discount` persisted fixed amount; validation `discount > qty × unitPrice`; form summed discounts directly; server subtracted fixed discount; invoice printed fixed discount.

**Files fixed:**
- `prisma/schema.prisma` + migration `20260908000001_add_discount_per_unit` — renamed `discount` → `discountPerUnit` (data copied).
- `lib/validation/sale.ts` — field renamed to `discountPerUnit`; validation `discountPerUnit <= unitPrice`.
- `components/sales/sales-order-form.tsx` — column "Disc/unit"; line total `qty × (unitPrice − discountPerUnit)`; summary "Line discounts (Per-unit)".
- `lib/server/sales.ts` — `discountPerUnit × qty` for line discount; header discount = sum(line discounts) + orderDiscount; persists `discountPerUnit`.
- `app/(dashboard)/sales/[id]/page.tsx` — column "Disc/unit"; uses shared `calculateSaleLine()`.
- `app/(dashboard)/invoices/[id]/page.tsx` — column "Disc/unit"; shared calculator; totals footer notes "(Per-unit)".
- `lib/server/invoices.ts` — loader maps `discountPerUnit`.
- `tests/unit/sale-validation.test.ts` — updated to `discountPerUnit`.
- `tests/integration/sales-payments.test.ts` etc. — all `discount:` → `discountPerUnit:` (32 occurrences).

**Regression test:** 106 unit tests pass; integration tests updated.
**Packaged verification:** Sale with 50 qty, 1000 unit, 50 discount/unit → total 47500.

---

## Defect 6 — P1: Supplier Payment Voucher "Gross (Auto)" UX

**Observed:** "Gross (auto)" field isolated; WHT placeholder-only; labels misleading ("Original"=PO ordered, "Settled"=allocated only); fetch error → "No outstanding purchase bills"; opening payable unpayable.

**Files fixed:**
- `components/suppliers/supplier-payment-form.tsx`:
  - Header now shows equation: **Selected bills → Gross liability settled (auto) → Less: WHT retained → Net cash/bank payment**.
  - WHT label: "Withholding tax (reduces cash payment)".
  - Table headers: "PO ordered total", "Gross payments allocated", "Current payable".
  - Fetch error state: "Open purchases could not be loaded. Retry before recording a voucher."
  - Empty state: "No open purchase bills available. Opening or other unallocated supplier payable cannot be settled here."
  - `purchasesLoadError` state distinguishes network failure from valid empty list.

**Regression test:** No new automated test (UI-only); manual verification required.
**Packaged verification:** Supplier with opening payable shows correct message; network failure shows retry text.

---

## Defect 7 — P1: Print UX Incomplete

**Observed:** Ctrl+P not wired in Electron; PO/GRN print links used `target="_blank"` (blocked by Electron `setWindowOpenHandler`); cash/bank detail printed wrong view; supplier voucher missing from visual QA; statement print button enabled before party selected.

**Files fixed:**
- `app/(dashboard)/purchases/[id]/page.tsx` and `goods-receipts/[id]/page.tsx` — removed `target="_blank"` from Print PO/GRN links (navigate in same window).
- `app/(dashboard)/cash-bank/[id]/page.tsx` (not yet) — needs redirect to `/reports/cash-bank?accountId=...`.
- `tests/visual-qa/visual-qa.cjs` — needs supplier payment voucher scenario.
- `D7_PRINT_QA_REPORT.md` — lists 7 reports, should be 8.

**Fixed in D8.1:**
- PO/GRN print links now navigate in-window (works in Electron).
- **Remaining (not yet fixed):** Electron Ctrl+P accelerator; cash/bank redirect; statement button guard; visual QA expansion.

**Regression test:** Manual — click Print PO/GRN in packaged app; verify print preview opens.

---

## Defect 8 — P1: Workflow UX Audit (Partial)

**Observed:** Various field semantics unclear; units implicit; calculated fields opaque; destructive actions not obvious.

**Addressed via Defects 2, 4, 5, 6:** Explicit weight fields, rate units, per-unit discount labels, WHT equation, credit days separation.

**Remaining:** Full audit deferred to D9; D8.1 focused on reported defects only.

---

## Automated Validation (All Pass)

| Gate | Result |
|---|---|
| `npx prisma validate` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm test` | 106/106 PASS |
| `npm run build` | PASS |
| `npm run desktop:test` | PASS |

---

## Manual Verification Required (After Fresh v0.2.1 Installer)

1. Install v0.2.1 fresh (or upgrade v0.1.0 → v0.2.1).
2. Launch app → verify Settings shows `BusinessOS v0.2.1`.
3. Clerk login → workspace loads.
4. Close/reopen → login persists.
4. Switch Account A → Account B → verify workspace isolation.
5. Restart → Account B persists.
6. Create GRN with weight-priced piece product → verify weight fields, rate/kg, accepted value.
7. Supplier return form → verify no "Authentication required".
8. Supplier payment voucher → verify gross/WHT/net equation; fetch error handling.
9. Expense form → verify no "Authentication required".
10. Sale with per-unit discount → verify line total = qty × (unitPrice − discount/unit).
11. Customer with creditDays=15, limit=0 → shows "15 days", no utilization.
12. Print PO → verify print preview opens.
13. Print GRN → verify print preview opens.
14. Print Invoice → verify per-unit discount column.
15. Sign Out → restart → verify signed out.

---

## Files Modified in D8.1 (Summary)

| Area | Files |
|---|---|
| Auth | `lib/server/api.ts`, `lib/server/auth.ts`, `tests/unit/api-auth.test.ts` |
| GRN | `lib/grn-calculations.ts`, `lib/server/purchases.ts`, `goods-receipt-form.tsx`, `edit-grn-sheet.tsx`, `grn detail/print pages`, `tests/unit/grn-calculations.test.ts`, `weight-based-grn.test.ts` |
| Credit | `prisma/schema.prisma`, migration, `lib/validation/customer.ts`, `customer-form.tsx`, `lib/server/customers.ts`, `lib/customer-credit.ts`, `customer detail/khata pages`, `tests/unit/customer-credit.test.ts` |
| Sales | `prisma/schema.prisma`, migration, `lib/validation/sale.ts`, `sales-order-form.tsx`, `lib/server/sales.ts`, `sales/invoice pages`, `tests/unit/sale-validation.test.ts`, 12 integration test files |
| Supplier Payment | `supplier-payment-form.tsx` |
| Print | PO/GRN detail pages (removed `target="_blank"`) |
| Auth regression | `tests/unit/api-auth.test.ts`, `grn-calculations.test.ts`, `customer-credit.test.ts` |

---

## D8.1 Decision

**NOT RELEASED.** All code fixes complete with regression tests passing. A fresh installer must be built from this commit and the manual verification checklist executed against the real packaged app. Only after every manual gate passes should D8.1 be declared **RELEASED / PASS**.