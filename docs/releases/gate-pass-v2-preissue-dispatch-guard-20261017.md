# Gate Pass V2: pre-ISSUE dispatch prerequisite guard

## Why

V2 reserves and deducts stock at ISSUE, before the physical DISPATCH action.
DISPATCH also requires documented acceptance-billing approval and a compatible
workspace integration state. If these prerequisites are absent, the old V2
sequence could deduct stock while preventing the subsequent dispatch.

## Change

- For **future eligible V2** Gate Passes only, check the existing dispatch
  prerequisites before changing the document, item price snapshots, or stock.
- An unapproved or incompatible V2 ISSUE now fails atomically with the same
  prerequisite error as DISPATCH. No stock reservation or status transition.
- Legacy documents and pre-cutover drafts retain their existing behavior.
- No legal approval is synthesized or bypassed. The checks still run at DISPATCH.
- Regression tests cover missing approval, missing approval reference,
  incompatible integration and legacy issue behavior on disposable PostgreSQL.

## Production activation gate

This source-only fix does **not** attest legal approval, the physical printer,
actual BOM/stock availability or Ahmad's live authenticated acceptance. Do not
set `OUTBOUND_GP_ACCEPTANCE_BILLING_LEGALLY_APPROVED=true` or invent an approval
reference on the basis of owner/technical consent alone.

Keep `OUTBOUND_GP_ISSUE_STOCK_V2_ENABLED` OFF until those separate operational
conditions are genuinely met. Only then set an exact future UTC cutover and
activate for the existing Ahmad-only workspace. Do not execute or backdate a
production Gate Pass or adjust any historical stock, GRN, invoice or order.
