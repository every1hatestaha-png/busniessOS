This temporary marker documents the two legacy migrations whose schema was already present in production before Prisma migration history caught up:
- 20260912070000_weighted_sales_defaults
- 20260912194500_saas_control_plane

Production build recovery is handled idempotently in scripts/production-build.cjs using `prisma migrate resolve --applied` and tolerates Prisma P3008 once a migration is already recorded.
