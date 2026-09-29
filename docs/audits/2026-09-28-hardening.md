# Production hardening ledger

Baseline: cebb8f41d564ce261386c0168cc756eba7276cd5.
Production at inspection: dpl_6y81cb7KcbNr17BfXnHRF1aBZJUg.
Scope: all seven priorities requested on 2026-09-28. No production writes performed.

## Release gates

- VERIFIED on isolated PostgreSQL: customer and supplier return idempotency conflicts are rejected instead of replaying a different request under a reused key.
- VERIFIED on isolated PostgreSQL: receipt-specific supplier-return quantity checks include earlier unscoped returns.
- VERIFIED on isolated PostgreSQL: cumulative partial customer returns reconcile to the sold line without independent-rounding drift.
- VERIFIED on isolated PostgreSQL: sale and BOM edit history retains the original movement trail while current stock remains correct.
- VERIFIED: forgot-password recovery refactor clears the baseline ESLint error without changing the customer authentication provider or internal ERP user IDs.
- VERIFIED on current hardening head before this ledger-only commit: Prisma validation, all migrations, TypeScript, ESLint, the full unit/integration suite, the finance-grade suite, production Next.js build, production runtime dependency audit, desktop smoke, and the PR security/auth gate all pass.
- VERIFIED: public readiness is fail-closed and exposes only database readiness plus the 12-character deployment revision required by the release workflow. FBR credential/transmission posture and database target details are not exposed.
- VERIFIED: STAFF least-privilege gaps were closed across customer balances and credit limits, product cost/FBR mapping, procurement, supplier, GRN, returns, payments, manufacturing and khata surfaces. Staff sale-detail access no longer includes the customer's account balance or credit limit.
- VERIFIED: customer-credit allocation rejects a changed request that reuses an idempotency key, with regression coverage for exact replay versus conflicting replay.
- VERIFIED: GRN replay semantics are enforced both at the API boundary and the public service boundary. A reused key with a different purchase, warehouse, header or line payload is rejected instead of silently replaying an older receipt.
- VERIFIED: public sale creation and customer payment service boundaries enforce their corresponding RBAC permissions before entering core mutation logic.
- VERIFIED on Vercel preview: when legacy Clerk server configuration is absent, `/platform/sign-in` now fails closed with an explicit unavailable state instead of throwing the previous Clerk middleware/runtime render error. Error-level runtime logs remained empty after verification of the fixed preview.
- AUTHENTICATED QA SETUP: the current hardening preview loads the customer sign-in page without visible pre-authentication errors and reaches the dedicated test account's password prompt. Full authenticated ERP and cross-tenant browser QA is blocked only on test-account authentication input.
- P1 verification gate: authenticated browser QA against the dedicated test account and dummy workspaces remains required before merge or production deployment.
- P1 verification gate: Neon project ID and actual recovery retention are not yet verified. The connected Neon tooling is unscoped and requires the target project ID before recovery settings can be read. Do not infer retention from plan marketing.
- P2: rendered printable-document, phone-layout and optional-onboarding verification remains.

## Coverage status

1. ERP integrity: return integrity, managed-warehouse sale lifecycle, BOM stock/history, customer-credit replay semantics, and GRN replay semantics are covered by passing isolated-database tests. Continue authenticated browser QA.
2. Accounting integrity: return rounding, payment flows, reconciliation coverage and the finance-grade lifecycle suite pass on the current verified code head. Continue review around any newly introduced mutation path before release.
3. Printing: print contract tests pass. Rendered A4 and thermal verification remains.
4. Security: API context validates active workspace membership, RBAC gates sensitive operations, database parent guards reject cross-workspace references, Clerk webhook signatures are verified with Svix, FBR bearer tokens use workspace/environment-bound AES-256-GCM storage, recovery abuse controls were added, AI chat remains read-only and workspace scoped, readiness metadata is minimized, sensitive dashboard subtrees have server-side permission guards, and sale/payment service mutation boundaries now enforce RBAC. Authenticated cross-tenant browser QA remains a release gate.
5. Mobile: responsive contract tests pass. Browser/device verification remains.
6. Onboarding: invitation acceptance is bound to the authenticated user’s verified email and invitation state. Browser review remains.
7. Backups and monitoring: the reproduced legacy platform-sign-in runtime error is fixed on the hardening preview and the fixed deployment produced no error-level runtime log entry during verification. This is not proof of transaction correctness. Neon recovery configuration remains unverified until the project ID is available to the connected tooling.

## Security observations

- Customer web authentication remains Supabase-first. Clerk is restricted to explicit legacy desktop, platform and bearer-token flows.
- A deployment without legacy Clerk server credentials no longer attempts platform-owner Clerk authentication. The platform admin sign-in surface fails closed while normal customer authentication remains available.
- Workspace switching verifies membership before changing the HTTP-only workspace cookie.
- Member invitation revoke, role update and removal operations scope mutations to the active workspace and prevent changing or removing the owner through those paths.
- Platform owner actions verify the configured owner identity, require MFA, and require recent password reauthentication before subscription or destructive account operations.
- AI tools query with the authenticated workspace ID and expose financial tools only when the role has financial permission. Tool-returned business text is explicitly treated as untrusted data rather than instructions.
- FBR production transmission is fail-closed unless deployment-level production transmission is explicitly enabled.
- Public readiness discloses database state and only the shortened deployment revision needed to reject stale deployments. It does not disclose FBR security configuration or database target details.
- STAFF customer responses omit receivable, credit-limit and credit-term fields. Customer dashboard/detail UI follows the same rule.
- STAFF product responses omit cost price and FBR reference/mapping metadata. Inventory dashboard/detail UI also hides cost valuation, gross margin and FBR mapping.
- Procurement, supplier, GRN and khata read APIs require their corresponding privileged permissions instead of generic business.read.
- Sensitive SSR page trees for suppliers, purchases, goods receipts, customer returns, supplier returns, khata, payment receipts and manufacturing enforce permission checks server-side instead of relying on hidden buttons or navigation links.
- The invoice register's workspace-wide billed/outstanding/overdue summary requires financial permission while individual sale-linked invoice documents remain available for legitimate sales workflow access.
- STAFF can inspect sales needed for sales work, but customer-level balance and credit-limit data is not exposed through sale detail API or UI.
- Application rate limiting is defense in depth and process-local. Provider, platform and authentication controls remain required for distributed abuse resistance.

## Environment

Local and CI work uses the dedicated hardening branch. No production database URL has been loaded for these integration tests. Integration fixtures use isolated PostgreSQL 16. Vercel preview verification uses branch deployments only. Production remains untouched until authenticated QA and the remaining release gates are complete.
