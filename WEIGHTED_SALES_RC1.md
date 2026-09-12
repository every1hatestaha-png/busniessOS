# Weighted transaction model

- Product `defaultWeightKg` is only a catalog suggestion.
- Purchase order lines may override unit weight when weight pricing is selected.
- GRN actual received/accepted weights remain transaction-time editable facts.
- Sales lines may switch between unit and weight pricing. Weight-priced sales persist the actual unit weight, total weight, and rate/kg used for that sale.
- Stock quantity remains quantity-based; weight controls valuation/pricing and is snapshotted on each weighted transaction.
