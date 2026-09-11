# MunshiOS Phase 4 — Production Hardening Report

**Status:** IN PROGRESS — source/build hardening active; full local integration gates and live browser reconciliation still pending.

**Starting point:** Astra handoff `PHASE4_ASTRA_HANDOFF.md`, which explicitly states the repository was still at the tail of Phase 3 Step 3 Batch C. This report records the engineering continuation performed after that checkpoint and must not be read as a controlled-beta approval.

## 1. Executive Summary

The continuation focused on financial lifecycle safety rather than cosmetic expansion. The main gap found after Astra's handoff was that several posted financial documents were readable/printable but did not expose a safe reversal lifecycle. New reversal services now preserve original financial history, enforce workspace and permission scope, post dated GL reversals, restore operational balances, write audit records, and make repeated reversal requests idempotent at the service level.

No database migration was introduced in this continuation. Existing `GeneralLedgerEntry.reversalOfId` links, `Payment.reversalOfId`, `Payment.isReversed`, existing document statuses, and audit records were reused wherever possible.

### Current recommendation

**NOT READY FOR CONTROLLED BETA YET.**

Reason: source/type/build validation is strong and the high-risk lifecycle gaps below are now materially improved, but the full Vitest suite has not yet been executed after these additions, Astra's exact live customer-statement reconciliation remains unverified, and final human pixel-level print review remains pending.

## 2. Preserved Business Invariants

The continuation intentionally preserved the existing critical invariants:

- Sales discount is per unit. Example: 50 × Rs 1,000 with Rs 50 discount/unit = Rs 47,500.
- Weighted GRN valuation remains accepted weight × rate/kg. Example: 220.5 kg × Rs 282 = Rs 62,181.
- Customer `creditDays` and monetary `creditLimit` remain separate concepts.
- Supplier payment remains Gross payable settled − WHT = Net cash/bank payment.
- Web/desktop dual-token authentication and workspace-scoped authorization remain unchanged.
- Posted financial history is reversed/voided/cancelled rather than hard-deleted.
- Dedicated printable documents remain the print source of truth.
- User-facing branding remains MunshiOS.
- Invoice line pricing continues to use `discountPerUnit`.

## 3. Phase 3 Carry-over Fixes Closed

### Clerk branding

The Clerk provider now supplies explicit MunshiOS localization for sign-in/sign-up headings, preventing the old `busniessOS` application name from leaking into user-facing authentication copy.

### Validation copy

Customer and product validation schemas now provide business-readable validation messages instead of raw/default Zod minimum-length text.

### Base UI PageHeader warning

The shared page-header action correctly marks the rendered Next.js `Link` as non-native-button behavior, removing the Base UI semantic mismatch Astra observed.

### Customer statement source review

`getCustomerStatement` remains workspace scoped and uses the correct receivable convention:

`opening balance = debit − credit`

then each entry applies:

`running balance = previous + debit − credit`

Existing report integration coverage verifies customer/supplier opening and running balances. The exact live Astra QA scenario still requires browser/database confirmation.

## 4. New Financial Lifecycle Hardening

### 4.1 Customer Payment Reversal

Added a safe standalone customer-receipt reversal path.

**Service:** `lib/server/payments.ts#reverseCustomerPayment`

Behavior:

- Requires `financial.manage`.
- Every lookup/update is scoped to the authenticated workspace.
- Requires a human reversal reason.
- Rejects reversal-of-reversal.
- Repeating a successfully completed reversal returns the existing reversal instead of applying financial effects twice.
- Preserves the original payment and creates a linked reversal payment.
- Restores customer receivable.
- Restores invoice paid amount/status and linked sales-order paid/balance values.
- Removes the original receipt's cash/bank effect.
- Adds a customer-ledger `REVERSAL` entry.
- Uses the existing GL reversal helper to create linked, balanced general-ledger reversal rows.
- Writes `customer.payment_reversed` to the audit trail.

