# Gate Pass V2 customer BOM configuration preflight

## Gap closed

The Gate Pass detail page previously checked current parent/component stock and
whether the assembly adapter was enabled, but it could still present an enabled
V2 ISSUE button for an active customer BOM with no component lines, an unavailable
component, or an assembly that includes itself. The serializable ISSUE operation
would reject the configuration, leaving the operator with conflicting signals.

## Read-only change

- The detail page now checks active customer BOM configuration for the exact
  workspace, customer, and Gate Pass products. Missing, inactive and self-linked
  components are visible before the operator attempts V2 ISSUE or legacy DISPATCH.
- Invalid configurations disable only actions that would have to read that BOM
  and deduct stock. Draft printing and legacy document-only ISSUE are unchanged.
- Already V2-issued Gate Passes depend on immutable issue-time component
  snapshots. Later customer BOM changes must not hide DISPATCH or trigger a
  second stock deduction.
- The server-side transactional BOM validation remains authoritative.

## Verification and scope

Disposable PG18 acceptance cases cover empty, missing and self-referencing BOMs,
show the disabled ISSUE action, and verify that failed issuance preserves draft
state, inventory quantity and movement counts. Another case changes the BOM
after a genuine synthetic V2 ISSUE and verifies that DISPATCH stays available.

No production customer records, products, stock, GRNs, orders, Gate Passes,
invoices or ledgers are modified. This code change does not configure a V2
cutover or override the separate operational billing approval gate.
