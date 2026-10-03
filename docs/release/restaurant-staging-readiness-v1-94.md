# Restaurant staging readiness

The certified V1.93 application calls a production-only database-target assertion before querying its migration ledger. The separately approved staging Neon host is unknown to that assertion, so the current staging `/api/readiness` returns HTTP503 `database: unavailable` even though its 128 migrations were independently verified. This behavior preserves the original production policy, but prevents the staging readiness/revision gate from certifying the approved staging deployment. It is a P2 staging support gap.

This stacked change adds a separate staging assertion. It does not modify `lib/database-target.ts`, the production host list, the production migration assertion, the production release workflow, authentication, tenant guards or financial mutations.

The staging branch of readiness requires all of the following server-side context:

- `MUNSHIOS_DEPLOYMENT_ENVIRONMENT=staging`.
- Vercel system environment variables exposed, with `VERCEL=1`.
- `VERCEL_PROJECT_ID=prj_ytXqF1zAoJjcsBIICz7PryfAczLz`, the separate `munshios-restaurant-staging` project.
- A Postgres URI pointing to database `neondb` on the exact direct or pooled `ep-fragrant-heart-b578tydw` endpoint listed in `config/staging-database-targets.json`, using the default or explicit5432 port.

There is no environment-provided host allowlist, request-controlled environment selection or generic preview allowance. Missing or mismatched staging context fails before any readiness query. Connection-routing query parameters are rejected because the installed Postgres driver can use them to override URI authority fields. Production and historical development database hosts are rejected by the staging assertion. Without the explicit staging marker, readiness invokes the exact original production assertion. The production assertion continues rejecting the staging endpoints.

Accepted staging targets still need a successful database connection and the full shipped migration ledger before readiness reports ready. Pending migrations, connection failures, response redaction, deployment revision and FBR readiness reporting retain their existing behavior.

Vercel's `production` deployment label is scoped to a project. The separate staging project's deployment currently uses that label; it is not permission to use MunshiOS production data. The project identity plus explicit staging marker is required instead of treating any Vercel preview or production label as staging. [Vercel system environment documentation](https://vercel.com/docs/environment-variables/system-environment-variables) documents the runtime project identity and system-variable exposure.

The draft branch `architecture/restaurant-staging-readiness-v1-94` has automatic deployment disabled and must be committed with `[vercel skip]`. This task does not deploy or alter runtime environment variables. The live staging app therefore remains at `9e6ae06852e9355c468795aa71e49d926e37ed26` and keeps returning503 until a separately authorized staging deployment includes this change and explicit context.

Regression coverage verifies all existing production endpoint variants, staging direct/pooled endpoints, missing or wrong deployment context, arbitrary/development/production hosts in staging, malformed URI, wrong database and port, migration checks and failure before database access. CI repeats those checks, type checking, lint, production-guard diff checks and a web build without deploying.

This code change is not authenticated staging acceptance. OWNER access, A01–A24, F01–F07, browser races, capacity measurements and hardware acceptance require separate observed evidence on the exact deployed SHA. `/api/health` alone does not prove database/schema readiness.
