# Sterile migration preparation audit — October 10

Base #318: `ab3f1dc0d61650d30c173e87afda381cc576f83b`; its five exact-head workflows and eight jobs were independently rechecked SUCCESS. Main remains `f369e3549a1ef6b2fbb00a58a1534bdfe35472da`.

## Fixes

- Reject duplicate, mixed-case, unknown and contradictory connection options in both migration and Preview guards, including secondary TLS/routing overrides. Require URL credentials and no fragment. Preserve the exclusive provider-verified direct-host policy.
- Require a reviewed exact SHA, clean checkout, no dotenv files and no inherited engine/database/TLS/debug overrides in the private hosted operator entrypoint. Keep CI/Vercel and missing approval rejected. Align pg TLS verification with Prisma's existing verify-full policy; never emit raw child output or credentials.
- Retain an operator advisory lock from empty-database validation through migration and read-only reconciliation. Reject overlapping runners and any rerun/nonempty schema. PostgreSQL major version, routines/types and extra schemas are checked before execution.
- Verify 132 unique successful entries, one step each, temporal order, all SHA-256 checksums and unchanged migration files during execution. Timeout/nonzero child exit fails closed.
- Attest all 74 tables, enum values and public routines using a PG18 reference fingerprint derived from the unchanged 132 migrations. Reuse the existing schema registry's column/constraint/index/trigger capture; its default Restaurant behavior is unchanged.
- Verify 72 application tables contain no rows and the only application seed data are exactly three immutable global SaaS plan definitions. Tests detect altered plans, a populated recovery table, station-constraint/index drift and unexpected views, rolling back each disposable mutation.

The database URL proves the pinned endpoint, not arbitrary caller-provided Neon IDs. Independently verify provider ownership immediately before execution. A lock protects this runner against another runner, not an unrelated writer. The private trusted operator/host and installed dependencies remain part of the trust boundary. Managed rollback is not automatic or certified.

## Executed local evidence

Entirely NEW disposable PostgreSQL 18.4 cluster at `127.0.0.1:55449`. No existing hosted staging/production data substituted.

- Four focused guard/build suites: **80 passed**.
- Real core rehearsal on a new empty local database: **3 passed**. All **132** applied once; checksum mismatches/pending/failed/duplicates **0**; order PASS. Rerun and real overlapping-client rejection PASS.
- Reference/rehearsal schema fingerprint: `2859c15d188734ee857575e35c0168363c4e2f23ad1e4f18bf6255f4ed594fe1`. Table count 74; empty application tables 72; reviewed global plans 3. Users/workspaces/orders/memberships/GL/inventory counts **0**.
- Five tenant/schema/Restaurant persisted-actor suites: **22 passed**, on a separate new synthetic database.
- Finance: **49 passed**. TypeScript and focused lint passed.
- An initial stricter experiment rejected the legitimate three migration-seeded plan rows. Investigated the existing seed migration, retained its exact row definitions, and reran on another NEW database. No test assertion was deleted; new drift/seed assertions preserve sterility without changing migrations.

Application, dependencies, Prisma migrations/schema, auth, CSRF, financial services and `production-build.cjs` are unchanged from #318. Its 1,727 application tests, full Restaurant/browser/print and zero production-vulnerability evidence are reused explicitly as **base-SHA evidence**, not relabeled as full new-head execution. Targeted exact-head CI adds a new PG18 service rehearsal, finance/tenant verification and actual production-build wrapper with synthetic local data and migrations OFF. Final job URLs/results belong in the draft PR.

## Hosted inspection and boundary

Read-only Neon metadata and catalog queries revalidated `still-hill-08070011` / `br-calm-unit-b4hiv86y`, `neondb`, PostgreSQL **18.6**, exact direct hostname `ep-cool-recipe-b4i2kgez.c-6.us-east-2.aws.neon.tech`. Zero public objects/routines/application relations/extra schemas; migration ledger absent. No customer rows accessed, copied or created; no hosted schema write.

Vercel staging project identity and enabled Authentication/password protection rechecked. Branch-filtered non-decrypted metadata returned no environment variables. Healthy Supabase staging identity is `xerthngocvaqxqxkrnap`. Prepared changes, private execution and failure/rollback boundaries are in [the operator runbook](sterile-staging-private-operation-20261010.md).

**Next required approval:** execute only the reviewed exact-SHA 132-migration operation on the pinned sterile Neon project/branch/database from a private operator environment. Vercel environment changes and protected Preview deployment require separate later approval. Hosted Owner/POS/Kitchen, inbox, managed restore and physical printer acceptance remain unexecuted/blocking. No production readiness claim.