**Safety rule:** a payment captured atomically during sale creation cannot be reversed through this endpoint, because its GL receipt source is the sale. It must use sale cancellation so stock, revenue, invoice, receivable, and cash reverse together.

**API:** `POST /api/v1/payments/:id/reverse`

**UI:** original customer receipts expose `Reverse payment`; reversal documents are now presented as **Customer payment reversal** with **Amount reversed**, not as a new incoming receipt.

**Regression test added:** `tests/integration/payment-reversal.test.ts`

### 4.2 Supplier Payment Reversal

Added a safe supplier-payment reversal including withholding tax.

**Service:** `lib/server/supplier-payment-reversals.ts`

Behavior:

- Requires `financial.manage` and workspace scope.
- Preserves original voucher and creates a linked reversal payment voucher.
- Restores supplier payable by the gross settled amount.
- Restores purchase-order allocation balances.
- Restores only the **net** amount to cash/bank.
- Reverses AP, WHT payable, and cash GL effects using linked GL reversals.
- Adds supplier-ledger `REVERSAL` credit.
- Repeated reversal is idempotent.
- Writes `supplier.payment_reversed` audit event.

**API:** `POST /api/v1/supplier-payments/:id/reverse`

**UI:** reversal vouchers are labelled **Bank Payment Reversal Voucher** and use restoration wording: gross payable restored, WHT reversed, net cash restored.

**Regression test added:** `tests/integration/supplier-payment-reversal.test.ts`

### 4.3 Supplier Return Cancellation / Reversal

Astra's handoff described supplier returns as reversible, but no actual posted-return reversal service was found. A real financial cancellation path was added.

**Service:** `lib/server/supplier-return-reversals.ts#cancelSupplierReturn`

Behavior:

- Requires `financial.manage` and workspace scope.
- Only posted supplier returns can be cancelled.
- Repeating cancellation is idempotent.
- Original supplier-return row and debit-note history are retained.
- Restores returned stock.
- Restores the exact carrying value removed by the original return into the current weighted-average inventory value.
- Uses optimistic stock matching to avoid silently overwriting concurrent inventory changes.
- Records an `ADJUSTMENT` inventory movement with explicit `REV-<return number>` reference because the current inventory enum has no generic REVERSAL type.
- Restores supplier payable.
- Restores PO outstanding balance unless the PO itself is cancelled.
- Adds supplier-ledger `REVERSAL` credit.
- Reverses original supplier-return GL rows.
- Marks the supplier return `CANCELLED` and retains the cancellation reason.
- Writes `supplier_return.cancelled` audit event.

**API:** `POST /api/v1/supplier-returns/:id/cancel`

**UI:** posted returns expose `Cancel return`; cancelled documents visibly identify that their financial effects were reversed.

**Regression test added:** `tests/integration/supplier-return-cancellation.test.ts`

A type-check defect in the first test draft used invalid PO status `COMPLETED`; production build caught it. It was corrected to the actual enum value `RECEIVED`.

### 4.4 Expense Reversal

Added posted-expense reversal without adding a new Expense status migration.

**Service:** `lib/server/expense-reversals.ts`

Reversal state is derived from immutable GL `reversalOfId` links to the original expense GL rows.

Behavior:

- Requires `financial.manage` and workspace scope.
- Preserves the original Expense row and voucher.
- Requires a reason.
- Detects/rejects missing unsafe accounting state.
- Creates linked, balanced GL reversal rows.
- Restores the expense amount to its original active cash/bank account.
- Repeated reversal does not restore cash twice.
- Writes `expense.reversed` audit event.

**API:** `POST /api/v1/accounting/expenses/:id/reverse`

**UI:** expense vouchers expose `Reverse expense`; reversed vouchers show status, reversal number/date/reason while retaining the original expense details.

**Regression test added:** `tests/integration/expense-reversal.test.ts`

The test also checks P&L reconciliation: operating expenses are Rs 25 before reversal and return to Rs 0 for the test workspace/period after the reversal.

## 5. Workspace Isolation

