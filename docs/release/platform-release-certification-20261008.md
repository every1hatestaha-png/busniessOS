# MunshiOS platform release certification — 2026-10-08

Verdict: **CONDITIONAL. Production release is not approved.** Automated backend,
financial, tenant, migration and build evidence is green. Current-candidate hosted
staging, provider configuration/inbox acceptance, managed restore and physical
printer acceptance remain release gates. Production, the source staging database,
provider settings, merges and deployments remain unchanged. Additive SQL was
rehearsed only on a new isolated child of the approved nonproduction Neon project.

## Preservation checkpoint — 2026-10-08

The active project is MunshiOS only. The mistaken Apna Munshi task is stopped;
its existing files are preserved. This checkpoint is saved at the user's request
before the quota limit. No new expensive certification test was started.

The follow-up also fixes the staging release guard's obsolete 131-migration
ceiling. It accepts the reviewed 131/132 catalogs and 130–132 applied prefix,
rejects gaps, duplicates, unfinished/unknown migrations and schema/ledger drift,
and preserves the exact nonproduction endpoint allowlist. The two focused guard
test files passed **36 tests**, with scoped lint and JavaScript syntax checks
passing. An initial sandbox temporary-directory EPERM prevented test collection;
rerunning with a workspace-owned TEMP/TMP directory passed. This was an
environment failure, not an application test failure. New exact-head CI remains
pending until the checkpoint commit is pushed and its workflow completes.

Isolated Neon rehearsal: `br-shiny-base-b5mlm2vq`, named
`munshios-rc132-migration-rehearsal-20261008`, parent
`br-delicate-credit-b5lttgnc`, PostgreSQL 18.6, endpoint
`ep-polished-firefly-b5taxed1`, capped at 0.25 CU. Its initial schema fingerprint
and all 73 table fingerprints exactly matched the source. Migration #131 and
#132 SQL ran in one transaction on that child only: all seven memberships retained
the default ALL station, recovery table was empty, and all original row
fingerprints matched with the new station column excluded. The child ledger
remains at 130 deliberately: this was an **SQL rehearsal, not prisma migrate
deploy**, and the child must not be used as a deployment database. No migration
ledger entries were forged. A suspension request was accepted for its compute;
data and branch are retained. Final idle state should be checked read-only.

Fresh managed backup/restore is **BLOCKED**: snapshot creation returned HTTP 422
`snapshots limit exceeded`; restoring the existing snapshot to a new root branch
with `finalize:false` returned HTTP 422 `root branches limit exceeded`. Neither
attempt created a backup/restore target or replaced the source. Existing snapshot
`snap-young-firefly-b5ldlejq` dates from 2026-10-07, contains 129 migrations and
expires 2026-10-09 00:00 UTC. Existing backups/branches were preserved; no paid
upgrade or deletion was attempted. The normal child clone is not managed-restore
proof. Local cold-restore and complete disposable Prisma-chain evidence below
remain distinct, valid completed evidence.

Resume from draft #297 and the saved external checkpoint. First verify the
checkpoint HEAD and its CI; then test the new guard's database introspection on
a disposable 132-migration database. Do not rerun the child's CREATE statements
or mark its ledger applied. Remaining hosted/inbox/hardware/configuration gates
below have not become PASS results.

## Candidate and evidence attribution

* Production/main: `f369e3549a1ef6b2fbb00a58a1534bdfe35472da`.
* Draft #295: `release/munshios-restaurant-platform-rc-v2-04`,
  `c520c63f2d62b2542fbb230b9bf43dbf2c547314`, targeting main.
* Draft #296: `impl/munshios-round3-hardening`,
  `1fda9010740b02468bd2edb761d121fd33d81e2c`, targeting #295's branch.
* Certification follow-up: `fix/munshios-release-certification`, based exactly on
  #296, targeting its branch. Resolve its exact HEAD and draft PR from GitHub;
  the local final evidence report records both after CI completes.

#295 is 138 commits ahead of main without divergence. #296 is six commits ahead
of #295 without divergence. Both were open, draft, unmerged and mergeable at
inspection, with no submitted reviews or unresolved review threads.
Restaurant remains a vertical inside the single MunshiOS application. The
separate Restaurant staging Vercel project is an environment, not a product.

