# Restaurant release runbook V1.88

Status: draft release procedure only. This audit does not authorise merge, deployment, production migrations or live provider connections.

## Evidence and limits

Base: `c887266ae0f4b70023afd15d00b3579b67994306`, PR #266. Changes: stacked draft PR #269.

The V1.87 synthetic PostgreSQL 16 query-plan job used 20,000 orders and 10,000 payments. Single-run execution times: latest 200 orders 6.553 ms, latest 500 payments 2.709 ms, workspace payment summary 28.578 ms. The summary returns all 20,000 order rows. It is unbounded with workspace history. Payments shown by the Orders page come from a workspace-wide 500-row window, so older individual payment history can be absent from that panel. The new per-order print route reads complete per-order payment/return/refund evidence. These measurements do not certify concurrent production load, the POS catalogue, dashboard or reconciliation workloads. No speculative index was added.

The V1.88 load probe expands this workspace to 500 menu items, 200 tables, 2,000 kitchen orders/tickets and service-created return, refund and cash-shift evidence. It measures menu/category/table reads, the filtered oldest-first kitchen queue, dashboard aggregates, cash reconciliation and return/refund history in addition to order/payment queries. Financial history is deliberately small; it does not establish reconciliation or compensation latency at a large historical ledger size. The expanded probe passed at `a0a3ccfdb0041b9b971ffa2037bc1fe995200dbf`: 22,003 orders, 10,003 payments, 500 menu items, 200 tables, 2,003 KOTs, one return, one refund and one closed cash shift. Single-run execution times: kitchen queue 0.678 ms, menu 1.572 ms, latest orders 5.540 ms, latest payments 2.003 ms, dashboard 14.610 ms, payment summary 23.416 ms. Cash reconciliation 0.064 ms and return/refund reads 0.013/0.019 ms use small financial histories. The summary still returns 22,003 rows. Exact-head CI logs contain fixture counts, execution times and plan nodes.

The queue audit reproduced a correctness defect: 200 newer closed orders could hide an older ready order. Orders, Kitchen and WhatsApp now filter before limiting and show the oldest active requests first. A capped active queue has an explicit notice. Completed receivables also have a separate oldest-first collection queue using the existing database net-outstanding calculation, so newer closed history cannot hide unpaid balances. Settled and fully returned orders leave that queue. History ordering remains newest first.

Print output uses stored order-item names/prices, a repeatable-read financial snapshot and workspace timezone. Table names and workspace branding are current labels, not historical immutable labels. Receipt and KOT use the existing thermal widths and printer controls, plus a Restaurant-only named page with valid 80mm by 297mm dimensions. The inherited `80mm auto` page-size declaration was discarded by Chromium and shrank the first PDF output. The Restaurant rule fixes that scope without changing generic print behaviour. Long tickets paginate; feed length, cutter and driver configuration require hardware validation. Browser PDF evidence validates a rendered document, not a physical printer, cutter, driver or paper feed.

The isolated browser harness exercises the real React mutation form, error component and print body. All Restaurant stateful forms share the synchronous submission guard. POS locks cart changes while submitting and clears the successful basket before another order can be sent. The browser harness reproduces the prior pending-only stateful double submission and checks the real POS component with synthetic action transport. It covers same-tick double submission, slow pending controls, inline failure, successful resubmission, refresh during mutation, refresh after success, back navigation and error reset. Customer and KOT PDFs are retained as synthetic CI artifacts for visual inspection. It does not authenticate with Supabase/Clerk or execute Next server actions against a live provider. Provider-backed refresh/back navigation, session expiry, membership revocation and multiple-tab operational acceptance remain staging tasks. Auth redirects, stale workspace and unexpected programming errors also have action-level regressions.

## Dependency classification

| Dependency | Classification | Evidence and required release action |
| --- | --- | --- |
| Restaurant POS and financial services | CODE READY, subject to green exact-head certification | Synthetic acceptance and existing integrity gates. |
| WhatsApp Business webhook/provider | NOT IMPLEMENTED | Internal ingestion and pending-review UI exist. No WhatsApp provider webhook route found under `app/api`. Disable intake claims until signed provider delivery, deduplication and tenant routing are implemented and tested. |
| FBR credentials and legal/provider approval | CONFIGURATION REQUIRED / EXTERNAL APPROVAL REQUIRED | Existing generic FBR adapter and readiness/print compliance guards. No live credentials or authority approval inspected. Restaurant receipts are operational receipts and are not certified FBR invoices. Do not use them as a substitute for fiscal output. |
| 80mm customer printer | HARDWARE VALIDATION REQUIRED | Validate paper width, wrapping, logo, payments, totals, cancellation, reprint and paper feed on the intended hardware. |
| KOT printer | HARDWARE VALIDATION REQUIRED | Validate notes/modifiers, quantities, cancellation visibility, routing and reprint handling on the intended hardware. No automatic printer transport added. |
| Restaurant email/SMS notifications | NOT IMPLEMENTED | No Restaurant-specific delivery dependency found. Not required for a POS-only release. |
| Supabase Auth | CODE READY / CONFIGURATION REQUIRED | Existing customer identity/session code preserved. Validate staging login, expiry, membership changes and workspace switching with approved nonproduction configuration. |
| Legacy Clerk | CONFIGURATION REQUIRED | Production build wrapper still requires live-format Clerk keys for legacy desktop/platform auth. No live keys inspected. |
| Neon database | CONFIGURATION REQUIRED | Host/name classification guards exist. Actual production database, backup availability and production historical rows uninspected. |
| Vercel environment | CONFIGURATION REQUIRED | Audit branch deployment disabled. Production auth checks exist. Live project settings and deployment ordering uninspected. |

