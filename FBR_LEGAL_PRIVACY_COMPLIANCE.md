# MunshiOS FBR Legal & Privacy Compliance Baseline

Last reviewed: 2026-09-19

This document records implementation decisions for engineering and release review. It is not a substitute for advice from a qualified Pakistani tax or legal professional.

## Verified regulatory baseline

- FBR states that Digital Invoicing is mandatory for registered persons covered by the applicable notifications and rules.
- FBR states that notified registered persons must integrate their ERP/POS/invoicing system through an FBR-licensed integrator.
- FBR identifies PRAL as a licensed integration route that may provide integration services to registered persons.
- FBR's current list of licensed integrators is authoritative for determining whether a third-party integrator is presently licensed.
- The Sales Tax Act, Sales Tax Rules and current FBR notifications prevail over FAQ summaries.
- Pakistan's MoITT public legislation page currently lists the Personal Data Protection Bill as draft rather than an enacted comprehensive data-protection statute. MunshiOS therefore follows privacy-by-design controls in addition to applicable constitutional, electronic-transactions, cybercrime, tax, contractual and sectoral obligations.

## Official sources reviewed

- https://fbr.gov.pk/faqs/173967/173969
- https://www.fbr.gov.pk/di-legal-provisions/173967/173968
- https://fbr.gov.pk/di-technical-assistance/173967/173970
- https://www.fbr.gov.pk/list-of-license-interprator/173967/173971
- https://www.moitt.gov.pk/Legislations
- https://pakistancode.gov.pk/
- https://download1.fbr.gov.pk/Docs/20257301172130815TechnicalDocumentationforDIAPIV1.12.pdf

## Product rules

1. MunshiOS must not describe itself as an FBR-licensed integrator unless FBR has actually issued a valid license.
2. Sandbox and production are separate trust states.
3. Production submission is default-deny until a licensed-integrator/PRAL route is configured, an authorized workspace user explicitly approves production, and the deployment-level production transmission switch is explicitly enabled.
4. For a non-PRAL integrator, MunshiOS stores a license/reference identifier for auditability; release operations should re-check the current FBR licensed-integrator list.
5. FBR credentials/tokens must never be written to invoice payload snapshots, audit metadata, client-visible logs, source control, or ordinary workspace records.
6. FBR invoice payloads contain tax and identity data and must be permission-scoped to authorized workspace users.
7. Submission attempts are append-only audit evidence. Retries must not mutate accounting transactions or create duplicate invoices.
8. Submitted financial/tax history should use reversal/correction workflows rather than destructive deletion where record integrity or law requires retention.
9. Production transmission must not claim success until an authoritative external response is received and stored.
10. If legal requirements, FBR schemas, endpoints or licensed-integrator status are uncertain, the software should block or require review rather than guess.

## Privacy controls

- Data minimization: only fields needed for the selected business/compliance feature should be processed.
- Purpose limitation: FBR payload data is used for tax-invoicing, reconciliation, support, security and legal/audit purposes.
- Workspace isolation and RBAC apply to tax identity and transmission history.
- MunshiOS does not currently use session replay on authenticated business screens.
- Business records and tax identifiers are not sold to advertisers or data brokers.
- Cross-border infrastructure/provider processing must be disclosed in the privacy policy and reviewed as providers change.
- Retention must preserve legally/accountingly necessary records while allowing removal of data that is not subject to a valid retention need.
- Child-focused accounts are outside the intended B2B product scope.

## Release checklist before live FBR transmission

- Confirm current FBR technical documentation and endpoint schema.
- Confirm integrator appears on FBR's current licensed-integrator list, or use PRAL.
- Complete sandbox/certification steps required by the selected integration route.
- Verify workspace NTN/STRN/province and buyer/product master data.
- Verify production credentials are held in protected secret storage only.
- Keep `FBR_DI_PRODUCTION_TRANSMISSION_ENABLED=0` until the live-integration checklist is complete, then enable it deliberately in the production secret environment.
- Run contract, idempotency, retry, timeout, redaction and failure-mode tests.
- Review privacy policy and terms against the exact live data flow.
- Have a Pakistani tax/legal professional review the final production setup before broad commercial rollout.
