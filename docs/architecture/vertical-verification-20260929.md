# Isolated vertical migration and isolation rehearsal, 2026-09-29

Environment: a fresh PGlite PostgreSQL 16-compatible embedded database exposed
only on loopback inside the test process. Its data directory and credentials
were created for this rehearsal. No Neon branch, production database, or
customer data was used. This environment does not replace a native PostgreSQL
staging rehearsal before release.

1. Prisma applied all 45 migrations from the parent of PR #164 to the empty
   database using `prisma migrate deploy`.
2. Seeded seven synthetic pre-migration workspaces: WHOLESALER, DISTRIBUTOR,
   RETAILER, MANUFACTURER, and three OTHER. The edge cases were a WHOLESALER
   with manufacturing enabled, an OTHER with restaurant enabled, and an OTHER
   with services enabled. Three synthetic users had OWNER, ADMIN, and STAFF
   memberships across workspaces. Each workspace contained a subscription,
   customer, supplier, product, opening stock transaction, sale, purchase,
   payment, account, cash account, and audit log.
3. Saved a sorted row snapshot of every public table except Prisma's migration
   ledger. Prisma applied the actual `20260929124500_workspace_vertical_identity`
   migration through `prisma migrate deploy`. Compared every table after
   removing only the newly added `workspaces.vertical` field from the snapshot.
   No other row changed. The resulting identities matched all seven expected
   values: MANUFACTURER to MANUFACTURING, WHOLESALER/DISTRIBUTOR/RETAILER to
   TRADING, and each OTHER to LEGACY.
4. The new `tests/integration/vertical-isolation.test.ts` exercised real
   membership and tenant queries through API context, workspace switching,
   customer routes, query and body workspace ID injection, global search,
   industry module checks, a server action, and unavailable verticals.
   Existing tenant parent, manufacturing, services, reports, and reversal
   integration suites also passed.
5. Full suite with integration tests enabled: 113 files and 667 tests passed.
   TypeScript and production build passed after the database run.

No migration defect was found. The initial full-suite attempt used the
PGlite socket server's default one-connection limit and failed on concurrent
clients. Raising its test-only limit to 16 resolved that harness limitation;
no application code or migration changed. The complete rerun passed.

PR #164 remains draft. Before deployment, rehearse on a separate native
PostgreSQL staging instance and verify the same migration and tenant checks
against the merged production-hardening branch. Do not point destructive
integration tests at customer data.
