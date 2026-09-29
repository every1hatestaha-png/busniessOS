# Restaurant Workspace V1.1 integrity boundary

This phase is stacked on Restaurant Workspace V1 and remains non-production while under review.

## Atomic completion

A restaurant order can post inventory and accounting only when it is READY. The terminal completion path uses a serializable transaction and row lock so the following effects commit together or roll back together:

- recipe ingredient or directly linked product stock consumption
- managed warehouse stock delta when managed warehouse mode is active
- inventory movement records
- inventory cost snapshot on the restaurant order
- sale revenue, tax, receivable, COGS and inventory general-ledger entries
- any active unposted restaurant payment receipts
- order completion status, KOT served state and table release
- audit trail

`inventoryPostedAt` and `accountingPostedAt` are durable idempotency markers. Repeating a completed transition must not post stock or finance twice.

## Payments

Restaurant payment status is derived from active payment rows. The manual payment-status mutation is disabled in the server action path.

Payments are tenant-scoped, tied to an active cash/bank account, reject overpayment, accept an idempotency request ID, and can be split across multiple methods/accounts. A posted payment void creates general-ledger reversal entries and reverses the cash/bank balance before the payment is marked void.

Orders with active payments cannot be cancelled until those payments are voided or refunded.

A PostgreSQL guard now enforces the derived-payment invariant at the database boundary. Any insert or update that would leave `restaurant_orders.paymentStatus` inconsistent with the sum of active, non-voided restaurant payments is rejected. This prevents a legacy or future internal caller from marking an unpaid order as PAID without a corresponding payment record.

## Tenant isolation

The domain layer resolves orders and cash/bank accounts inside the authenticated workspace. A PostgreSQL trigger provides defense in depth by rejecting restaurant payment rows whose order or cash/bank account belongs to another workspace.

## Verification

The dedicated Restaurant integrity suite covers recipe stock and COGS, completion idempotency, insufficient-stock rollback, split payments, payment idempotency, overpayment rejection, posted-payment reversal, cancellation guards, cross-workspace payment isolation, and direct payment-status tampering.

The stacked phase must pass the native PostgreSQL migration chain, full regression suite, finance suite, TypeScript typecheck, production build, and entrypoint validation before merge or deployment.

## Deliberate boundaries

- The persisted `RESTAURANT` vertical remains unavailable.
- Supabase customer authentication is unchanged.
- No production database, production credentials, Meta credentials or live WhatsApp webhook are used in this phase.
- No merge or deployment is automatic.
