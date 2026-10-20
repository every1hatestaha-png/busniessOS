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

## Recovery helper and controlled-release hold

`scripts/gate-pass-secure-backup.mjs` incorporates the existing private backup
helper with the reproduced Windows `data_directory` correction. PostgreSQL may
return `C:/...` or `C:\...`; both drive-absolute formats are normalized. Relative,
UNC/device, traversal, alternate-stream and control-character paths are refused.
Actual encrypted storage is still mandatory: junctions/mount-point reparse paths
are rejected and BitLocker must report FullyEncrypted/On. Access denied means
STOP, never permission to bypass encryption. Inherited PG service/options
settings are cleared before child operations. Failed local restores are retained
for private inspection; there is no automatic database deletion.

Synthetic verification only (no production contact):

```powershell
node scripts/gate-pass-secure-backup.mjs selftest
```

The existing `.gpbak` format/passphrase remains compatible. Production archive
restoration must run in a private interactive operator process with official
PostgreSQL18 utilities, independently verified encrypted/access-restricted
storage, sufficient capacity and an isolated authenticated loopback PG18 server.
Enter passphrases only at masked prompts; never in arguments, chat, Git or logs.
Never use the synthetic trust-authenticated test cluster for customer data.
The helper creates a fresh local database only, restores atomically, and cannot
restore over production. A successful restore command is transport/schema-load
evidence; separately attest checksums, constraints and financial/tenant integrity
with sanitized aggregate queries. Synthetic crypto tests are not proof that the
actual production archive restores. A stale archive must not be represented as a
fresh recovery point. No archive or credential belongs in this repository.

Before any protected release, independently satisfy:

- Fresh encrypted backup and successful isolated restore/integrity evidence;
  retain existing backups and owner-held offline recovery material.
- Physical inventory/BOM/warehouse readiness using genuine receipts and counts;
  never invent stock or adjust opening balances for acceptance testing.
- Genuine customer terms, tax-timing assessment and document-specific billing
  basis. An unknown/earlier-invoice obligation remains blocked; an agent must
  never sign acknowledgements or manufacture legal clearance.
- Explicit owner authorization for the exact protected merge/deployment and
  future-only activation. Keep FBR off, migration-on-build disabled and historical
  Gate Passes (including GP-000001) untouched. Do not backdate the cutover.
- Physical printer acceptance remains required unless the owner explicitly
  excludes printing from the initial scope and a safe paperless workflow is
  established. Software PDF tests are insufficient hardware evidence.
- Real operational acceptance requires Ahmad's specific authority and genuine
  business details. No synthetic production documents or transactions.

Stop on unexpected integrity/restore/deployment results. After any V2 document is
issued, rollback must preserve marker-aware dispatch/return/invoice code and its
audit evidence. Pause new issuance only through a reviewed compatible flag plan;
do not remove support needed to reconcile issued documents, reverse ledgers,
delete data, remove enums, or restore an old backup over later transactions.


## Existing ISSUED legacy Gate Passes, opt-in owner dispatch

Existing Gate Passes created before the V2 cutover **remain legacy**, including their dispatch-time stock movement. Never backdate their creation time, insert V2 issue markers or manually deduct stock. Without transaction-specific invoice-timing authority, their physical dispatch remains blocked.

The separate default-off `OUTBOUND_GP_LEGACY_OWNER_DISPATCH_ENABLED=true` production opt-in allows the currently persisted workspace OWNER to record a truthful document-specific invoice-timing declaration **at physical DISPATCH** of an eligible legacy ISSUED Gate Pass. This requires `OUTBOUND_GP_OWNER_ATTESTATION_ENABLED=true`, the exact authorized workspace, the existing enabled workflow, genuine tax/customer-terms review, matching immutable customer/document identity and current document version, valid stock/warehouse/BOM, financial permission and FBR disabled. Ordinary staff cannot sign for the OWNER.

The owner declaration audit and the existing legacy DISPATCH stock deduction occur in one locked serializable transaction. An invalid declaration, insufficient stock, changed version or authorization failure rolls both back. The signed audit remains available for receiving and accepted-only invoicing without a second declaration or stock movement. The existing ISSUE-time V2 path is unchanged. This uses existing audit metadata and needs no migration or historical mutation.

Enable this flag only in the intended production project and rebuild the exact reviewed Git commit. Customer physical dispatch and receiving must remain genuine actions by authorized operators. Never fabricate a declaration, stock receipt, signature or tax clearance on the owner's behalf. Known insufficient-stock historical Gate Passes remain blocked until genuine stock is received.
