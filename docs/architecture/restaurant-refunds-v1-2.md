# Restaurant Workspace V1.2 refund boundary

This phase is stacked on Restaurant Workspace V1.1 and remains non-production while under review.

## Scope

V1.2 introduces full refunds for posted restaurant payments on completed orders. Refunds are intentionally separate from pre-completion payment voids.

A refund transaction atomically:

- validates manager-level authority
- locks the original payment and restaurant order
- requires the order to be COMPLETED and the payment to be posted and active
- creates one durable tenant-scoped refund record
- reverses the original RECEIPT general-ledger entries
- decreases the exact original cash or bank account balance
- marks the original payment refunded through its existing void metadata without deleting it
- recalculates the order payment status from remaining active payments
- writes an immutable restaurant.payment.refunded audit event

## Safety guarantees

- One full refund is allowed per restaurant payment.
- Idempotency keys make retries safe and reject conflicting reuse.
- STAFF cannot issue refunds.
- Refunds before order completion fail closed.
- Cross-workspace or mismatched payment, order, and cash-account references are rejected by PostgreSQL trigger.
- If the original receipt accounting cannot be fully reversed, the entire refund transaction rolls back.
- If the recorded cash or bank balance cannot fund the refund, the refund fails instead of silently producing a negative recorded balance.

## Deliberate boundary

This slice supports full payment refunds only. Partial refunds, item-level returns, restocking, tax adjustments, and partial COGS reversal require a separate reviewed domain flow and are not silently approximated here.

The persisted RESTAURANT vertical remains sealed. No production data, production credentials, live WhatsApp integration, merge, or deployment is performed by this phase.
