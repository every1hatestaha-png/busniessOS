# MunshiOS recovery runbook

## Release facts and safety boundaries

Baseline inspected on 2026-09-28: cebb8f41d564ce261386c0168cc756eba7276cd5, Vercel deployment dpl_6y81cb7KcbNr17BfXnHRF1aBZJUg, project business-os, team KHZR. Recheck current aliases before any recovery. This baseline has a failing lint gate and is not certified production-safe.

Customer authentication uses Supabase. ERP data, internal User IDs and memberships live in Neon/Prisma. Rolling back an application deployment must not relink users, switch auth providers, or reset the ERP database.

Never run integration/finance/fixture-generation scripts against production. Use the disposable PostgreSQL service in CI. Never paste database URLs, auth tokens, FBR credentials, customer records or raw exception objects into tickets or logs.

## Before releasing

1. Record exact commit, deployment ID, schema migration state and current production alias.
2. Run TypeScript, ESLint, optimized production build, unit/integration tests and the finance scenario gate against isolated PostgreSQL.
3. Review migration SQL for destructive changes, locks and backward compatibility. Verify the target against config/database-targets.json. The build wrapper and release workflow contain target checks, but a green Vercel build alone does not certify the full release gate.
4. Confirm preview/test DATABASE_URL differs from production. Check host/database identity without exposing credentials. Verify test auth and FBR configuration cannot send live transactions.
5. Verify tenant/RBAC, transaction lifecycle, print and phone workflows using dedicated dummy accounts and workspaces.
6. Verify Neon retained history, earliest restorable timestamp, and a successful restore rehearsal before schema changes. Current PITR window and backup schedule were NOT verified in this audit: the connected tool requires a project ID and exposes no project-list operation.

## Failed deployment

Keep the existing production alias on the last compatible deployment. Inspect build logs for the failing step. Repair on a branch and rerun gates. If an unhealthy deployment already owns the alias, use Vercel rollback to the last verified deployment only after checking schema compatibility and that it uses the working Supabase auth flow. Check /api/health, authorized readiness, login, dashboard and one dummy transaction lifecycle. Inspect runtime errors after rollback.

## Broken migration

Stop further migrations and deployments. Record the failed migration name and Prisma status without exposing SQL parameter values. Do not blindly mark a migration applied, run migrate reset, or edit an already-applied migration. Reproduce on an isolated database with the same schema. Prefer a reviewed forward repair. Use prisma migrate resolve only after verifying the database's actual state matches the intended resolution. If writes or schema were lost, follow database restore below.

## Database restore

First confirm the correct Neon project and branch, retention window and restore point before the incident. Restore into a NEW branch. Keep the original branch and evidence intact. Rehearse login-to-local-user mapping, membership counts, sales/GRN/payment histories, balanced GL, party balances, and per-product/per-warehouse reconciliation. Account for transactions written after the restore point. Obtain a concrete approved cutover window before switching the production database target. Update the approved target configuration through a reviewed commit if the endpoint changes. Retain the former branch for rollback. Measure achieved RPO and RTO, do not assume plan-level capabilities.

## Authentication outage

Check Supabase service availability, configured public URL/key presence and callback origin, using safe metadata only. Inspect existing session behavior and sanitized server failure events. Preserve internal IDs and memberships. Do not delete users, weaken email verification, or switch customers back to Clerk to bypass an outage. Use a previously verified compatible auth deployment if the outage follows a code change. Test sign-in, sign-out, recovery and workspace selection with the dedicated test account.

## Critical ERP transaction bug

Stop new use of the affected operation and preserve its audit/document history. Record document IDs in an access-controlled incident record. Determine the workspace, product, warehouse, financial entries and concurrent requests involved. Reproduce on synthetic fixtures. Repair the code with a regression test before touching historical data. Use auditable reversal/correction workflows when possible. Never manually change stock or balances without an approved, reconciled correction plan. Reconcile core stock to movement history and warehouse totals, party balances to ledgers, invoice settlements to allocations, and debit totals to credit totals.

## Monitoring and FBR

Use Vercel grouped runtime errors first, then a narrow deployment/time/route filter. The application emits munshios.server_failure with an area and bounded error code for unexpected API failures and exhausted transaction retries. It never logs raw exception text or payloads through this reporter. These events do not configure an external alert destination, retention policy or on-call rotation.

Check authentication error rates and latency with provider/Vercel metadata. Do not log credentials or tokens. Review FBR submission status and sanitized failure details in the workspace. Never resend an uncertain live FBR submission until reconciling its remote result, to avoid duplicate fiscal submissions. Preserve the fail-closed readiness checks.

## Recovery completion record

Record incident, affected period, approved recovery, exact code commit, migration state, old/new deployment IDs, restored branch/timestamp if applicable, reconciliation results, test workspace smoke results, runtime error review, and remaining risks. An HTTP 200 health response alone is not a recovery acceptance test.
