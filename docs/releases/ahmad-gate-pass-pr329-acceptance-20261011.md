# PR #329 gate pass acceptance — 2026-10-11

Base inspected: `26be49a2d48e84f66ee59718d041e2cd10228a8a`, branch `feat/gate-pass-receiving-invoice-foundation`, draft PR #329, main `f369e3549a1ef6b2fbb00a58a1534bdfe35472da`.

## Source integration and restrictions

Applied the user-supplied `ahmad_gate_pass_workflow_pr329.zip` (SHA-256 `2eccf2429279d7616beb11221ca7b936b78b80f69ed4db7fd05d28e382223a75`) using its inspected integration script, first dry-run then apply on a clean checkout. The package is proposed source, not prior certification evidence. Corrected its duplicate queue link, stale draft-only wording and formatting noise. Reused repository document sequences, audit, serializable retry, warehouse stock, permission/subscription, invoice snapshot/version and balanced-GL adapters; no standalone architecture or changes to original invoice-first sales.

The package fixes the allowed workspace UUID to **4bc313cf-2869-4d87-8f1e-22a147f18d2d**. Both the exact environment selector and default-OFF feature flag must match. This identifier comes from the supplied package; no production customer/workspace data was queried to independently identify Ahmad. Confirm the owner/package mapping before any hosted enablement.

Every new page/action and every lifecycle DB service gates the workspace. Mutation transactions lock and verify actual membership role and entitlement, including replay paths; stale supplied OWNER context cannot bypass downgrade/removal. Additive DB checks/triggers reject any other GP tenant, foreign customer/product/warehouse, foreign invoice/sale links and parent tenant/customer moves. Referenced financial documents are one-to-one with the GP. Other workspaces' original invoice-derived gate passes remain unchanged.

## Lifecycle and finance

- Independent draft/GP number and issuance have no stock, customer receivable, sale or invoice effects. Issued GP print route rejects drafts/cancelled documents and shows quantities/signature blocks without an invoice number.
- Dispatch locks the GP and decrements core and managed warehouse stock exactly once; managed-mode changes and insufficient stock roll back. Capture cost at dispatch, not stale issue time. Customer BOM items remain blocked until their own adapter is certified.
- Cumulative receiving requires all matching lines and recipient/reference evidence; no decreasing quantities, over-receipt or reopening a completed receipt. Pending invoice UI includes accepted/full-reconciled cases only.
- Only actual returned rejected quantity restores stock. Duplicate return is a no-op, including its audit; audit metadata includes cumulative item quantities. Returns beyond rejection fail.
- Accepted-only invoicing atomically creates one sale, one invoice/version, one customer ledger debit/balance update and balanced revenue/tax/COGS entries. No second stock deduction. Replayed requests return the same invoice; changed replay pricing/tax is rejected. Customer credit checks survive concurrent invoices.
- Owned on-hand stock plus unrecognized transit valuation reconciles to inventory GL; debit equals credit across the synthetic tenant.

## Legal and FBR fail-closed gates

No production flags or provider settings were changed. Dispatch and accepted invoicing require BOTH `OUTBOUND_GP_ACCEPTANCE_BILLING_LEGALLY_APPROVED=true` and a nonempty `OUTBOUND_GP_ACCEPTANCE_BILLING_APPROVAL_REFERENCE`. These settings must represent verified transaction-specific professional approval, not a preference for delayed invoices. They remain unset/disabled in real environments.

FBR-enabled tenants are additionally rejected before deferred dispatch/invoicing, until a separately certified timely fiscal-invoice adapter exists. There are no remote FBR calls in this adapter. Existing production FBR compliance restrictions remain unchanged. Local tests simulate approval solely after checking a disposable loopback database; **SYNTHETIC-LOCAL-ONLY is not legal approval**.

## Executed local evidence

Disposable PostgreSQL **18.4**, exclusively `127.0.0.1:55461`. Created a new private cluster and fresh `munshios_gatepass_verified` database after tightening the uncommitted tenant migration. Earlier scratch DBs were not reset or their ledgers altered. No hosted migrations, credentials or customer data. Final chain: **132 migrations**, each once, SHA-256 matches repository bytes, no pending/failed/rolled-back records. Independent read-only attestation: 75 public tables, column fingerprint `d95b6546f40ec0208e9a88f49974a2c78104685b114ba2b5312eec3dc1a7c1cb`; GL debit/credit both **77,650.00**, zero duplicate invoices and zero customer balance/ledger mismatches. Synthetic counts: 18 GPs, 4 invoices, 9 dispatch inventory records, 3 physical return records.

- **17 real PostgreSQL acceptance tests PASS**: checksum attestation; independent/idempotent draft and issue; parallel dispatch/invoice/return; partial receiving; full rejection; insufficient-stock/credit rollback; stale roles/membership/entitlement; foreign tenants and direct DB parent moves; concurrent parent workspace mutation; legal/FBR denial; cancellation; actual print/pending-invoice rendering; competing last-stock dispatches; managed warehouse/core stock; BOM refusal; inventory/transit/GL reconciliation; concurrent customer-credit invoices. Tenant validation uses SHARE locks, which block non-key workspace/customer updates; KEY SHARE would not protect that race. The explicit lock-timeout regression verifies this exclusion before checking the committed parent guard.
- **69 focused tests PASS in 8 files**, including the 17 DB tests, direct-action guards, policy/schema/tenant regressions and FBR tests.
- **629 application unit tests PASS in 105 files**.
- **49 finance tests PASS in 7 files** using the disposable cluster.
- Prisma validate/generate, TypeScript, scoped ESLint and production webpack build: PASS.
- Isolated Restaurant browser/80mm software harness: **PASS**, 0 browser errors, one POS double-submit request, pending-cart lock and successful cart clear, receipt/KOT widths 272.125px without overflow; PDFs receipt4 / KOT2 / cancelled4 / refund4 pages. This is synthetic transport/UI evidence, not live provider login or physical printer acceptance.
- Dependency audit: production graph zero vulnerabilities. Full graph retains 17 known dev-only transitive vulnerabilities associated with braces, Electron cache tooling and sprintf-js. Reused already-reviewed #313/#314 exact dependency overrides and their narrow advisory containment; unexpected advisories or dev-to-production escapes still fail. No blanket ignores or weakened application security assertions.

Initial test attempts: FBR unit setup initially lacked DATABASE_URL (rerun on disposable target passed); one repeat-run warehouse fixture collided with the unique default-warehouse constraint (fixture made repeatable); build caught a missing role in test context (corrected). No assertions or database protections removed.

## Restaurant CI diagnosis

Prior run `38150087455`: browser timeout waited for obsolete “Confirm & send to kitchen” and old empty-cart text; full audit stopped at an unrecognized MCP SDK advisory. Reused #313/#314 browser label fixes and patched dependency lock/explicit dev-only advisory containment. Kept original double-submit, UUID, cart clearing, thermal sizing, runtime-error and audit graph assertions. Candidate CI results belong to the exact pushed head and are recorded in the PR, never inferred from old green runs.

## Remaining hosted release blockers

Keep PR draft. Vercel automatic deployment for this branch is disabled in source before push. No merge/deployment, hosted migration, DNS/provider configuration or production record changes.

Before hosted enablement: review source/migrations; confirm the package workspace UUID; obtain verified transaction-specific tax/legal approval and reference; establish whether FBR fiscal timing applies and certify the required adapter if so; approve isolated staging migration/deployment separately; perform actual authenticated desktop/mobile acceptance and physical printer/signature acceptance. General release/security stack convergence remains separate from this PR, which is based on main. Do not assert this optional workflow is available to Ahmad in production.