The backend evidence below was executed at #296's exact SHA, not silently copied
from a former staging deployment. Follow-up CI enforces that its diff is limited
to POS accessibility, browser regression, release-target tooling/tests, documentation, CI and the
branch's automatic-deployment exclusion. Backend, migrations, auth, finance and
API implementations must remain byte-identical to #296 for that evidence reuse.

## Automated certification

[Exact #296 CI](https://github.com/every1hatestaha-png/busniessOS/actions/runs/37758192867):
1,343 unit/integration/Restaurant/tenant tests passed, two opt-in performance tests
skipped; 49 finance tests passed. Prisma validation, all 132 migrations on
disposable PostgreSQL 18, SQL registry, TypeScript, lint and production build
passed. Lint reported zero errors and 19 existing warnings. Five #295 workflows
were also successful at its exact SHA; these are base evidence, not follow-up runs.

Both formerly skipped tests were subsequently executed on disposable local
PostgreSQL 16.14: the guarded financial load fixture and bounded service-read
measurement passed. Two additional probes passed: restored application reads /
transaction rollback, and concurrent bounded reads. Full backend suites were
not rerun merely to duplicate their unchanged exact-head evidence.

The load fixture contained 22,003 orders, 10,003 payments, 500 menu items,
200 tables, 2,003 KOTs, one return, one refund and one cash shift. Return/refund/
cash rows were produced through real guarded services. Query plans and raw
timings are saved in the local evidence bundle; this is synthetic local data,
not a hosted production capacity claim.

Five waves of aggregate metrics + 40 bounded live orders produced:

| Callers | Successful samples | Rejections / retries | p50 ms | p95 ms |
|---:|---:|---:|---:|---:|
| 2 | 10 | 0 / 0 | 127.36 | 417.57 |
| 4 | 20 | 0 / 0 | 126.36 | 359.16 |
| 6 | 30 | 0 / 0 | 167.30 | 341.91 |
| 10 | 50 | 0 / 0 | 179.50 | 240.19 |

These are local service reads, including connection/initialization effects. They
do not establish concurrent write capacity, hosted latency, an SLA or an SLO.
Payment/completion/refund/return/table/stock races are covered by #296's real-DB
integration suite. Hosted capacity and authenticated multi-tab acceptance remain
distinct staging work.

Thirty-eight HTTP probes passed their expected outcomes: public pages, protected
redirects, API authentication, foreign CORS, cross-site recovery denial, generic
empty-email response, production health/readiness and apex-to-www redirects.
Local production-mode readiness intentionally rejects the loopback database;
that negative safety result is not a positive local readiness claim. Use the
local Next server's canonical localhost origin for its form-origin checks.

## Database and restore

There are 132 migrations. Only three are added relative to main:

1. `20261007183000_user_policy_acceptance`: four nullable user acceptance fields.
2. `20261008112000_restaurant_staff_stations`: non-null station with safe `ALL`
   default and `ALL/POS/KITCHEN` check.
3. `20261008160000_round3_recovery_buckets_sales_cursor`: shared hashed-email
   recovery buckets with attempts/hash checks and expiry index, plus deterministic
   sales pagination index. No customer data or plaintext email is copied into it.

The additions are compatible with the previous application's schema. New-code
deployment must follow migrations. The sales index uses ordinary CREATE INDEX;
schedule its write-lock window based on actual target size/traffic and abort on
unexpected contention. No destructive downgrade migration is recommended.

All 132 applied local migration checksums match repository bytes. A cleanly
stopped disposable cluster was cold-backed-up and restored into a new local
cluster using identical PostgreSQL 16.14 binaries. The restored cluster started
on a separate loopback port. All 74 public tables, migration checksums, columns,
constraints, indexes, triggers, function definitions and data digests matched:

* Schema SHA-256: `884988ab73bd7c2e962bcf44b2568c7f1d6957565dc2dc23cabf9161214b31ca`.
* Data SHA-256: `1c4cb6cd576be5c4bc921d268831a9ff3b045a16aad2948b6ffdc381bacee61c`.

Real current services read the restored completed order, stock 9 from 10 and
balanced ledger. A forced rollback left no temporary recovery bucket. Both
synthetic authorization fixtures retain exactly one completed order, stock 9 and
GL difference 0.00. The read-only registry passes for all 18 SQL-owned tables.

This certifies a local cold physical restore, not Neon managed PITR/snapshot
restore. Managed restore still requires an explicitly approved isolated target,
source/target fingerprints, backup timestamp, restoration and post-restore
reconciliation. Never restore over a live source or claim the local PG16 backup
is directly restorable into PG18.

## Authentication and security

The implementation retains password recovery via resetPasswordForEmail, generic
responses, no recovery provisioning, safe internal redirects, PKCE callback,
scanner-resistant token-hash confirmation, short-lived recovery marker and fresh
provider proof. Password changes require confirmed provider user plus marker plus
fresh signed claims; an attacker-set marker alone is insufficient. Customer web
auth uses Supabase. Clerk remains confined to legacy desktop/platform/bearer paths.
Local identity linking requires a verified email and rejects conflicting provider
identities. Workspace selection resolves persisted membership; client path headers
are overwritten in Proxy before station authorization.

Distributed recovery tests admit only three requests per normalized email in a
15-minute bucket under concurrency (including expired-window races), fail closed
on storage failure and keep denied responses generic. The HTTP/DB provider-mocked
test sent three provider calls for 12 requests and created no user. This proves
application behavior, not actual SMTP delivery. Coarse process-local IP limiting
is supplemental and must not be mistaken for distributed enforcement.

Completion and payment void recheck locked persisted membership and financial
permission. OWNER/ADMIN/MANAGER financial actions and cashier/kitchen transitions
have positive coverage; direct STAFF, removed/foreign/stale membership cases have
negative coverage with unchanged GL, stock and audit snapshots. FBR missing or
disabled tenant configuration produces zero remote calls and zero submission/
audit changes in the regression tests. Encryption and environment guards remain
in place. Production readiness reports encryption configured and transmission off.

Fresh npm production dependency audit reports zero advisories. Cookie handling,
same-origin web guards, CORS, safe redirects, protected route/API authorization,
tenant predicates, legal acceptance, secret exposure patterns and changed permission
gates were inspected. Browser checks covered public 1440px/390px rendering, no
horizontal overflow, one main/h1, image alternatives and labelled auth controls.
This is targeted accessibility evidence, not full WCAG certification.

The follow-up fixes three unnamed POS basket icon buttons and adds real browser
role-based interaction checks for increase, decrease and removal. It also corrects
the obsolete note claiming builds automatically resolve migration history.

## Existing staging and remaining gates

* Vercel staging: `prj_ytXqF1zAoJjcsBIICz7PryfAczLz`,
  `munshios-restaurant-staging`, separate from production `business-os`.
* Latest inspected Ready deployment: `129691790ac5f85ebcc3def01bf26b201a981360`,
  `munshios-restaurant-staging-l8r6r1yps-khzr.vercel.app`. It is protected by Vercel
  SSO and is older than the candidate. #296 has no deployment in that project.
* Neon project: `wandering-moon-51932710`, named `munshios-restaurant-staging`,
  branch `br-delicate-credit-b5lttgnc`, database `neondb`, PostgreSQL 18. The branch
  is named `production` inside this staging-only project; that label is not the
  MunshiOS production database identity. It has 130 applied migrations, no failed
  entry, and lacks the station and recovery/index migrations. No migration was run.
* Supabase staging: `xerthngocvaqxqxkrnap`; production: `wunynhbseytthrwceqhg`.
  Vercel public Supabase URLs point to their respective distinct projects. DB env
  values were not decrypted. Verify the Vercel-to-Neon connection identity securely
  before execution rather than inferring it from a variable's presence.
* Both providers' security advisors currently warn that leaked-password protection
  is disabled. This is an unresolved provider control, not a silently waived PASS.
* Staging and production have the **same live Clerk publishable key**, confirmed
  by comparing public values in memory without exporting them. Customer web auth
  is separated through Supabase, but legacy Clerk isolation is not established.
  Do not run staging legacy desktop/platform auth acceptance against that provider.
  Separating the staging Clerk instance or disabling its legacy integration needs
  explicit configuration approval; no production credentials were retrieved or changed.
* Staging reconciliation: four workspaces, seven memberships; zero duplicate local
  email groups, cross-tenant payment/menu references, negative product stock or
  unbalanced GL documents. This is historical staging state, not new-head execution.

**OPERATOR CONFIG VERIFICATION REQUIRED:** Site URL, redirect allowlist, email
templates, SMTP configuration and leaked-password protection. Choose the approved
candidate's actual HTTPS staging origin after its authorized deployment. Set Site
URL to that origin (not localhost), allow that origin's
`/auth/callback?next=%2Frecovery%2Fnew-password`, and verify signup/confirmation
routes used by the chosen templates. Default recovery template should use
`{{ .ConfirmationURL }}` so the supplied redirect is honored. A custom token-hash
template must target the supported `/auth/confirm` recovery flow with the correct
staging origin; do not mix it with a stale branch override. AUTH_REDIRECT_ORIGIN
metadata currently shows an override only for the old v1-98 branch, not the new
candidate. Verify canonical origin, provider settings and delivery separately.

**LIVE OPERATOR VERIFICATION REQUIRED:** after approving a current-candidate staging
deployment, use a controlled synthetic inbox in that staging project. Sign up,
receive/open a fresh verification email, confirm, log in, log out, request recovery,
open its fresh link in the requesting browser for PKCE (or the configured token-hash
flow), set a new password, log in again, renew/revoke the session, and open the
existing workspace and Restaurant. Record origin, deployed SHA, HTTP/UI outcome
and preserved user/membership IDs without logging passwords, tokens or codes.
Then execute authenticated owner/admin/manager/POS/kitchen role and multi-tab tests.
Do not reuse stale mail or alter production users.

Sales GET now defaults to 50 and caps at 100, retaining `data` plus pagination
metadata. Tests traverse all 125 tied-date sales once, reject foreign/filter-bound
cursors and find records beyond the first page. Internal callers were updated.
Unknown external integrations need acceptance and release notice because formerly
unbounded consumers must follow `pagination.nextCursor`.

Current print contract tests and synthetic receipt/KOT content checks pass.
Software PDF pagination is a follow-up CI gate with 80mm page-box assertions,
long tickets, cancel/refund states and no browser errors. Actual hardware remains
pending: approved printer/driver, 80mm roll and printable width, long-name/30-line
receipt and KOT, notes/modifiers, reprint/cancel/refund labeling, printer routing,
feed/cut, repeated jobs, reconnect and cash-drawer behavior if required.

## Approved-release sequence to execute later

1. Review the stacked drafts and exact heads; explicitly approve integration and
   cloud/database operations. Preserve #295/#296 histories and the follow-up fix.
   Refresh CI if any backend, schema, permission or contract change occurs.
2. Securely verify staging Vercel project, database endpoint/project/branch/name,
   Supabase project and resolve the shared live Clerk configuration. Review the two pending migrations
   and checksum list; capture a managed backup and prove an isolated managed restore.
3. With separate approval, run the staging database target guard and one controlled
   `prisma migrate deploy`; verify 132 completed migrations/checksums and registry.
   Keep RUN_PRISMA_MIGRATIONS_ON_BUILD=0. Do not use migrate reset, db push, or
   migrate resolve to conceal mismatched history.
4. With explicit deployment approval, deploy the reviewed exact candidate only to
   the existing staging project. Verify deployed revision, readiness, health,
   environment identity, provider configuration and FBR transmission remaining off.
5. Complete the fresh inbox/authenticated role/tenant/multi-tab and hosted capacity
   acceptance above, external sales consumer compatibility, legal business-detail
   sign-off and physical receipt/KOT acceptance. Record actual timings without
   inventing a service-level target. Stop on any newly reproduced P0/P1/P2.
6. Only after all gates pass, obtain explicit main-merge and production-release
   approval. Integrate in dependency order (follow-up into #296 branch, #296 into
   #295 branch, #295 into main), preserving histories and reviewing each final SHA.
   Revalidate final integration CI and candidate staging evidence before production.
7. Verify the approved production identity and migration/checksum/schema state
   read-only. Capture production backup and prove the managed restore route before
   authorizing one controlled production migration. Apply only genuinely pending
   reviewed additive migrations; verify status and contention, then deploy the
   exact approved artifact with builds still skipping migrations.
8. Verify revision, health/readiness, synthetic controlled auth acceptance under
   its separate approval, finance/stock/tenant reconciliation, monitoring and
   rollback readiness. Keep FBR transmission disabled absent separate provider and
   transmission approval. Record observations and hand over operations.

For an application rollback, restore the previously approved deployment while
retaining compatible additive schema. For data corruption, pause writes and use
the approved managed-restore procedure into a separate target; reconcile before
any cutover. Do not drop release tables, remove migration ledger entries, overwrite
customer data or repoint production DNS/database autonomously.
