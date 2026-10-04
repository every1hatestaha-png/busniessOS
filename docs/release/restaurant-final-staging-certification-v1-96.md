# Restaurant V1.96 final staging certification

Status: **IN PROGRESS — nonproduction only**

## Frozen application candidate

- V1.95 application SHA: `de8d4986e4b5a8ab8e38b92d6ee723eedd651a7e`
- Staging deployment: `dpl_7bD9YJppfUFaF68h8G6adLKrTw29`
- Staging URL: `https://munshios-restaurant-staging-adowfiz8s-khzr.vercel.app`
- Observed readiness after recovery rehearsal cleanup: HTTP 200, database ready, revision `de8d4986e4b5`
- Observed health: HTTP 200
- V1.96 changes are certification/docs/CI only. Vercel deployment is disabled for this branch.

## F06

Recovered operator acceptance evidence identifies F06 as the guarded legacy-KOT cancellation path: a queued KOT must be cancellable without inventory posting or duplicate side effects.

Observed staging evidence retained in Neon:

- ticket `TEST-F06-001`
- final status `CANCELLED`
- no Restaurant order or legacy sales-order parent attached
- one audit event: `restaurant.legacy_kot.status_changed`
- zero `inventory_transactions` in the create-to-cancel window
- zero `restaurant_inventory_consumptions` in the create-to-cancel window

**F06: PASS (staging evidence).**

## F07

Current operator definition is the multi-tab payment/completion race on one Restaurant order.

Acceptance requires:

- overlapping authenticated actions against the same order
- exactly-once terminal financial/operational effect
- no duplicate payment/posting/inventory effect
- balanced GL
- safe loser/replay behavior

Synthetic PostgreSQL regression exists in the V1.88 acceptance/race suite. V1.96 reruns this and the related payment/refund/return/table/stock contention suites on PostgreSQL 18.

Live two-tab staging execution still requires an authenticated staging operator session.

**F07: PENDING LIVE OPERATOR ACCEPTANCE until that authenticated race is executed.**

## Managed Neon recovery rehearsal

Nonproduction managed restore was executed on project `wandering-moon-51932710`.

- source staging branch: `br-delicate-credit-b5lttgnc`
- snapshot: `snap-dry-haze-b5kclsvo`
- restored proof branch: `br-spring-shadow-b5e4y2xc`
- snapshot restore finalized successfully
- restored branch retained as `restaurant-v195-restored-proof-20261004`
- original staging branch was restored as the default/primary branch after the rehearsal
- staging compute and Vercel DATABASE_URL were pinned back to the original staging branch
- readiness was rechecked after cleanup and remained database-ready on V1.95

Original and restored branches matched exactly for row count and deterministic content hashes across:

- audit logs
- cash shifts
- general ledger entries
- inventory transactions
- kitchen tickets
- Restaurant inventory consumptions
- Restaurant order items/orders
- payments/refunds
- return movements/items/payment allocations/returns
- tables
- WhatsApp message records
- warehouse stocks
- workspace memberships

Migration ledger on both branches:

- 128 migrations
- 0 unfinished
- identical migration digest

**Managed Neon restore rehearsal: PASS.**

## Staging database reconciliation

Read-only reconciliation was executed on the original staging branch after restore cleanup.

Zero violations were observed for:

- orphan Restaurant order items
- orphan payments
- orphan refund order/payment references
- orphan returns and return items
- orphan return payment allocations
- orphan return inventory movements
- orphan Restaurant inventory consumptions
- orphan Restaurant-linked KOTs
- cross-workspace payment/order relationships
- cross-workspace refund relationships
- cross-workspace return/item/allocation/inventory relationships
- cross-workspace inventory-consumption relationships
- cross-workspace order/table relationships
- cross-workspace KOT/order/table relationships
- active cash payments without a cash shift
- cash payment/shift workspace mismatch
- cash payment outside its shift time window
- negative warehouse stock
- duplicate external Restaurant order references
- duplicate payment idempotency keys
- duplicate refund idempotency keys
- duplicate return idempotency keys
- unbalanced GL source groups
- completed orders missing inventory posting
- completed orders missing accounting posting
- cancelled orders retaining inventory posting
- cancelled orders retaining accounting posting
- unpaid completed dine-in orders releasing their table
- available tables with an unreleased live order
- occupied tables without an unreleased live order
- closed cash-shift variance arithmetic mismatch
- open shifts containing close fields

