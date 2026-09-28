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
- VERIFIED on prior branch head: Prisma validation, all migrations, TypeScript, production Next.js build, 660 unit/integration tests, 49 finance-grade tests, ESLint with zero errors, production dependency audit with zero known vulnerabilities, desktop smoke and the PR security/auth gate all passed.
- SECURITY HARDENING awaiting current-head CI: password-recovery start, OTP verification and recovery password mutation now have application-level per-IP rate limits in addition to provider controls.
- SECURITY HARDENING awaiting current-head CI: authenticated AI chat now has a per-IP request cap to reduce cost and abuse exposure while retaining workspace and role checks.
- P1 verification gate: authenticated browser QA against the dedicated test account and dummy workspaces remains required before merge or production deployment.
- P1 verification gate: Neon project ID and actual recovery retention are not yet verified. Do not infer them from plan marketing.
- P2: rendered printable-document, phone-layout and optional-onboarding verification remains.

## Coverage status

1. ERP integrity: return integrity, managed-warehouse sale lifecycle and BOM stock/history regressions are covered by passing isolated-database tests. Continue endpoint and browser QA.
2. Accounting integrity: return rounding and finance-grade lifecycle scenarios pass on the verified branch head. Continue reconciliation review around remaining mutations.
3. Printing: print contract tests pass. Rendered A4 and thermal verification remains.
4. Security: API context validates active workspace membership, RBAC gates sensitive member operations, database parent guards reject cross-workspace references, Clerk webhook signatures are verified with Svix, FBR bearer tokens use workspace/environment-bound AES-256-GCM storage, recovery abuse controls were added, and AI chat remains read-only and workspace scoped. Current-head CI and authenticated cross-tenant browser QA remain release gates.
5. Mobile: responsive contract tests pass. Browser/device verification remains.
6. Onboarding: invitation acceptance is bound to the authenticated user’s verified email and invitation state. Browser review remains.
7. Backups and monitoring: Vercel reported no grouped errors for the inspected window. This is not proof of transaction correctness. Recovery configuration remains unverified.

## Security observations

- Customer web authentication remains Supabase-only. Clerk is restricted to explicit legacy desktop, platform and bearer-token flows.
- Workspace switching verifies membership before changing the HTTP-only workspace cookie.
- Member invitation revoke, role update and removal operations scope mutations to the active workspace and prevent changing or removing the owner through those paths.
- AI tools query with the authenticated workspace ID and expose financial tools only when the role has financial permission. Tool-returned business text is explicitly treated as untrusted data rather than instructions.
- FBR production transmission is fail-closed unless deployment-level production transmission is explicitly enabled.
- Application rate limiting is defense in depth and process-local. Provider, platform and authentication controls remain required for distributed abuse resistance.

## Environment

Local and CI work uses the dedicated hardening branch. No production database URL has been loaded for these integration tests. Integration fixtures use isolated PostgreSQL 16. Production remains untouched until current-head gates and authenticated QA pass.
