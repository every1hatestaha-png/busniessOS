# Restaurant Workspace V1.3 item return boundary

This phase is stacked on Restaurant Workspace V1.2 and remains non-production while under review.

## Scope

V1.3 adds item-level returns for COMPLETED restaurant orders. A return is an accounting and payment event, not an edit to the historical order.

Each return:

- requires OWNER, ADMIN, or MANAGER authority
- locks the completed order, returned items, and funding payments in a serializable transaction
- prevents cumulative returned quantity from exceeding the original item quantity
- allocates order-level discount and tax proportionally from the historical order values
- requires refund allocations to exactly equal the calculated return total
- limits each payment allocation to the unrefunded amount of that original posted payment
- refunds through the exact original cash or bank account
- posts balanced CUSTOMER_RETURN general-ledger entries
- writes an immutable restaurant.return.created audit event
- supports retry-safe idempotency keys with request fingerprints

## Historical inventory safety

Restaurant V1.1 posted inventory at order level. That is insufficient for a safe item-level return after a recipe changes.

V1.3 therefore snapshots item-to-product consumption when inventory posting completes. The snapshot stores:

- restaurant order item
- consumed product or recipe ingredient
- exact consumed quantity
- historical unit cost
- original managed warehouse when applicable

A restocking return uses only this immutable snapshot. It never rebuilds historical consumption from the current recipe.

Orders completed before the snapshot migration may not have item-level consumption history. For those orders, financial returns remain possible, but restocking fails closed instead of estimating inventory or COGS.

## Restock policy

Restock is explicit per returned item and defaults to false. This is intentional for prepared food, where returned ingredients normally cannot be put back into inventory.

When restock is true:

- product stock is restored proportionally from the historical consumption snapshot
- managed warehouse stock is restored to the original warehouse
- inventory transactions preserve historical unit cost
- COGS is reversed only for the inventory actually restored

When restock is false, revenue, tax, receivable, and cash are reversed, but inventory and COGS remain consumed.

## Payment integrity

Partial item returns and full payment refunds cannot overlap on the same payment.

Database guards reject:

- cross-workspace return parents
- return items that do not belong to the returned order
- cross-workspace or mismatched payment allocations
- allocations against unposted, voided, or fully refunded payments
- a later full payment refund after any item-return allocation exists

A deferred database trigger recalculates payment status from:

- adjusted order due = original total minus item returns
- retained payments = active posted payments minus item-return refund allocations

This keeps older payment/refund service writes from leaving a stale payment status at transaction commit.

## Deliberate boundary

This phase does not merge or deploy automatically. It does not enable the persisted RESTAURANT vertical in production and does not touch production customer data.

Return cancellation/reversal and UI exposure should be added only after native PostgreSQL migration rehearsal, regression tests, finance scenarios, typecheck, and production build are green.
