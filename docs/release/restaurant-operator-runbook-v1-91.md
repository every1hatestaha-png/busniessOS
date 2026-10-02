# Restaurant operator release runbook V1.91

This is a reviewed procedure, not authorization to execute a release. This audit performs only isolated synthetic operations. Do not merge, deploy, dispatch the production workflow or use production credentials until a human authorizes that exact release and manifest.

## Release manifest and stop conditions

Before execution, an operator must fill and approve every field: full release SHA; reviewed stacked PRs; final CI run/head; exact source environment/project/branch/database identity; approved database host fingerprint; expected migration names/checksums; source backup identifier/time and encrypted backup location; isolated restore target and evidence; maintenance/write-freeze owner/window; Vercel project/customer domain and frozen promotion method; previous compatible application SHA; smoke workspace/users/roles and account/table/product IDs; printer models/routes; operational monitoring owner. Missing values block release; never infer them from the checked-in fallback project or existing readiness URL.

The intended candidate is POS-only per `restaurant-first-customer-scope-v1-91.md`. Provider/fiscal integration claims require separate completion and approval. Record authenticated staging and hardware results before production authorization.

Tools: Git, Node 22, the exact lockfile dependencies, Prisma CLI via npm, PostgreSQL 16 client tools for logical backup/restore, and authorized GitHub/Vercel operator access. The portable test PostgreSQL bundle here has no pg_dump/pg_restore; the local rehearsal used a complete cold cluster copy instead. That is not a Neon backup validation.

## Freeze and inspect the exact revision

In the reviewed checkout, set `RELEASE_SHA` to the full approved commit. Run:

```bash
set -euo pipefail
test "$(git rev-parse HEAD)" = "$RELEASE_SHA"
test -z "$(git status --porcelain)"
git diff --check "$RELEASE_SHA^...$RELEASE_SHA"
npm ci
npx prisma validate
export RUN_PRISMA_MIGRATIONS_ON_BUILD=0
```

Require full UTC/Karachi, Restaurant/warehouse, application, Finance, historical, TypeScript, lint, build and audit success for that exact SHA. Review the whole release diff, not just the final commit. A later merge/rebase changes the SHA and invalidates the freeze until its gates pass. Never promote a newer unreviewed HEAD.

## Database target and preflight

An authorized operator supplies DATABASE_URL through the approved secret manager, never through a committed .env, chat, command argument or log. First execute the repository guard:

```bash
node scripts/assert-production-database-target.cjs
npx prisma migrate status
```

The guard requires a PostgreSQL scheme, the exact hostname allow-list in `config/database-targets.json` and the exact approved decoded database name. It fails closed on development/unknown hosts. Record only a fingerprint, database identity and result, never the connection string. Before and after any pooler-to-direct conversion, confirm the direct host is separately allow-listed and run the guard on the effective connection. Do not edit the allow-list to bypass a failure.

Inspect `_prisma_migrations` read-only. Require no row with `finished_at IS NULL AND rolled_back_at IS NULL`. Compare existing migration checksums with the frozen checkout; enumerate pending migrations in lexicographic order. A drift, failed migration, changed historical migration or unexpected database identity is a stop condition.

Using an isolated restore of the actual authorized source, rehearse the pending migration chain and compare critical evidence before/after: orders/items, payments/voids/refunds, returns/reversals/allocations, inventory consumption/movements, KOTs/messages, tables, shifts, accounts, GL and audits. Preserve counts and canonical row hashes. Separately identify legacy cash without shift attribution and old completed unpaid dine-in; do not rewrite immutable history to fit newer invariants.

Read-only invariant query for every ledger source:

```sql
SELECT "workspaceId", "sourceType", "sourceId", SUM(debit-credit) AS imbalance
FROM general_ledger_entries
GROUP BY "workspaceId", "sourceType", "sourceId"
HAVING SUM(debit-credit) <> 0;
```

Expected: zero rows. Reconcile any legacy exceptions explicitly before release. Tenant constraints, immutable snapshots and cash/account reconciliation remain mandatory; readiness alone is insufficient.

## Backup and restore prerequisite

Freeze application writes, jobs and promotion. Take the provider-approved snapshot/backup and record its exact branch/database/time and recovery point. Verify restoration into the approved isolated target; an available backup with no restore evidence is insufficient. Keep backup artifacts encrypted and outside Git. Record RPO/RTO and the reconciliation decision for any post-backup transactions.

If using PostgreSQL logical backup, PostgreSQL 16 clients and secure PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD environment configuration are prerequisites. Verify their source identity matches the manifest; do not print credentials. Then:

```bash
pg_dump --format=custom --file="$BACKUP_FILE"
pg_restore --list "$BACKUP_FILE" > "$BACKUP_FILE.contents"
sha256sum "$BACKUP_FILE" > "$BACKUP_FILE.sha256"
```

Restore only after switching those PG variables to the separately approved isolated restore target and verifying its host/database against the manifest. The restore target must differ from production; refuse if it matches either production host in the repository allow-list. Require an empty pre-created isolated database. Then:

```bash
sha256sum --check "$BACKUP_FILE.sha256"
pg_restore --dbname="$PGDATABASE" --exit-on-error --no-owner --no-acl "$BACKUP_FILE"
```

