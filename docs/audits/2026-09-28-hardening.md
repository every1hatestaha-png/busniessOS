# Production hardening ledger

Baseline: cebb8f41d564ce261386c0168cc756eba7276cd5.
Production at inspection: dpl_6y81cb7KcbNr17BfXnHRF1aBZJUg.
Scope: all seven priorities requested on 2026-09-28. No production writes performed.

## Release gates

- P1 confirmed: baseline finance and release workflows fail ESLint in forgot-password/page.tsx (synchronous effect state update). Authentication semantics must remain unchanged.
- P1 investigating: customer/supplier returns replay any payload sharing a key without detecting conflicting requests.
- P1 investigating: receipt-specific supplier returns do not include earlier unscoped returns in their quantity limit.
- P1 investigating: independent rounding of partial customer returns can cumulatively refund more or less than the sold line.
- P1 investigating: sale edits remove original SALE inventory movements. Review existing document snapshots before selecting a compatible history fix.
- P1 verification gate: authenticated test account and two dummy workspaces have not yet been established in this session.
- P1 verification gate: Neon project ID and actual recovery retention are not yet verified. Do not infer them from plan marketing.
- P2: review printable documents, phone layouts, and optional onboarding steps.

## Coverage status

1. ERP integrity: source review and existing-suite baseline underway.
2. Accounting integrity: partial-return rounding investigation underway.
3. Printing: pending rendered verification.
4. Security: central API context validates membership against the workspace cookie. Endpoint and authenticated cross-tenant coverage pending.
5. Mobile: pending browser verification.
6. Onboarding: pending code and browser review.
7. Backups and monitoring: Vercel reports no grouped errors for the inspected last hour. This is not proof of transaction correctness. Recovery configuration pending.

## Environment

Local checkout uses a dedicated branch. No production database URL has been loaded. Integration fixtures must use isolated PostgreSQL only. Existing CI provisions PostgreSQL 16 for integration and finance tests.
