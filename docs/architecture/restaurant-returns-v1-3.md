# Restaurant Workspace V1.3 item returns

This phase is stacked on V1.2 refunds and remains non-production while under review.

## Integrity boundary

Item returns are manager-only and run in a serializable transaction. A successful return commits stock restoration, warehouse restoration when applicable, return records, balanced accounting adjustments, any paid cash refund, order return totals and audit history together.

## Historical stock safety

When restaurant inventory is first posted, PostgreSQL snapshots each order line's exact consumed products, quantities, warehouse and unit costs. Later returns use that immutable consumption snapshot instead of the current recipe definition.

Orders completed before consumption snapshots existed fail closed for item return stock restoration. The system does not guess historical ingredients.

## Financial allocation

Order-level discount and sales tax are allocated proportionally to the returned gross line value. Returned revenue and tax reduce the original receivable through balanced adjustment entries. COGS and inventory are reversed from the historical consumption cost.

The cash refund is capped by active paid value that has not already been refunded by earlier item returns. Any unpaid portion reduces receivables without inventing a cash movement.

## Guards

- Returned quantity cannot exceed sold quantity across all prior returns.
- Duplicate request IDs are idempotent and cannot be reused for another order.
- Cash or bank accounts are tenant-scoped and must have enough recorded balance.
- Database triggers reject cross-workspace return parent references.
- Stock restoration fails if a historical product or managed warehouse is no longer safely resolvable.
- Original sale and receipt entries are preserved for audit history.

## Deliberate boundaries

- Persisted RESTAURANT vertical remains sealed.
- Authentication is unchanged.
- No production data or credentials are touched.
- No merge or deployment is automatic.
