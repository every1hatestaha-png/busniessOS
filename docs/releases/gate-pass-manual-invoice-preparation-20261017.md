# Manual Gate Pass invoice preparation

Base: production/main b4dcc04285ea1d6715d9fcbf0a01922bf3434b0a, including #345, future-only cutover #346 and pre-ISSUE dispatch checks #347. Those stock, permission, serializable/idempotency and legacy guards are unchanged.

## Business requirement and safe implementation

Ahmad requested an explicit manual action in Pending Invoices for a specific issued Gate Pass. Customer acceptance was not specified as the prerequisite for **starting preparation**. Pending Invoices now links every eligible issued/in-transit/receiving Gate Pass to its preparation section. Preparing prices, tax and payable does not create an invoice, allocate an invoice number, change stock, post GL/receivables, change receiving, or persist a draft business record. Values remain only in React state in the open tab, are reset on refresh/receiving updates, and are labelled accordingly. No local storage, new table, migration or backfill is used.

Before receiving is finalized, the preview uses planned quantities and is explicitly labelled an estimate, not an issued invoice. Once receiving is finalized, it uses only accepted quantities. Exact integer cent arithmetic matches server per-line taxable-then-tax half-up rounding; missing tax, invalid precision, overflows and zero totals cannot silently become a valid final submission. Every tax rate must be explicitly selected, including zero.

Only the existing final server action can issue an invoice. The final submit control/payload is absent unless receiving and configured billing prerequisites are satisfied. Existing persisted-role, tenant, receiving evidence, compliance acknowledgement, FBR compatibility, credit, duplicate invoice and ledger guards remain authoritative against stale tabs/direct calls. The UI adds no new mutation action. Pending Invoices is explicitly revalidated after lifecycle actions.

An unapproved V2 ISSUE button is disabled before an operator can attempt stock reservation; the existing server guard independently rejects it. Legacy issue/printing remains available as before. Dispatch feedback no longer incorrectly implies a second stock deduction for issue-reserved V2 documents.

## Invoice timing remains a release gate

Business authorization is not tax clearance. No actual tax/legal approval was supplied. Source-only preparation does **not** change final invoice timing from the existing acceptance-based policy and does not enable V2, BOM, deferred billing or FBR transmission. Never set approval flags merely to make this workflow run.

Required external decision: a qualified tax adviser must document whether acceptance-based billing is valid for the actual transactions and whether an invoice is required at payment/delivery. If acceptance-based billing is genuinely approved, retain its real reference plus stock/BOM/operator/printer acceptance before separately authorizing a future UTC V2 cutover. If an invoice is required at dispatch, leave this mode disabled and use the existing standard Sales workflow until a dispatch-time Gate Pass invoice adapter is implemented/certified.

The dispatch-time adapter design must consume operator-prepared prices only through an explicit final-issue action at the approved stage; atomically create one linked invoice/receivable/GL posting; never call generic stock consumption after V2 issue; freeze immutable quantities/costs/taxes; retain independent receiving evidence after invoice; and handle subsequent rejection via linked credit notes plus physical-return-only inventory restoration. It requires reconciliation of already billed versus accepted quantities and return/credit idempotency under races. Those are materially different financial semantics and must not be fabricated by marking unreceived goods accepted or relabelling an unissued invoice. This PR deliberately does neither.

## Verification and production safety

Local disposable PostgreSQL18: 136 Gate Pass focused/lifecycle/cutover/finance/tenant/upgrade checks pass, including a new no-mutation preparation rendering check. Separate disposable finance database: 49 tests pass. TypeScript, scoped lint and Prisma validation pass. Exact-head CI and browser/build results are recorded in the PR/release evidence before merging.

The new branch has Vercel automatic deployments disabled until merge. Only reviewed green source-only merge/deployment is owner-authorized. No production database operation, historical stock/order/GRN/GP/invoice/payment/balance/ledger modification, new production transaction, provider setting change or activation is authorized by this change. The schema and migration chain remain unchanged at136.
