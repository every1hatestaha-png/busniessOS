# Private operator runbook: sterile staging migrations

**Hosted execution NOT authorized or performed.** Code preparation and disposable rehearsal do not authorize the operation below. No automatic deployment, hosted migration, environment update, Supabase setting change or FBR enablement is included.

## 1. Obtain narrow approval

Obtain owner approval to apply the existing 132 migrations at the reviewed draft PR's exact 40-character HEAD to ONLY:

- Neon project `still-hill-08070011`, PostgreSQL 18.
- Branch `br-calm-unit-b4hiv86y` / `sterile-release-acceptance`.
- Database `neondb`, direct host `ep-cool-recipe-b4i2kgez.c-6.us-east-2.aws.neon.tech`.

This is the NEW sterile project's default branch, **not** the production project's default branch. Separate later approvals are required for Vercel environment changes and a protected staging Preview deployment.

## 2. Revalidate provider identity immediately before execution

Use authenticated read-only Neon project/branch/endpoint metadata. Confirm the exact project, branch, writable endpoint and PostgreSQL 18. Do not infer provider IDs merely from operator-supplied environment variables. The runner pins the independently verified hostname; it does not authenticate to the Neon control-plane API.

Privately verify zero application relations, routines and types, no extra application schema and no `_prisma_migrations`. Read-only provider inspection on October 10 confirmed these counts are zero. Abort if identity/schema changed. Do not inspect populated original staging branches or customer records.

## 3. Prepare a clean private execution environment

Use a trusted private operator terminal with Node 22+ and Git, outside CI and Vercel. Disable shell tracing, session recording, terminal sharing and environment dumps. Use a clean checkout at the approved SHA and run `npm ci` before injecting credentials. Installation does not need database credentials.

Do not create dotenv files. Obtain the approved existing database role's URL from the secure provider/secret manager and inject it only into the operator process environment. Do not put it in command arguments, history, repository files, chat, PRs or GitHub Actions. Do not create/rotate provider credentials without separate authorization.

Use a canonical direct URL with `sslmode=require`, optional `schema=public` and optional `channel_binding=require`. Duplicate keys, alternate routing/TLS options, file-based TLS overrides and fragments are rejected. The pg preflight and existing Prisma configuration enforce certificate/hostname verification with `verify-full` internally.

Remove inherited `PG*`, `PRISMA_*`, `NODE_OPTIONS`, `NODE_DEBUG`, `DEBUG`, `NODE_TLS_REJECT_UNAUTHORIZED`, `NODE_EXTRA_CA_CERTS`, `RUST_LOG` and `RUST_BACKTRACE` overrides **before starting Node**. A fresh private shell is preferable. These checks supplement trust in the operator machine and pinned installed dependencies.

## 4. Execute once after actual approval

After owner approval and secure process-level `DATABASE_URL` injection, use this private PowerShell shell:

```powershell
$env:NEON_PROJECT_ID = 'still-hill-08070011'
$env:NEON_BRANCH_ID = 'br-calm-unit-b4hiv86y'
$env:STERILE_CANDIDATE_SHA = '<exact 40-character SHA approved by owner>'
$env:STERILE_MIGRATIONS_APPROVED = 'I_APPROVE_NEW_STERILE_DATABASE_ONLY'
node scripts/run-sterile-staging-migrations.cjs
if ($LASTEXITCODE -ne 0) { throw 'STOP: hosted migration or attestation failed' }
```

The approval string is a guard, not evidence of owner authorization. The runner checks exact HEAD, clean tracked/untracked checkout and absence of dotenv files. It acquires an operator advisory lock before checking emptiness and retains it through Prisma and read-only reconciliation. This serializes this runner, not arbitrary SQL tools; prohibit other writers/deployments throughout the operation.

The installed pinned Prisma CLI runs directly, without a shell or network package resolution. Output remains in memory; raw Prisma/driver diagnostics and credentials are never emitted. Timeout/nonzero exit blocks acceptance.

## 5. Verify sanitized acceptance evidence

Require `PASS` with:

