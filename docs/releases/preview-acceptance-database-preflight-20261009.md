# Release Preview database target safety gate — October 9, 2026

The candidate is not authorized for hosted deployment yet. At the moment the Vercel staging project has a general Preview DATABASE_URL whose branch target is not independently confirmed. Migration-on-build=0 only protects against migrations; it does **not** prevent the app from serving a Preview against that generic database.

This change runs a fail-closed preview acceptance guard **before** invoking `next build`, for all deployments on the staging Vercel project (including when Git ref metadata is absent), and also for the release-candidate git refs listed in `config/preview-acceptance-targets.json` on Vercel. It requires the exact staging Vercel project, `preview` environment, deployment marker, `RUN_PRISMA_MIGRATIONS_ON_BUILD=0`, and an exact approved synthetic database hostname. The checked-in approved host list is deliberately **empty**. Any attempt to deploy the candidate without separate nonproduction database provisioning and human-reviewed host pinning will fail the build.

Do not whitelist the generic Preview endpoint, the staging root, existing staging branch, previous recovery clone, or any database with real customer records. Approved host entries are reviewed code changes subject to PR review and exact-head tests. The guard has no network or database I/O and never logs secrets. It is **not** a replacement for privately setting Vercel branch-specific DATABASE_URL, proving actual database branch identity with the Neon provider, reviewing Supabase auth environment and deployment protection, and receiving an explicit staging deployment approval.

The guard is scoped to the staging Vercel project and release-candidate refs. It can intentionally block redeployment of older staging-project previews until a new sterile database target is approved, but does not alter production project or unrelated Preview builds. The existing build-time migration guard remains unchanged, and the already disabled Vercel auto-deploy rule is preserved. Production is untouched.

Local CI uses synthetic URLs only, no hosted credentials or production data. No actual staging deploy performed.


## Sterile Neon host admission — 2026-10-09

Provisioned in the existing **Neon Free** organization, not imported or cloned from any staging/production database:

- Project: `munshios-rc132-sterile-preview-20261009`, ID `still-hill-08070011`; PostgreSQL 18.6, region AWS `us-east-2`.
- Default fresh branch: `sterile-release-acceptance`, ID `br-calm-unit-b4hiv86y`; database `neondb`.
- Provider-reported compute endpoint (not secret): `ep-cool-recipe-b4i2kgez.c-6.us-east-2.aws.neon.tech`.
- Read-only inspection: **zero public tables**, no customer data imported. The schema remains empty; Prisma's **132 migrations are NOT yet applied**.
- The exact endpoint above is now the sole allowlisted host in this draft. Older staging root, populated children, clones, wrong provider regions/hostnames and arbitrary URL routing overrides remain rejected. The branch is explicitly disabled in Vercel automatic deployments.
- **No Vercel environment variable or staging auth/provider setting has been changed**. No application deployment has occurred. A checked-in allowlist is not permission to deploy to the empty schema.

Before any actual Preview: run Prisma migrations through an explicitly approved controlled process **using the private Neon connection string**; verify 132 unique, complete checksums and required table/constraint state; then privately configure the exact branch-scoped `DATABASE_URL` in Vercel with `RUN_PRISMA_MIGRATIONS_ON_BUILD=0`. Re-run read-only Neon project/branch/endpoint attestation immediately before a separately approved deployment. Validate real Supabase staging identities, Vercel protection and readiness. No database credentials in GitHub files, logs or chat.
