# Gate Pass V2 draft stock/BOM preflight

## Why

Previously, stock shortages and unsupported customer assembly (BOM) warnings
appeared on **ISSUED** Gate Passes only. A future-only V2 **DRAFT** deducts stock
at **ISSUE**, not at dispatch. Operators could therefore reach the V2 issue
button without seeing why the serializable stock transaction would reject it.

## Change

- On a V2 draft created at/after the configured UTC cutover, read the existing
  workspace-scoped product, warehouse and component availability preview.
- Warn about aggregate parent/component shortages or a BOM adapter that is
  not enabled, and disable the V2 ISSUE button while these checks fail.
- Preserve the existing billing/dispatch prerequisite check, permission checks,
  and authoritative stock/BOM validation in the ISSUE transaction.
- Never apply V2 stock checks to old/legacy drafts: those remain document-only
  at ISSUE and require stock at physical DISPATCH as before.
- The preview is informational, never reserves stock and can become stale.
  Final stock approval is still serialized at ISSUE.

## Safety

This is a UI/read-only preflight change. It adds no mutations, stock movements,
schema changes, migrations, settings, backfills or transactions. It does not
activate V2, authorize deferred billing, or send anything to the tax provider.
Existing production records and balances are untouched by releasing this code.

## Verification

- Unit tests cover V2/legacy/cutover stock-preview selection and rendered
  ISSUE-button enabled/disabled behavior.
- TypeScript, scoped ESLint, and focused Gate Pass tests pass locally.
- Release still requires clean exact-head CI. No synthetic production Gate Pass,
  invoice, stock movement or customer transaction may be used as a smoke test.
