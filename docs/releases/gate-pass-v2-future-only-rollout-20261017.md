# Gate Pass V2: future-only rollout guard (17 October 2026)

## Owner instruction and scope

Prepare the Ahmad / Arshad Sons Engineering Solutions Gate Pass V2 workflow in code **now**, but do **not** alter any existing production orders, GRNs, Gate Passes, product quantities, warehouse balances, BOMs, invoices or ledgers. The owner will use the new workflow only for future documents after a separate operational cutover.

The allowlisted workspace remains `4bc313cf-2869-4d87-8f1e-22a147f18d2d`. Do not expand its tenant scope. Keep the currently disabled V2 issuance flag disabled; do not change hosted environment variables or execute a production transaction as part of this code preparation.

## Source-only protection

- V2 issue-time deduction requires **both** `OUTBOUND_GP_ISSUE_STOCK_V2_ENABLED=true` and `OUTBOUND_GP_ISSUE_STOCK_V2_CUTOVER_AT=<UTC instant>` (exact ISO format `YYYY-MM-DDTHH:mm:ss.sssZ`). No such cutover is configured by this PR.
- A document's immutable database `createdAt`, not editable document date or issue time, decides eligibility. An already-created draft remains legacy even if someone issues it after activation.
- A draft created at/after the explicit cutover uses V2 issue-time stock accounting, subject to all existing inventory/BOM/permission gates. Its marker prevents double deduction at dispatch.
- A draft created before the cutover keeps legacy issue/dispatch behavior; already-issued Gate Passes retain their own historical marker behavior. No historical rows are backfilled or rewritten.
- If V2 is enabled but cutover is absent or invalid, **new issuance stops with an error**, rather than silently adopting V2 or changing old documents. Existing issued Gate Pass cancellation remains available under its existing authorization rules.
- The operator UI uses the same eligibility decision as the server, so its stock-deduction notice matches the actual path.

## Later activation, separate decision (not part of this PR)

1. Verify reviewed code, production release SHA and Ahmad-only tenant mapping. Complete the real stock/BOM and operator/physical print acceptance required by the existing release checklist.
2. Choose the genuine future UTC activation time, not a historical date. Preserve that time in the release record.
3. In the approved release window, set the new cutoff variable and explicitly enable V2 for production together, deploy, then verify the resulting revision. Keep all other existing safeguards untouched.
4. Inspect an existing pre-cutover draft read-only: it must continue to display **legacy** issue-time behavior. Check a newly created post-cutover draft through an approved authenticated operator acceptance path, without synthetic or real inventory-changing transactions unless separately authorized.
5. On failure, pause **new** issuance. Retain the marker-aware code and schema for any already-reserved V2 records; do not roll back to pre-marker logic or reset data.

This PR contains no migration, data fix, feature activation, inventory receipt, production deployment, or hosted read/write check. It only adds a future-only source guard, UI alignment and disposable regression coverage.