Verify counts/hashes, all necessary roles/permissions/extensions/database settings, then use the isolated restore DATABASE_URL for migration rehearsal and authenticated smoke. Logical backups omit cluster-wide roles and tablespaces; these require separate approved provisioning. No logical or managed-service restore was executed by this audit. [PostgreSQL pg_dump documentation](https://www.postgresql.org/docs/16/app-pgdump.html).

Local synthetic rehearsal: PostgreSQL 16 on loopback port 55433; clean shutdown; copy the complete PGDATA including WAL/transaction state; retain original PGDATA separately; replace it from the backup; verify every copied file hash before start; compare critical database count/hash evidence before/after; confirm 128 migrations; run restored Restaurant settlement and replay checks. Filesystem backup/restore requires the complete cluster and a stopped server, not individual table/database directories. [PostgreSQL filesystem-backup requirements](https://www.postgresql.org/docs/16/backup-file.html).

## Exact deployment path and ordering

`.github/workflows/main_munshios.yml` is unchanged. It runs gates on main pushes. Production migration runs only on workflow_dispatch, after release-gate and desktop-smoke. Workflow concurrency group `munshios-production-release` serializes these runs; it does not stop outside migration clients or Vercel promotion. The workflow converts a recognized Neon pooler hostname to its direct endpoint, applies migrations with three advisory-lock retries and checks migration status. A subsequent job polls an existing fixed Vercel readiness URL for the workflow's first 12 SHA characters. It does not take backups, promote the web application or validate the customer domain/session/printers.

Therefore use this explicit sequence after separate release authorization:

1. Freeze Vercel automatic promotion and verify the approved controlled mechanism. If this cannot be proved, stop before merging or dispatching. Keep `RUN_PRISMA_MIGRATIONS_ON_BUILD=0` for all builds; the guarded opt-in build path is not the standard release executor.
2. Freeze the approved main SHA after authorized merge and its gates. Confirm main cannot move during the operation. Dispatch `main_munshios.yml` on that frozen main ref through the authorized GitHub UI. Verify the resulting run's full head_sha equals the manifest RELEASE_SHA; cancel/stop if different.
3. Confirm backup/restore evidence, target checks and historical preflight are already complete. Allow exactly this workflow to execute migrations; prohibit other Prisma migration workers and migration-on-build. Do not retry a failed migration via another client.
4. Wait specifically for migrate-production to succeed. Verify no pending/failed migrations and run approved read-only post-migration invariants. Stop promotion on any failure. The later readiness job may be waiting; it is not evidence that promotion has happened.
5. Explicitly promote the exact frozen application SHA through the approved Vercel mechanism. Record deployment/project/domain identity and revision. Confirm the readiness URL used by the workflow is the intended environment, and verify the actual customer domain separately.
6. Require `/api/health` HTTP 200. Require `/api/readiness` HTTP 200 with `ok=true`, `database="ready"`, and `revision=RELEASE_SHA.slice(0,12)`. Inspect FBR readiness only within the approved launch scope. Health/readiness success does not authenticate an operator or certify financial history.
7. Complete authenticated Restaurant smoke below, physical acceptance and operator sign-off before lifting the write/promotion freeze. Monitor controlled errors, retry exhaustion, cash variance, stock and GL invariant failures.

## Authenticated staging / post-release smoke ledger

Before production authorization, perform this entire matrix on approved staging using two synthetic workspaces and separately configured owner/manager/staff identities. Repeat the minimal business smoke after authorized promotion using only approved data and procedure; this audit does not execute it.

- Login/logout; refresh; expire/revoke a session after page load. New mutations/direct print URLs must authenticate current identity; expired/revoked users receive the controlled auth path, never data from a cached page context.
- Remove membership/downgrade a role after page load; repeat the stale action. Switch workspace and submit the previous form; it must reject before mutation. Change workspace during an in-flight action; the server-captured workspace must never become another tenant mid-write.
- Open two tabs on the same order; overlap completion/payment/cancellation and replay captured requests after a network interruption. Verify allowed terminal state and exactly-once effects. Refresh during mutation, back after success and double-submit; reconcile history before any fresh intentional request.
- Direct Restaurant and print URLs: unauthenticated redirects; foreign/nonexistent IDs do not expose rows; pending-review KOT cannot fulfil; approved/cancelled/reprint remain correct.
- Dine-in: occupy table, prepare/ready, partial/final pay, complete/release. Takeaway: pay/prepare/complete. Bank payment needs no cash shift. Cash: open, sales, compensation, close; expected ledger cash and counted cash reconcile.
- Partial/full return, refund and reversal; insufficient-stock rejection; tenant-mismatched IDs. After each, compare order, payments, table, stock/consumption, GL balance, account balance, cash shift, compensation and audit evidence. Never accept a successful UI message alone.
- Suspend/expire the workspace after page load. Every Restaurant mutation, including successful POS replay, must reject with controlled read-only feedback; historical views/print stay readable to authenticated members.

Staging credentials are absent in this audit. Do not sign off this matrix from mocks or the synthetic component harness. Attach actual observed evidence for each case to the release manifest.

## Failure, rollback and forward fix

On migration failure, stop new writes/promotion; record failed migration and revision without exposing credentials. Inspect `_prisma_migrations` and schema state on a restored isolated copy. Never mark applied/rolled-back merely to bypass failure. `prisma migrate resolve` requires an authorized, rehearsed repair that matches actual schema state.

Prefer reviewed forward fixes for additive migrations. Application rollback is allowed only if the prior frozen revision is compatible with the already-applied schema and financial semantics; verify compatibility in the restore first. A database restore can lose post-backup transactions and requires explicit outage/reconciliation authorization. Do not undo immutable financial evidence with ad hoc SQL. Keep the freeze until post-repair invariants, readiness and authenticated smoke pass.

Next operator action: review the POS-only scope and draft candidate, supply approved staging configuration, complete the authenticated matrix and physical checklist, and record a provider-specific backup/restore/promotion manifest. No release action is authorized by this document.
