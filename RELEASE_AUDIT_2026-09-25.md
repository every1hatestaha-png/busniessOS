# MunshiOS production release audit

Date: 2026-09-25

Purpose: trigger the full pull-request security, auth, finance, typecheck, lint, test, and production-build gates against the current `main` release candidate before production deployment.

Release policy for this audit:

- Do not merge while any required gate fails.
- Fix root causes rather than bypassing checks.
- Re-run the full gate after every fix.
- Deploy to Vercel only after the release candidate is green.
- Perform a production smoke check after deployment, including authentication routing, dashboard, inventory, customers, suppliers, sales, purchases, statements, and printing entry points.
