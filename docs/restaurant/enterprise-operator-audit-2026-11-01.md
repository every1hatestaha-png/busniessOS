# MunshiOS Restaurant: enterprise operator audit
Date: 2026-11-01
Scope: isolated Restaurant staging branch (draft PR #369). No production approval.

## Executive verdict

This is a functioning operational beta with a legitimate tenant-aware ERP foundation, but it is NOT a fully accepted, premium restaurant ERP. The greatest risk is not visual quality. It is role permission correctness, shift reconciliation, staff accountability, menu configuration depth and absence of multi-device operations acceptance.

## Verified implementation

- One RESTAURANT workspace holds the manager, order-taking and kitchen station roles. Server-side assignment table is present. Managers can select stations; assigned STAFF auto-route to one.
- POS: dine-in, takeaway, delivery, quantity, notes, menu search, table selection, manager discount/tax permissions, idempotent server acceptance and server repricing.
- Kitchen: confirmed > preparing > ready; bounded FIFO queues, per-item notes/modifiers, price-free KOT UI, 5-second visible-tab polling, delayed ticket cues (>=10 and >=20 minutes since order created).
- Order board: ready orders can be completed; settlements support multiple payments, idempotency, cash shift guard and current-amount validation.
- Manager: sales/operations summary, staff assignment, menu, dining tables, cash-shift controls, inventory/accounting links.
- Printed KOT hides prices; receipt exposes payments to its approved cashier/manager.

## Major deficiencies, ranked

### P0: Stop-ship
1. Run three actual separate nonproduction logins. Verify cashier cannot read Manager, Kitchen, finance, reports, returns, generic ERP API; Kitchen cannot read any receipt/payment/cost/financial data; unassigned STAFF cannot access any station. Test direct URLs, nested paths, POST server actions, browser back/refresh, workspace switching, plus the normal UI. Every denial must happen server-side with no sensitive response.
2. POS to kitchen to ready to cashier completion to partial/split payment to receipt, tested simultaneously in two browsers. Include network loss, double-clicks, retries, status races, permissions revoked mid-session and tenant-crossing IDs. There is no successful authenticated multi-device sign-off yet.
3. Clear all required CI gates. Five prior regressions followed changed station routing labels/limits; tests were updated to assert intended behavior, not to drop permission coverage. New exact-SHA CI must pass.
4. Investigate GHSA-rmxm-3fg6-px4f (@hono/node-server): upstream security advisory published 2026-10-28, fixed release v2.1.3. Trace the transitive dependency and affected use of serveStatic. Upgrade safely with lockfile regeneration and test, do NOT add a silent audit exception.
5. Existing cash shift closeout already uses ledger-backed expected vs physically counted cash, stores variance and writes an audit event. The new manager-only Shift Reconciliation screen surfaces this last-30 history. Remaining acceptance: verify refunds, payment reversals, cancellations and concurrency against counted cash, and introduce a separate manager acknowledgment/sign-off process for unexplained differences. Do not conflate existing settlement with verified sign-off.
6. Print a physical 80mm KOT and customer receipt on actual kitchen/cashier hardware. Confirm duplicate reprints visibly marked and test paper loss/printer offline.

### P1: Restaurant service operations
1. Table plan with areas, capacity, occupied/reserved/available, session reopening, per-table active ticket, safe release only after settlement. Add table transfer/merge and seat allocations only after an immutable audit design. Current table dropdown is insufficient for a large full-service site.
2. True modifier groups with persisted selections, allowed choices, price delta, allergen prompts and recipe/stock effects. Current free-form notes are not structured modifiers and cannot account for add-ons accurately.
3. Correct order amendments after confirmation: quantity add/remove, re-fire only changed KOT items, preserve original kitchen ticket and manager authorization for post-prep cancellations.
4. Reliable kitchen routing by prep station (e.g. grill, fryer, drinks), priority/hold/fire by course, acknowledgements, overdue alerts and measurable kitchen throughput. Five-second polling is not delivery confirmation.
5. Bill split by seat/item and shared-party payments; current partial/multiple payment feature is NOT equivalent to a true itemized split bill.
6. Robust delivery pickup handoff, driver assignment, proof of pickup and integrations. Saved WhatsApp review does not mean automatic live intake.
7. Hardened staff shifts: per-employee cash drawer/assignment, shift settlement, who took the order, manager PIN/approval for exceptions, immutable audit and least-privilege account management.

### P2: Premium management and operational intelligence
1. Restaurant accounting: net sales, payment method mix, gross margin by menu item, discounts, voids, refunds, waste, variance and taxes, with drilldowns to immutable source documents.
2. Ingredient-level recipe costing, yield, wastage, stock depletion/reconciliation, availability driven by stock and vendor procurement suggestions.
3. Offline/intermittent network strategy with deterministic queueing and conflict handling before claiming "offline capable".
4. Accessibility: keyboard and touch parity, high contrast, reduced motion, non-color state cues; test desktop POS, 10-inch tablet and phone.
5. Performance targets: kitchen first display, order acceptance latency, queue load beyond ticket limits, operator action success and traceable error logs.

## Implemented during this audit (draft branch only)

- Repaired five expected regressions in existing station tests to assert actual staff redirect and Order Taking label, while retaining denial/manager assertions.
- Restored cashiers' bounded pending-settlement tests and explicit exclusion of historical completion rows. All active stage reads remain independent.
- Added ticket age and delayed count to Kitchen with deterministic tests. Age is measured from order creation, not inferred from cooking-start time.
- Corrected Manager's todaySales SQL to subtract restaurant item returns and compensating reversals for completed orders on the restaurant-local current day, protecting against gross-revenue overstatement; added SQL-shape regression.
- Added manager-only /restaurant/manager/shifts with last-30 shift variance history. This reuses the existing ledger-close and immutable audit design without adding a second financial truth or modifying billing and settlement.
- Verified isolated QA aggregated completed orders: gross PKR 8,900, net after returns PKR 8,500 (76 completed orders across entire QA DB, NOT the particular user's workspace). This is historical QA evidence, not a production sales report.

## Launch acceptance

Required: PASS on exact commit for unit/integration/security/finance/PG18/print gates, staging Vercel READY, three physical logins, two concurrent role-separated browsers, zero cross-tenant reads/writes, acceptance of one full order and settlement, cash count reconciliation, physical KOT/receipt, signed change/backup/rollback authorization.

No "one million dollar", "100%", "instant realtime", "tax compliant", "offline ready" or "production ready" claims before actual verified evidence.
