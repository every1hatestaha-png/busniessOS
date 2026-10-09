This temporary marker documents the two legacy migrations whose schema was already present in production before Prisma migration history caught up:
- 20260912070000_weighted_sales_defaults
- 20260912194500_saas_control_plane

This is historical context, not a migration-recovery command or release instruction.
scripts/production-build.cjs does not run `prisma migrate resolve --applied`.
Builds skip migrations by default. Apply reviewed schema releases explicitly with
`prisma migrate deploy` only after verifying the approved database identity,
backup/restore evidence, migration checksums, and release authorization.

If schema objects exist but migration history does not, stop and investigate the
exact schema/history mismatch. Never mark a migration applied merely to bypass
a failed build. See the current release certification/runbook for the release
candidate's outstanding migration and staging acceptance requirements.
