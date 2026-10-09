# Operator-only sterile staging database migration

**NOT EXECUTED.** This script exists to make applying the *existing* 132 Prisma migrations to the new empty nonproduction Neon project reviewable and fail closed. It is not called by CI, Vercel, build scripts or an automatic deployment.

## Approved sterile target (provider read-only evidence, Oct 9)
- Project `still-hill-08070011` (`munshios-rc132-sterile-preview-20261009`) in the Neon **Free** organization, AWS us-east-2 / PostgreSQL 18.
- Default branch `br-calm-unit-b4hiv86y` (`sterile-release-acceptance`), database `neondb`.
- Direct endpoint hostname `ep-cool-recipe-b4i2kgez.c-6.us-east-2.aws.neon.tech`.
- Independent read-only preflight confirmed *zero* public tables, no imported customer data.
- This is different from the populated staging root/RC132 child/recovery clones and the business-os production project.

## Controlled operation (requires separate owner authorization)
1. Review the exact release candidate/commit and pinned 132 migration files. Confirm the Neon project/branch identity in Neon dashboard **immediately before running**.
2. Operate from a trusted local machine or private authorized runner with Node 22+ and `npm ci` already completed. Only inject `DATABASE_URL` via a secure local secret manager/ephemeral shell; **never paste credentials into ChatGPT, PRs, workflow files or log artifacts**.
3. In that private operator shell provide `NEON_PROJECT_ID=still-hill-08070011`, `NEON_BRANCH_ID=br-calm-unit-b4hiv86y`, `STERILE_MIGRATIONS_APPROVED=I_APPROVE_NEW_STERILE_DATABASE_ONLY`, and the private Neon `DATABASE_URL` with `sslmode=require`.
4. Execute `node scripts/run-sterile-staging-migrations.cjs` manually **only with approval**. The script refuses CI/Vercel, an incorrect project/branch/host, and any existing public table; then uses the installed Prisma CLI with a timeout.
5. It must print a sanitized `PASS` containing 132 migrations, 74 tables, and zero users/workspaces/orders. Verify additional read-only privacy/tenant checks before any Preview deployment.
6. If any step fails, **STOP**. Do not rerun migrations automatically against a partial schema or try alternate endpoints. Collect private error evidence for review.
7. Configure Vercel staging-only **branch-scoped** environment target privately; ensure `RUN_PRISMA_MIGRATIONS_ON_BUILD=0`. Confirm staging Supabase project, Preview protection and exact head again. **Request separate staging deployment approval.** Never expose this candidate on `munshios.tech` without production sign-off.

The script does not back up or snapshot any root database, change Supabase/Vercel provider settings, or access customers. Managed snapshot certification, hardware printing, real inbox delivery and owner go/no-go remain separate.
