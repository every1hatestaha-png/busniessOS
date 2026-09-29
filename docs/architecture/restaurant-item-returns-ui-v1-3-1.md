# Restaurant item returns UI V1.3.1

This slice is stacked on the verified Restaurant V1.3 item-return accounting core.

## Scope

- Exposes a manager-only return entry point from completed restaurant orders.
- Adds a dedicated return screen for one completed order.
- Shows original, already-returned, and remaining item quantities.
- Supports fractional return quantities.
- Keeps restock explicit and off by default.
- Shows immutable return history.

## Security and accounting boundary

The browser never supplies or chooses the authoritative refund total.

On submit, the server:

1. Reloads the tenant-scoped completed order and selected item.
2. Recalculates proportional discount and tax.
3. Reconciles final-order rounding when the return exhausts the order.
4. Calculates remaining refundable balances from original posted restaurant payments.
5. Allocates the refund across those original payments.
6. Calls the verified Restaurant V1.3 item-return transaction, which revalidates quantities, payment capacity, tenant boundaries, cash balances, inventory snapshots, COGS, GL balance, and idempotency.

Stale or concurrent state fails closed in the core transaction.

## Restock policy

Restock remains opt-in. Prepared food should normally not be restocked. When restock is requested, V1.3 restores only historical item-level consumption snapshots and historical cost. Missing snapshots block restock rather than estimating.

## Release boundary

This branch does not merge or deploy automatically. Production is untouched until the stacked UI slice passes the same native PostgreSQL migration, regression, finance, TypeScript, and production-build gates as the accounting core.
