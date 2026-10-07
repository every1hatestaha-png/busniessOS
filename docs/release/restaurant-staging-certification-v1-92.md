# Restaurant V1.92 nonproduction certification

Stacked on reviewed V1.91 commit `3ebebc846112ac67e3a30344e8f39b5eee623f9a` (#271). Production, provider settings, customer data, merges and deployments are outside this audit. Final head and gate evidence belong in the generated release manifest, not a self-referencing commit.

## Independent #271 review

All 13 changed files were reviewed against #270. The 16 mutation actions obtain current workspace entitlement after authenticated workspace resolution and stale-form rejection, before service writes. Suspended and expired access produces controlled errors; historical read/print routes do not acquire a mutation gate. Existing role, module and workspace checks remain. This is an action-entry check, not a claim that revocation during an already-running transaction cancels that transaction.

Collection locks the tenant's order, then the exact active cash/bank row inside the existing serializable financial transaction. Account identifiers and workspace identifiers in this table are text; the lock correctly avoids UUID casts. No global account lock was introduced. Payment, GL, balance, audit and settlement remain atomic; replay preserves request identity. Opposing operation lock orders can still cause recoverable database contention; this review does not claim deadlocks are impossible. The three-retry budget and isolation are unchanged.

Targeted independent acceptance: 50 tests across V1.91 entitlement/collection, stale action boundaries, V1.90 replay, production workflow and the new rendered-page scope tests. The full existing suites remain required on the final PR head. No V1.91 business logic needed rewriting. The added workflow retains local synthetic PostgreSQL services, read-only GitHub permissions, inherited historical/query/component-browser gates and main-workflow immutability.

## Reproduced scope defect and correction

The dashboard, order board and WhatsApp screen implied automatic provider intake was ready or needed only credentials. Three tests rendered those real pages and failed before the correction. They now identify saved reviews/history and state that automatic intake is unavailable. Stored history and staff review remain accessible. No webhook, provider transport or automatic notification was implemented.

## Proposed first-customer manifest

Included: POS, dine-in, takeaway, tables, order-linked KOT, recorded payments and guarded void, cash shift, bank collection without a cash shift, supported item returns/refunds/reversal, inventory consumption, balanced accounting/GL, operational historical receipt, cancellation and reprint. Existing saved WhatsApp history/reviews are retained for staff access without a live intake promise.

Excluded unless explicitly reauthorized and separately certified: automatic WhatsApp provider intake, Restaurant email/SMS notifications and FBR-integrated fiscal output. Payments record money received; this scope does not promise automatic card acquiring. The operational receipt is not certified fiscal output. Public Restaurant vertical provisioning is unavailable: use an approved existing eligible workspace with the Restaurant module enabled, valid entitlement and configured members. Do not enable a dormant persisted vertical to bypass provisioning restrictions. The public builder does not offer a Restaurant business type/module. Generic ERP FBR adapters and manually shared links do not establish Restaurant integration acceptance.

## Authenticated staging: pending

No approved staging app URL, Supabase staging project URL/publishable configuration, synthetic user credentials, revocation/admin fixture mechanism, or staging database/project identity is supplied. Relevant environment key names were absent, and the checkout contains only the environment example. Checked-in public fallback auth configuration is not staging authorization and was not contacted. No production secrets were requested.

Operator must supply an approved deployed staging URL at the frozen revision, its nonproduction Supabase project/configuration, two synthetic workspaces with owner/manager/staff actors, secure test sign-in access, and an authorized way to revoke sessions/change membership, roles and entitlement. Confirm server database target belongs to that staging environment. Keep credentials outside reports/Git/chat; use the approved secret channel.

Real login/logout/refresh/expiry/revocation, removed membership/workspace, role downgrade, suspension/expiry, workspace switch during mutation, stale second tab, back/refresh/duplicate/network retry and direct Restaurant/receipt/KOT URLs remain unexecuted. The full dine-in/takeaway/cash/bank/return and failure matrix in the V1.91 runbook remains mandatory. Two authenticated tabs must exercise payment/payment, completion/payment, completion/cancellation, return/refund/void and table races, with database reconciliation after each. Stubbed identity, rendered pages and isolated component browser tests do not substitute for these gates.

## Measured capacity boundary

Dedicated loopback PostgreSQL 16, synthetic workspaces, distinct prepared orders, one burst per workload/level. Actual `$transaction` attempts were counted per caller using test-only AsyncLocalStorage instrumentation; production retry code was unchanged. Initial service durations include retry waits. p50/p95 use nearest rank on small samples, without an HTTP/browser or throughput claim. Recovery is sequential with the original identity; an intentional insufficient-stock rejection is not retried into fabricated stock.

| Workload | Callers | Initial success / reject | Internal retries | p50 / p95 ms | Serial recoveries |
| --- | ---: | --- | ---: | --- | ---: |
| Shared bank | 2 | 2 / 0 | 0 | 87 / 144 | 0 |
| Shared bank | 4 | 4 / 0 | 2 | 122 / 315 | 0 |
| Shared bank | 6 | 6 / 0 | 7 | 248 / 1213 | 0 |
| Shared bank | 10 | 8 / 2 | 18 | 592 / 1348 | 2 |
| Shared cash | 2 | 2 / 0 | 1 | 39 / 224 | 0 |
| Shared cash | 4 | 4 / 0 | 6 | 219 / 1194 | 0 |
| Shared cash | 6 | 4 / 2 | 12 | 546 / 1179 | 2 |
| Shared cash | 10 | 4 / 6 | 24 | 1214 / 1214 | 6 |
| Last stock | 2 | 1 / 1 | 1 | 56 / 214 | 0 |
| Last stock | 4 | 1 / 3 | 3 | 227 / 227 | 0 |
| Last stock | 6 | 1 / 5 | 5 | 220 / 221 | 0 |
| Last stock | 10 | 1 / 9 | 9 | 273 / 275 | 0 |
| Same-table finalization | 2 | 2 / 0 | 1 | 49 / 254 | 0 |
| Same-table finalization | 4 | 4 / 0 | 6 | 275 / 1300 | 0 |
| Same-table finalization | 6 | 4 / 2 | 12 | 698 / 1373 | 2 |
| Same-table finalization | 10 | 4 / 6 | 24 | 1458 / 1458 | 6 |
| Shared-stock finalization | 2 | 2 / 0 | 1 | 39 / 257 | 0 |
| Shared-stock finalization | 4 | 4 / 0 | 6 | 271 / 1266 | 0 |
| Shared-stock finalization | 6 | 4 / 2 | 12 | 674 / 1330 | 2 |
| Shared-stock finalization | 10 | 4 / 6 | 24 | 1327 / 1327 | 6 |

Every bounded rejection recovered using the original request. Last-stock had exactly one completion and no negative stock; remaining orders stayed ready. All workloads reconciled exact payment counts, account balances, payment audits, receipt GL counts, stock consumption and zero unbalanced GL sources. Successful replay produced no duplicate payments or stock effects. Shared cash shifts closed with expected cash and zero variance. The shared table became available after all orders completed and settled; multiple orders on one table are supported.

Two/four callers settled in these samples; six/ten cash/table/finalization bursts exhausted bounded retries. Customer terminal count, acceptable rejection/latency limits, staging network and compute limits have not been agreed or measured. Therefore capacity sign-off remains pending, and no locking optimization or retry increase is justified from an invented acceptance threshold.

## Managed recovery and promotion

Use the V1.91 operator runbook plus the V1.92 managed-release supplement and physical acceptance sheet. No approved nonproduction Neon project/branch/endpoint or recovery authorization was provided. The earlier cold local PGDATA restore is useful local evidence, not managed Neon backup/restore proof. Neither live provider nor production configuration was changed.

Release decision must remain conditional until authenticated staging, agreed capacity, approved source-specific recovery and operator ordering evidence, and both physical printers pass. No production readiness verdict is established by this document.