## Actual release flow review

`.github/workflows/main_munshios.yml` is unchanged. Pushes to main run synthetic gates. `workflow_dispatch` runs the guarded production migration job after gates, converts a recognised Neon pooler hostname to its direct endpoint, retries advisory-lock failures, checks migration status, then polls a fixed Vercel readiness URL for the requested revision. The workflow does not create a backup or explicitly deploy/promote the web application. The readiness URL is an existing Vercel hostname, not evidence that the intended customer domain was tested.

Production web deployment can happen independently through Vercel. Therefore, this workflow alone does not enforce migrations-before-web promotion. An authorised operator must freeze automatic promotion or use an approved controlled deployment mechanism before applying schema changes. Confirm actual live project behaviour without changing settings during this audit.

`RUN_PRISMA_MIGRATIONS_ON_BUILD` defaults to off. Keep it off for release builds. The opt-in production path now also invokes the approved database target guard before Prisma. It is not a replacement for the explicit backup, preflight and migration procedure.

Database readiness compares expected migration names with successful `_prisma_migrations` rows and checks approved production target classification. It does not validate all business invariants, provider auth, historical data or printer hardware.

## Required authorised release order

1. Freeze the reviewed release SHA after all exact-head UTC/Karachi, migration, finance, browser, lint and build gates pass. Review every stacked draft before authorising merges.
2. Complete provider-backed staging operational acceptance. Record each scenario's order, table, cash/bank, cash shift, inventory, balanced GL, return/refund and audit outcomes.
3. Confirm scope: POS-only or provider/fiscal integration. Keep unimplemented/unapproved dependencies outside the promised launch scope.
4. Freeze production writes or schedule a maintenance window appropriate to the migrations. Confirm Vercel cannot promote the new code before migrations finish.
5. Take a database backup/snapshot and record its restore procedure and restore point. Verify that an isolated restore works before relying on it.
6. Verify the exact production host fingerprint and approved database name, both before and after conversion to a direct endpoint. Confirm release SHA, migration order and Prisma migration status. Do not log credential-bearing URLs.
7. Run an approved read-only historical-data preflight. Identify unattributed legacy cash receipts, old table releases and finance/inventory inconsistencies. Do not rewrite immutable history to satisfy guards.
8. Run `prisma migrate deploy` once through the authorised target-guarded release path. Keep `RUN_PRISMA_MIGRATIONS_ON_BUILD=0`. Do not run concurrent migration workers.
9. Verify all migrations finished and none remain pending. Inspect failure/rolled-back migration rows. Run approved post-migration invariant checks and database readiness.
10. Deploy/promote the frozen web revision explicitly. Verify readiness revision, customer domain and intended environment. A local `build:web` result is compilation evidence only.
11. Run authenticated operational smoke: dine-in paid settlement and table release, takeaway completion, cash shift/payment/refund/close reconciliation, bank payment without cash shift, returns/reversals, insufficient-stock failure, duplicate request and cross-workspace rejection. Reconcile all financial, stock and audit effects after each scenario.
12. Validate physical customer/KOT prints. Monitor errors, latency, retry exhaustion, cash variance and provider queues during a controlled rollout.

## Failure and recovery

Stop promotion and new writes when a migration fails. Preserve the migration error and current release revision without exposing credentials. Inspect `_prisma_migrations` and the failed SQL in an isolated restored database. Never mark a migration applied/rolled back merely to bypass it. Use `prisma migrate resolve` only after an authorised operator verifies the actual schema state and rehearses the corrective procedure.

Prefer a reviewed forward fix for additive schema failures. Application rollback is permitted only when the previous revision is compatible with the already-migrated schema. Do not reverse immutable financial evidence with ad hoc SQL. A database restore requires an explicit outage and reconciliation decision because it can discard post-backup transactions.

## Exact next release step

Complete exact-head draft certification and provider-backed staging acceptance. Obtain explicit release authorisation only after the reviewed evidence, dependency scope, backup and migration/promotion sequence are concrete. This document does not authorise execution against production.
