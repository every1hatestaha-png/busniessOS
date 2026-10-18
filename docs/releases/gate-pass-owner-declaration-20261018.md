# Gate Pass V2: explicit owner declaration

The existing reviewed-approval configuration remains supported. A separate opt-in now lets the authenticated, currently persisted workspace OWNER record a **document-specific business declaration**, without falsely setting `OUTBOUND_GP_ACCEPTANCE_BILLING_LEGALLY_APPROVED` or claiming independent legal clearance.

This is not a tax exemption or a substitute for an invoice required by law. The owner must assess actual tax status and customer terms, identify the reference and substantive basis, and expressly confirm that no invoice or supply recognition is required before acceptance. Credit terms and disabled FBR transmission alone are insufficient. An unknown position or a delivery-time invoice obligation must not use this path. [FBR FAQ20](https://www.fbr.gov.pk/faqs/173967/173969) states the payment/delivery timing rule. No professional opinion or factual eligibility is manufactured by the application.

## Controls

- Default OFF: `OUTBOUND_GP_OWNER_ATTESTATION_ENABLED=true` is required separately from V2, the existing exact Ahmad UUID gate and valid future UTC cutover.
- Only future V2 drafts qualify; historical/legacy documents do not acquire this authorization. Existing valid marked V2 documents retain their recorded declaration if new V2 issuance is paused.
- At ISSUE, persisted membership and entitlement are locked and checked; only OWNER can sign. The submitted identity/role is never accepted. The real actor, customer, immutable document creation time, reference, basis and three express acknowledgements are recorded once in the existing audit table, within the stock transaction. Failed ISSUE rolls back both declaration and stock. No schema migration.
- DISPATCH and accepted-only invoicing recheck the exact-document evidence. FBR-enabled workspaces remain blocked independently. Existing pricing, tax, credit-limit, accepted-quantity, permission, inventory, immutable snapshot and GL safeguards remain authoritative.
- The record is labelled `OWNER_DECLARATION_NOT_INDEPENDENT_CLEARANCE`. The UI never describes it as professional certification. No checkboxes start selected. After a failed/reset submission they must be confirmed again.
- Receiving remains cumulative; rejected goods are unsold and restock only on physical return. Credit invoices remain UNPAID with zero payment. Nothing automatically signs receiving, creates payments or submits to FBR.

## Authorized future-only rollout

After exact-head review/CI and production project verification, configure together on the business-os production project: existing V1=true/exact Ahmad workspace; `OUTBOUND_GP_OWNER_ATTESTATION_ENABLED=true`; `OUTBOUND_GATE_PASS_BOM_DISPATCH_ENABLED=true`; `OUTBOUND_GP_ISSUE_STOCK_V2_ENABLED=true`; `OUTBOUND_GP_ISSUE_STOCK_V2_CUTOVER_AT=<verified future UTC YYYY-MM-DDTHH:mm:ss.sssZ>`. Keep migration-on-build0 and FBR production transmissionOFF. Leave professional/legal-approval flags unset; do not invent a reference. Verify the complete deployment before cutover; abandon an elapsed unverified cutover rather than reclassifying historical documents.

The owner must authenticate and truthfully complete the declaration on a newly created V2 Gate Pass before ISSUE. Founder approval of the workflow is not that per-delivery declaration. No synthetic production transaction is authorized for testing. Normal future inventory receipts must replenish shortages; do not change existing stock/BOM data.

If stopping new V2 issuance, retain marker-aware code and leave access to prior declarations available for already-issued documents. Never deploy pre-V2 dispatch logic, rewrite audit evidence, backfill markers or edit historical transactions. Keep the existing additive schema. Physical printer acceptance and a successful backup restore are not claimed here.
