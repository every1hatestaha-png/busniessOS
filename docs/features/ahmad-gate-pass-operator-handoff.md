# Ahmad's Gate Pass: operator handoff and release acceptance

This document describes the production application after Gate Pass release `d7069ef49366` and CI verification `905edd195718`. Do not treat this document as tax advice or authorization to ship.

## Before using the workflow

- Sign in to Ahmad's existing workspace. The independent Gate Pass entry is restricted to its exact workspace ID. Other workspaces must continue their normal Sales workflow.
- Do not create a duplicate workspace or migrate, delete, or modify historical records to enable Gate Pass.
- Draft and issued Gate Pass paperwork does not create an invoice, payment, revenue entry, or stock movement.
- Physical dispatch and acceptance-based deferred invoicing require transaction-specific tax/legal approval configured in the protected environment. They are blocked while approval is absent. FBR production transmission stays disabled unless separately authorized.
- Assemblies using customer-specific BOMs also require the separately gated BOM dispatch adapter plus sufficient component/warehouse stock. Never disable a safety guard just to make a button visible.

## Exact operator journey

1. Open **Sales > Gate Passes** (the separate independent outbound Gate Pass section), then select **New gate pass draft**.
2. Choose the existing customer, source warehouse if requested, date, delivery address, and products with quantities. Save a **DRAFT**. Saving a draft does not reserve stock.
3. Open the created Gate Pass. Review quantities and customer carefully, then select **Issue Gate Pass**. The issued snapshot is no longer an editable order.
4. Print **A4 Gate Pass** or **80mm Copy**. This is delivery paperwork, not a tax invoice or automatic authorization to dispatch.
5. **Only after required approval and stock checks**, the authorized inventory operator may select **Confirm Dispatch** when goods physically leave. Stock is deducted exactly once.
6. After the customer's signed acknowledgement, enter the customer reference, recipient, accepted and rejected quantities, and notes in **Customer receiving**. Partial receiving may be updated using cumulative quantities. Print **Customer Receiving Acknowledgement** in A4 or 80mm. It is not a payment receipt or tax invoice.
7. Rejected items are recorded as physically returned only when they actually arrive. Do not replenish stock based solely on customer rejection.
8. After reconciliation and required legal approval, finance staff review the **Pending Invoices** queue, verify final prices and tax treatment, and create a commercial invoice only for accepted items. Stock is not deducted again. Invoices created from Gate Passes cannot be edited, cancelled, or returned through ordinary Sales actions.
9. If the transaction requires an invoice at payment or delivery, use the **standard Sales** and return/credit-note workflow instead of deferred Gate Pass billing.

## Acceptance record

- Confirm the dedicated isolated PostgreSQL 18 Gate Pass suite runs **23/23** without skips. Its fixture only writes to a disposable loopback database.
- Confirm main release, finance, desktop, auth, print and capacity checks pass at the reviewed commit.
- Confirm `/api/health` and `/api/readiness` return healthy, with the expected Vercel revision.
- Read production migration status and compare Ahmad's record counts to recovery using read-only queries. Existing business records must not be overwritten by acceptance tests.
- Verify authenticated operator role/permissions in a controlled session. This is not proven by anonymous route access.
- Physical 80mm printer output, paper width, long multi-line documents, signatures, QR/cut behavior, and actual operator workflow need in-person verification. Automated browser print tests do not certify a physical device.
- Legal approval must be documented by an authorized professional for the actual transaction classification. Test fixtures simulating approval never count as real authorization.

## Release and safety

Production application release `d7069ef49366` passed health/readiness checks. The dedicated Gate Pass PG18 workflow was added to main as `905edd195718`. The operator guidance wording may be released separately after review. No printing or issue action should write finance or stock records. Keep live dispatch disabled while legal sign-off is absent.