One initial broad query found one PAID+COMPLETED dine-in order without `tableReleasedAt`. It was not an invariant failure: the same table has another unreleased CONFIRMED/UNPAID order, so the table correctly remains OCCUPIED. The refined terminal-settlement check reports zero violations.

**Database reconciliation: PASS for the checked staging invariants.**


### Additional financial and audit conservation checks

Additional read-only reconciliation also reports zero violations for:

- net returned quantity below zero
- net returned quantity exceeding sold quantity
- negative adjusted order due after returns/reversals
- negative retained paid amount after return allocations
- return payment allocation exceeding its active payment
- derived Restaurant payment-status mismatch after treating a fully returned zero-due order as settled
- manual payment voids missing their dedicated payment-void audit
- return-driven automatic payment voids missing a Restaurant-return audit that references the affected payment

Three fully returned orders initially looked like payment-status mismatches only because a naive check classified zero-due/zero-retained orders as UNPAID. The application correctly records these zero-due orders as PAID.

Three payments automatically voided by full item returns do not carry a separate manual `restaurant.payment.voided` audit. This is intentional derived-state behavior: each payment is referenced by the corresponding `restaurant.return.created` audit metadata and retains its explicit full-return void reason. Dedicated manual payment voids do have `restaurant.payment.voided` audit events.

### Runtime observations

The dedicated staging deployment's grouped runtime history contains expected authorization/authentication guard noise:

- `MODULE_DISABLED` on Restaurant routes for a workspace without the Restaurant module
- stale/invalid Supabase refresh-token errors in middleware

These are consistent with negative authorization/session testing and are not evidence of a Restaurant data-integrity failure. Exact-deployment error/fatal log retrieval over the checked window returned no matching entries after the latest staging verification.

### Main-branch convergence boundary

The V1.95 Restaurant stack and current main are diverged. At inspection time the Restaurant head is 483 commits ahead and 66 commits behind current main, with merge base `cebb8f41d564ce261386c0168cc756eba7276cd5`.

This V1.96 certification therefore proves the frozen Restaurant stack itself. Any future merge/rebase/convergence with current main invalidates exact-SHA certification and requires the affected release gates to run again before production promotion.

## Print acceptance

Automatable print evidence is covered by V1.96 CI:

- Restaurant receipt and KOT component contracts
- tenant-scoped print route
- pending-review WhatsApp KOT rejection
- 80mm print mode
- long-order (30-line) thermal PDF preservation/readability
- browser rendering harness

Physical-device checks cannot be certified by CI.

Required operator/hardware checks remain:

- actual 80mm customer printer
- actual KOT printer
- driver/paper/margins/feed/cutter
- routing to the correct physical device
- paper-out/offline/reprint behavior
- applicable Unicode/Urdu rendering

**PHYSICAL PRINTER OPERATOR ACCEPTANCE REQUIRED.**

## Capacity

Existing synthetic contention evidence is retained. Higher hot-resource concurrency can exhaust bounded retries while preserving correctness. No customer terminal-count/latency acceptance threshold has been approved, so a production throughput claim is not made.

## Release boundary

Do not merge the Restaurant stack to main and do not deploy Restaurant to production from this certification PR.

Current blockers to a final release-certified verdict:

1. V1.96 exact-head CI must pass.
2. F07 live authenticated multi-tab race still requires operator session.
3. Physical printer acceptance requires real devices.
4. Customer capacity/latency threshold remains unapproved if it is required for launch sign-off.