Added `tests/integration/reversal-workspace-isolation.test.ts` covering the new high-risk mutation services.

Cross-workspace attempts are expected to receive domain-level not-found failures before any mutation for:

- customer payment reversal,
- supplier payment reversal,
- supplier return cancellation,
- expense reversal.

The test also confirms the target record remains unchanged after each cross-workspace attempt.

## 6. Idempotency and Concurrency Review

The repository already contains a finance-grade concurrency/idempotency suite covering:

- same-key PO double submit,
- GRN same-key repeat,
- sale double-click same-key behavior,
- competing sales for the same final stock where only one may succeed,
- GL balance after the stock race.

The newly added reversal services also return an already-reversed/already-cancelled result when the same posted document is reversed again, preventing double financial effects.

### Existing semantic inconsistency to revisit

The finance-grade test named **"Same idempotency key with different params is rejected"** currently asserts that a repeated PO with different input simply returns the first PO. The behavior is idempotent but the test name/documented expectation disagrees with the assertion. This is not changed in this checkpoint because changing conflict semantics across established financial endpoints requires a coordinated contract decision and regression pass.

## 7. Build / Validation Evidence

### Vercel production build

A production Next.js/Vercel deployment for commit `0c2a77bb10ab25e352a83a6c78add06ad52372fe` reached **READY** after the supplier-return test enum fix. This validates production build/type-check compatibility for all source changes up to that commit, including the new reversal services/UI and expense code then present.

Subsequent Vercel deployments for:

- customer reversal-document wording,
- supplier reversal-document wording,
- expense reversal P&L test,

also entered production build validation; the preceding source commits have produced READY deployments where noted in Vercel.

### Important limitation

A Vercel READY deployment proves production build/type-check success. It does **not** prove that `npm test` executed. The new Vitest integration tests still require the full local test suite before controlled-beta approval.

## 8. Database / Migration Status

**No migrations added.**

The hardening work deliberately reused existing status fields, payment reversal links, GL reversal links, inventory movements, and audit logging rather than introducing schema churn during an unfinished QA phase.

## 9. Documentation

`docs/api-v1.md` now documents:

- customer payment reversal,
- supplier payment reversal,
- supplier-return cancellation,
- expense reversal,
- history-preserving financial lifecycle behavior.

## 10. Outstanding Validation / Blockers

The following remain mandatory before controlled beta:

1. Run full local gates after the latest commit:
   - `npx prisma validate`
   - `npx tsc --noEmit`
   - `npm test`
   - `npm run build:web`
   - `npm run desktop:test`
   - configured lint/ESLint command
2. Execute Astra Flow 5 against the live authenticated QA workspace:
   - QA Customer 20260911
   - opening Rs 0
   - debit Rs 47,500
   - credit Rs 10,000
   - closing Rs 37,500
3. Reconcile Astra end state across UI/report surfaces:
   - receivable Rs 37,500
   - payable Rs 0
   - cash Rs 99,900
4. Browser-exercise the new reversal controls against QA-only records and confirm single financial effects under rapid retry/double click.
5. Human/pixel-level print review of invoice, PO, GRN, expense, customer statement, plus the newly introduced reversal document states.
6. Narrow-width sanity pass (~768px and ~390px) on critical forms/reports.
7. Decide and document whether conflicting payloads sharing one idempotency key should return the original request or raise a conflict consistently across all finance mutations.

## 11. Current Engineering Assessment

The highest-risk gap found in this continuation was not basic CRUD; it was the lack of a consistent reversal lifecycle for already-posted money/inventory records. Customer receipts, supplier payments, supplier returns, and operating expenses now have materially safer history-preserving reversal paths with accounting, operational balance, workspace, and audit handling.

Remaining risk is primarily **verification risk**, not a known P0 data-loss/authentication defect. Nevertheless, a finance product must not be promoted to controlled beta until the new integration tests actually run against the configured test database and the live QA reconciliation is completed.

**Decision: NOT READY FOR CONTROLLED BETA — validation incomplete.**
