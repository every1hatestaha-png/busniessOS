# Security stack convergence onto #314

## Scope and ancestry

Base: #314 `b4374316b8cff913c3cb2d76f5e6bce97925f48c`.
Branch: `integrate/security-stack-on-marketing-20261009`.

The original heads were merged locally, in dependency order, preserving their histories:

| Source | Exact head |
| --- | --- |
| #306 | `fb83ed414c0d99a0a6f9fac2acf3c24c631896d9` |
| #307 | `799006c09e2d51b77c64759530bc82d36c591428` |
| #308 | `20b876edbf08314f4760692d33ff978bd8b7a0f9` |
| #312 | `9cc26b34e4f5baa3e5e360dbf182acb94c02ad39` |

All five heads are ancestors of this branch. Main and source branches were not modified. Vercel automatic deployment is disabled for this branch in `vercel.json`, committed before integration and push. No hosted infrastructure, credentials, provider settings or customer data were changed.

## Semantic resolutions

- Retained the security stack's CSRF/CORS, persisted actor/station, financial idempotency, FBR default-deny and migration-target controls without changes.
- Combined durable policy acceptance with #314's allowlisted builder preferences. Signup consent failures and email callbacks preserve only canonical onboarding selections through the legal gate. Authentication and persisted acceptance are still required; supplied role, user and workspace identifiers cannot authorize access.
- Preserved #314 marketing content, all five business types, module dependencies, OTP and recovery primitives. Added the security stack's cookies/refunds legal links.
- Retained the stronger Restaurant browser harness, including quantity controls and single-submission assertions, with the current submit control rather than an obsolete label.
- Regenerated the lockfile normally with unchanged #314 dependency overrides. Removed the obsolete `http-cache-semantics` advisory exception after upgrading to 4.3.0. The audit still rejects production or unapproved development vulnerabilities, including nested paths.
- Enabled the four existing exact-head CI workflows for PRs targeting #314. Added a fail-closed disposable-only runner for the existing opt-in read-performance test in the query-plan job.
- Full CI exposed three stale vertical-isolation mutation fixtures without same-origin evidence. Corrected the successful browser fixtures, retained every tenant assertion, asserted distinct policy/membership denial codes, and added database-backed missing/cross-site proof rejection with zero customer writes. The application CSRF guard was not relaxed.

## Executed local verification

| Check | Result |
| --- | --- |
| Focused security/auth/marketing | 290 passed |
| Consent/onboarding convergence | 99 passed, including 13 new policy cases |
| Disposable performance runner negative guards | 4 passed |
| Focused database authorization/tenant/schema/recovery/pagination | 27 passed |
| Vertical-isolation and CSRF fixtures after full-CI diagnosis | 162 passed; application guard unchanged |
| Finance | 49 passed |
| TypeScript, scoped and application lint, Prisma validate | Passed; application lint has 16 existing warnings, no errors |
| Production dependency audit | Zero vulnerabilities |
| Full dependency audit policy | Passed; two reviewed development-only exceptions remain |
| Query-plan audit and dedicated fixture | Passed |
| Opt-in bounded read performance | 1 passed, five samples, five queries per sample |

Read timings on synthetic local data: 750.95, 128.50, 91.59, 80.79 and 78.29 ms. These are local measurements, not a hosted capacity certification or an SLA.

## Migration evidence

A newly initialized PostgreSQL 16.14 cluster at `127.0.0.1:55448` was used exclusively for disposable synthetic data. The new database `munshios_round3_security_convergence` applied all 132 migrations. Applied SHA-256 checksums matched all repository files; ordering matched; no failed migration was recorded. All previously existing migration files are unchanged.

The three additional migrations are:

1. `20261007183000_user_policy_acceptance`
2. `20261008112000_restaurant_staff_stations`
3. `20261008160000_round3_recovery_buckets_sales_cursor`

Verified nullable policy columns, non-null station default `ALL` and allowed station constraint, recovery hash/attempt constraints, and the tenant-scoped deterministic sales cursor index. Schema-registry drift detection and rollback tests passed. A second new disposable database, `munshios_restaurant_perf`, supplied the existing bulk query-plan and bounded-read fixtures.

Local logs and migration evidence are saved outside the worktree in `outputs/security-convergence-20261009`. Final exact-head CI results and URLs belong in the draft PR description; this document does not promote earlier source-branch CI to current-head proof.

## Remaining acceptance gates

Hosted exact-candidate staging, provider email/inbox acceptance, managed Neon restore, physical 80mm printer acceptance and required operational/legal approval remain external gates. Software browser/print CI does not establish physical printer acceptance. No production readiness claim, deployment, GitHub PR merge, FBR transmission or hosted database operation is authorized by this change.
