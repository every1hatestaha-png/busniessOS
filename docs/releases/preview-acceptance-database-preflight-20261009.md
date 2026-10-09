# Release Preview database target safety gate — October 9, 2026

The candidate is not authorized for hosted deployment yet. At the moment the Vercel staging project has a general Preview DATABASE_URL whose branch target is not independently confirmed. Migration-on-build=0 only protects against migrations; it does **not** prevent the app from serving a Preview against that generic database.

This change runs a fail-closed preview acceptance guard **before** invoking `next build`, and only for the two release-candidate git refs listed in `config/preview-acceptance-targets.json` on Vercel. It requires the exact staging Vercel project, `preview` environment, deployment marker, `RUN_PRISMA_MIGRATIONS_ON_BUILD=0`, and an exact approved synthetic database hostname. The checked-in approved host list is deliberately **empty**. Any attempt to deploy the candidate without separate nonproduction database provisioning and human-reviewed host pinning will fail the build.

Do not whitelist the generic Preview endpoint, the staging root, existing staging branch, previous recovery clone, or any database with real customer records. Approved host entries are reviewed code changes subject to PR review and exact-head tests. The guard has no network or database I/O and never logs secrets. It is **not** a replacement for privately setting Vercel branch-specific DATABASE_URL, proving actual database branch identity with the Neon provider, reviewing Supabase auth environment and deployment protection, and receiving an explicit staging deployment approval.

The guard is scoped to these candidate refs and does not alter existing production or legacy preview behavior. The existing build-time migration guard remains unchanged, and the already disabled Vercel auto-deploy rule is preserved. Production is untouched.

Local CI uses synthetic URLs only, no hosted credentials or production data. No actual staging deploy performed.
