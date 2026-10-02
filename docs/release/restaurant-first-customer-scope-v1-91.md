# Restaurant first-customer scope V1.91

Proposed release candidate: POS-led Restaurant operations, with approved authenticated staging and printer acceptance required before launch. This matrix describes repository evidence, not production or provider validation. #270's five fixes remain intact. The V1.91 change enforces the existing expired/suspended read-only policy at all Restaurant mutation actions; existing history and print reads remain available.

| Capability | Classification | Actual supported scope / prerequisite |
| --- | --- | --- |
| POS | READY FOR CURRENT RELEASE SCOPE | Server-priced baskets, separate intentional orders, workspace/request replay safety |
| Dine-in | READY FOR CURRENT RELEASE SCOPE | Table-linked orders, kitchen progression, partial/final payment and settlement |
| Takeaway | READY FOR CURRENT RELEASE SCOPE | Create, pay, prepare, complete |
| Tables | READY FOR CURRENT RELEASE SCOPE | Occupancy/settlement, tenant constraints and historical reads |
| KOT | READY FOR CURRENT RELEASE SCOPE | Order-linked tickets; legacy tickets remain status-only |
| Payments | READY FOR CURRENT RELEASE SCOPE | Recorded collection and guarded void; no automatic card acquiring claim |
| Cash shifts | READY FOR CURRENT RELEASE SCOPE | Open, cash collection/compensation, ledger-derived close/variance |
| Bank payments | READY FOR CURRENT RELEASE SCOPE | Recording to configured bank account without cash-shift requirement; no bank-feed integration claim |
| Returns | READY FOR CURRENT RELEASE SCOPE | Partial/full item return and guarded reversal |
| Refunds | READY FOR CURRENT RELEASE SCOPE | Guarded compensation and immutable evidence |
| Inventory consumption | READY FOR CURRENT RELEASE SCOPE | Exactly-once completion effects, linked items/recipes and existing warehouse mode |
| Accounting/GL | READY FOR CURRENT RELEASE SCOPE | Balanced postings and guarded financial/inventory snapshots |
| Customer receipt | READY FOR CURRENT RELEASE SCOPE | Operational historical receipt; not certified fiscal output |
| 80mm receipt | HARDWARE VALIDATION REQUIRED | Synthetic PDF/layout is certified; intended physical device must pass checklist |
| KOT print | HARDWARE VALIDATION REQUIRED | Approved-order/cancelled/reprint code is certified; device routing/feed unverified |
| Cancel/reprint | READY FOR CURRENT RELEASE SCOPE | Historical reads and cancellation marking; physical output subject to printer acceptance |
| FBR credentials | CONFIGURATION REQUIRED | Generic adapter exists; Restaurant receipts are not certified FBR invoices |
| FBR fiscal launch | EXTERNAL APPROVAL REQUIRED | Authority/provider approval and supported Restaurant fiscal path must be established before such a promise |
| WhatsApp automatic intake | OUT OF FIRST RELEASE SCOPE | NOT IMPLEMENTED: internal deduplicated Pending Review ingestion exists, but no signed provider webhook/tenant routing transport exists |
| Email/SMS | OUT OF FIRST RELEASE SCOPE | Restaurant-specific notifications NOT IMPLEMENTED |
| Owner/admin SaaS controls | CONFIGURATION REQUIRED | Workspace/member roles and manual subscription lifecycle exist; platform owner requires legacy Clerk and configured owner identity; authenticated acceptance outstanding |

WhatsApp decision: **OUT OF FIRST RELEASE SCOPE** for this defensible POS candidate. The repository contains no evidence that automatic provider delivery is a contractual first-customer requirement. Do not interpret the partial WhatsApp UI as a complete integration. If a customer commitment includes it, reclassify it as BLOCKING FIRST RELEASE and separately scope signed webhook rejection, explicit tenant mapping, deduplication, Pending Review ingestion, immutable audit, replay and rate/error handling. No provider integration is being built or connected in this audit.

FBR-integrated fiscal invoicing and automatic email/SMS are likewise excluded from this proposed operational POS scope. This is a product-scope proposal for review, not a legal/tax eligibility determination. Obtain the necessary fiscal approval before using the operational receipt as customer fiscal evidence.

## Authenticated acceptance status

No staging Supabase configuration or approved staging URL/account is present in the isolated checkout or supplied process environment. Only `.env.example` is present; production secrets were not inspected. The checked-in public fallback Supabase project is not an approved staging target and was not contacted. No provider-authentication result is fabricated.

Real provider login/logout, refresh/expiry, revocation, membership removal, role downgrade, workspace changes, multiple tabs, back/refresh/retry and authenticated direct print access require approved staging. Existing action/service tests verify controlled redirects, stale workspace rejection, role checks, tenant-scoped IDs/replay, immutable effects and read-only access. They are not substitutes for real session transport. New entitlement regressions use stubbed identity with real synthetic PostgreSQL access policy.

The actual local Next production build was started against loopback-only database/auth configuration. Logged-out requests to Restaurant, orders, order detail, receipt print and KOT print all returned HTTP 307 to sign-in; `/api/health` returned 200. `/api/readiness` returned 503 because the existing production database-target guard correctly refuses the isolated loopback target. This verifies logged-out routing, not provider sessions or authenticated staging. The guard was not bypassed.

Record staging acceptance per scenario: release SHA, environment identity, actor/role, browser/tab, expected workspace, operation/request identity, before/after order/payment/table/stock/GL/cash/audit evidence, observed redirect/error, and pass/fail. Never include credentials or customer data in the evidence.

## Physical acceptance checklist

For each intended customer and KOT printer, record manufacturer/model, driver/version, OS/browser, selected device/route, paper width and result. Use synthetic data only.

- Confirm 80mm paper, printable margins, scale at 100%, no horizontal clipping, totals/quantities legible and no unintended browser header/footer.
- Print short and 30+ item documents; inspect long item names, line wrapping, page continuation, feed length, final totals, cutter and paper advance.
- If Urdu/Unicode support is promised, test synthetic Urdu and mixed Unicode; inspect glyphs, direction and shaping. Otherwise record that capability as unsupported for this device/scope.
- Customer device: normal receipt, partial-return/refund receipt, cancelled receipt with prominent cancellation, and reprint copy marking.
- KOT device: quantities, notes, modifiers, cancellation/do-not-fulfil marking and reprint handling; confirm pending-review orders cannot print a fulfilment KOT.
- Verify exact customer/KOT routing on separate devices and multiple tabs. A customer receipt must not silently route to the kitchen or vice versa.
- Record jams, disconnect/reconnect and operator retry behavior. Confirm retry does not create another order/payment or misidentify a reprint.

Status: **HARDWARE VALIDATION REQUIRED**. No physical printing was performed.
