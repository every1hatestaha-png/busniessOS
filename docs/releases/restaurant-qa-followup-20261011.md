# Restaurant QA follow-up — 2026-10-11

## Scope and evidence

Read-only production reconciliation of the owner's explicitly confirmed synthetic `crust` workspace only. No order, payment, refund, stock, migration, configuration or deployment mutations were performed. Queries use the five known UUIDs and their linked records; no unrelated customer records were read.

Production was READY on main `f369e3549a1ef6b2fbb00a58a1534bdfe35472da` (Vercel `dpl_HmEDA71TkfvQBLVhYi47Tio9kfze`). Neon metadata matched project `gentle-hall-80438999`, production branch `br-hidden-tree-b3ecieqd`, `neondb`, endpoint `ep-plain-smoke-b35qxc96.c-4.ap-southeast-1.aws.neon.tech`. No connection credential was requested or saved.

The SELECT-only statement and sanitized result are adjacent `.sql` and `.json` files. Capture time: **2026-10-11 11:54:05 UTC**. Initial reconciliation SELECT failed on a text/UUID comparison; explicit text casts corrected that read-only query. No SQL write or retry of a mutation occurred.

| Order | Total Rs | Order state | Kitchen state | Payments/refunds | Consumption/GL |
|---|---:|---|---|---|---|
| R-000001 | 400 | READY | READY | 0 / 0 | 0 / 0 |
| R-000002 | 350 | CONFIRMED | QUEUED | 0 / 0 | 0 / 0 |
| R-000003 | 550 | PREPARING | PREPARING | 0 / 0 | 0 / 0 |
| R-000004 | 700 | CONFIRMED | QUEUED | 0 / 0 | 0 / 0 |
| R-000005 | 205 | CONFIRMED | QUEUED | 0 / 0 | 0 / 0 |

All UNPAID, outstanding **Rs 2,205**. R-000005 reconciles 200 - 10 + 15 = 205. All line quantities/prices reconcile to stored subtotals. No inventory/accounting posting timestamps or related ledger entries; linked ledger debit/credit both zero. Product stock remains **100**, with exactly one OPENING_STOCK +100 at cost 20 and zero order stock movements. Both synthetic tables remain OCCUPIED. Related kitchen/table workspace IDs match; no foreign payment/refund/ledger rows found. This is consistency evidence for uncompleted orders, not proof that finalization or paid flows work. The earlier staging R-000001 worth Rs 1,211.50 is a different order and is outside this reconciliation.

## Changes and inherited fixes

Base: draft #321, `fix/sterile-runner-diagnostics-20261010`, `8e51c28d9b53c8e58b4988aa40c2cfd6256da0a7`.

- Kitchen quantities/names/modifiers/notes and accessible remove/decrease/increase cart names already exist in the base stack. They were absent in the deployed main UI. Reuse them unchanged; add rendered regression tests, per-card separation, escaping, pending-control disabling and Kitchen STAFF restrictions.
- Add an announced final payable estimate, live discount/tax inputs, successful-order override reset and invalid-estimate feedback. Mirror existing server line/subtotal/final rounding. STAFF has no override inputs and override values never affect its preview. Keep server prices, validation, persisted authorization, item-only payload, workspace guard and request idempotency unchanged.
- Automatic Vercel deployment is disabled for this branch. No migration/schema/server financial changes.

## Validation

- **40/40 tests PASS in 9 focused files**, including 15 new QA regressions, existing dish loading/queue, financial override, persisted station and payment contracts.
- TypeScript `tsc --noEmit`: PASS. Scoped ESLint on the changed component/helper/two test files: PASS.
- Initial Windows sandbox test launch failed with temporary-cache EPERM before executing cases; rerun outside the sandbox succeeded. One new disabled-button assertion initially assumed attribute order; it now verifies the matched button's actual disabled attribute, without weakening the requirement.
- Optional finance-grade invocation: **7 suite setup failures, 49 skipped, zero executed** because no DATABASE_URL exists in the isolated worktree. No hosted DB substituted. This is an environment blocker, not a financial PASS or reproduced application defect. The unchanged base has prior 49-case disposable-DB CI evidence, not fresh candidate evidence.
- Added exact-head focused CI with locked dependencies, generation only, TypeScript, scoped lint and deployment-disabled assertion. No database service, hosted secrets, migrations or deployment steps.
- Production build and new browser/mobile acceptance not rerun in this focused task. No inbox or physical-printer acceptance claimed.

## Remaining release blockers

Financial acceptance: cash/bank settlement, duplicate payment/retry, completion/stock/GL posting, cash shifts, cancellation, refunds/void and reversal reconciliation need isolated disposable/staging fixtures and authorized execution. No new production financial operations are authorized here.

Concurrency acceptance: parallel order creation previously produced independent orders, but payment/payment, payment/completion, completion/cancel, same-table, last-stock, refund/void and stale-workspace races still lack live candidate evidence.

Role/tenant acceptance: local mocked station regressions pass; live Cashier/Kitchen/Manager, persisted role downgrade, membership removal/session revocation and foreign-tenant order/payment/print checks remain unexecuted. Existing Owner workspace-print rejection is limited evidence, not the complete matrix.

Deployment readiness: **CONDITIONAL / DRAFT ONLY**. Review the complete stacked dependencies, obtain separate deployment approval, deploy to isolated nonproduction and verify kitchen quantities, keyboard/screen-reader cart operation, mobile layout and the 205 payable preview. Physical 80mm printer, managed restore and provider/email acceptance require separate evidence. No merge or deploy was performed.