- 132 unique successful migrations, one applied step each, no pending/failed/rolled-back entries.
- SHA-256 matching every migration file, correct execution ordering and unchanged files during execution.
- 74 table fingerprints matching the reviewed disposable PG18 schema, including columns/nullability/defaults, constraints, indexes, trigger bodies, enum values and public routines. No unexpected views or application relations.
- 72 empty application tables, zero users/workspaces/orders/memberships/financial/inventory/audit records.
- Exactly three global `saas_plans` rows seeded by migration `20260912194500_saas_control_plane`, with their reviewed definitions. These are static reference data, not customer records.

Preserve ONLY sanitized PASS and approved commit/provider identity. Independently reconcile read-only before Preview deployment. This fingerprint does not certify managed restore or later runtime behavior.

## 6. Failure, rollback and rerun policy

Stop on any failure. Prisma's chain is not atomic across all migrations; partial schema may remain. Do not infer rollback from timeout, process termination, nonzero exit or failed attestation. A child engine may still be winding down after timeout; privately confirm no active migration process/session before recovery.

Do not rerun against nonempty schema, edit migrations, issue `migrate resolve`, force/reset, drop tables or run down migrations. The runner intentionally refuses reruns. Read the ledger and engine/session state only privately for diagnosis; ledger `logs` must not enter shared artifacts. Preserve evidence.

Recovery needs **separate owner approval** for a verified managed restore of ONLY this sterile target, or a NEW empty target with a reviewed policy update. Neither route may copy customer data. No automatic hosted rollback is implemented. Local savepoint/transaction drift tests roll back synthetic mutations, and fresh-database replay reconstructs the schema; these do not certify managed Neon restore.

Clear private database/approval/identity variables after execution. Keep automatic deployments disabled. Stop before configuring Vercel or deploying.

## 7. Prepared Vercel changes — not applied

Target ONLY `munshios-restaurant-staging` / `prj_ytXqF1zAoJjcsBIICz7PryfAczLz`, team `team_wdK3QqWB97M2fiJpgcUTu7El`. Scope additions to **Preview + the exact candidate Git branch**, currently `fix/sterile-migration-attestation-20261010`. Never edit generic Preview, Development or Production values.

| Variable/control | Required candidate value/source |
| --- | --- |
| `DATABASE_URL` | Secret: private direct URL for the exact sterile host/database above; pooled endpoint is not approved by current policy |
| `MUNSHIOS_DEPLOYMENT_ENVIRONMENT` | Config: `staging` |
| `RUN_PRISMA_MIGRATIONS_ON_BUILD` | Config: explicit `0` |
| `NEXT_PUBLIC_SUPABASE_URL` | Config: `https://xerthngocvaqxqxkrnap.supabase.co`; provider metadata confirms healthy `munshios-restaurant-staging` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Matching staging publishable key, supplied privately via provider UI; never service-role or production key |
| `AUTH_REDIRECT_ORIGIN` | Exact protected Preview origin once known, or unset to use request origin; never inherit production/localhost |
| Legacy Clerk variables | Independently verify staging-only values if needed; do not inherit production credentials or change provider settings |
| FBR | Transmission disabled; no live credentials or enablement |
| Preview protection | Preserve Vercel Authentication and password protection; no public custom aliases or bypass token |
| Automatic deployment | Branch remains `false` in `vercel.json`; manual Preview needs separate approval |

Read-only Vercel metadata on October 10 confirmed enabled SSO (`all_except_custom_domains`) and password protection. Non-decrypted branch-filtered metadata returned **no variables** for the new branch. No values were decrypted or updated. Verify branch overrides after separate authorization. The build guard pins project/environment/database and migration-off state, not Supabase keys or provider-side protection.

After separately approved deployment, confirm exact SHA, health/readiness and provider identity. Perform synthetic Owner/Cashier/Kitchen, tenant and recovery/login/inbox acceptance. Managed restore and physical printer acceptance remain pending. Supabase Site URL, redirect allowlist, email templates/SMTP need independent provider/operator evidence; this runbook changes none of them.

References: [Vercel environment variables](https://vercel.com/docs/environment-variables), [Deployment Protection](https://vercel.com/docs/deployment-protection), [Neon connection security](https://neon.com/docs/connect/connect-securely).
