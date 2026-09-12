# Weighted transaction model

- Product `defaultWeightKg` is only a catalog suggestion.
- Purchase order lines may override unit weight when weight pricing is selected.
- GRN actual received/accepted weights remain transaction-time editable facts.
- Sales lines may switch between unit and weight pricing. Weight-priced sales persist the actual unit weight, total weight, and rate/kg used for that sale.
- Sale detail and invoice data expose the transaction snapshot (actual kg/unit, total kg, and rate/kg) rather than reading the product's current default weight.
- Stock quantity remains quantity-based; weight controls valuation/pricing and is snapshotted on each weighted transaction.
- Standard laptop widths keep operational forms/detail pages full-width; secondary summary/action panels move beside the main workspace only at wide desktop breakpoints.
- Sales and purchase line inserts are batched where safe; guarded stock mutations remain serialized so speed improvements do not weaken oversell/concurrency protection.
