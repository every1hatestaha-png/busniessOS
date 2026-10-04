# Restaurant V1.97 main convergence certification

Status: **IN PROGRESS — nonproduction only**

## Purpose

V1.97 converges the previously certified Restaurant V1.96 stack with the current MunshiOS main auth release before any future production promotion.

Convergence parents:

- Restaurant/V1.96 lineage: `aa6cad246fa1eacaa7cd5b8971065a532afe616a`
- current main: `b9061723ea493a4947d56d7f72749bbb24cf3f8b`
- explicit merge commit: `1e009acb31170e4f19cdd58b323e564f134fbaf9`

The merge was created on the dedicated V1.97 branch only. Production and main were not modified.

## Conflict resolution

The known overlapping paths were resolved deliberately:

- `lib/server/auth.ts`
  - preserves main's durable Supabase identity mapping through `supabaseId`
  - preserves Restaurant workspace vertical resolution and unavailable-vertical guard
- `prisma/schema.prisma`
  - preserves the Restaurant/vertical schema
  - adds nullable unique `User.supabaseId`
- `scripts/production-build.cjs`
  - removes hardcoded Supabase production fallbacks
  - preserves explicit production auth configuration checks
  - preserves Windows `npx` launcher compatibility
  - preserves the production database-target guard before controlled migration-on-build
- `package.json` / `package-lock.json`
  - keeps Next.js 16.3.8
  - keeps `eslint-config-next` 16.3.8 and the Restaurant stack's audited lockfile
- `vercel.json`
  - preserves prior deployment blocks
  - explicitly disables V1.97 preview deployment

Main's auth routes, OTP flow, Supabase client/server configuration, readiness changes, auth tests, workflows and the `20261004144500_user_supabase_identity` migration are included.

## Inherited V1.96 evidence

Before convergence, V1.96 passed:

- PostgreSQL 18 migration chain
- F07/race-focused suite: 49/49
- Restaurant + warehouse suite: 357 passed, one optional performance fixture skipped
- full application suite: 1074 passed, one optional performance fixture skipped
- finance-grade suite: 49/49
- TypeScript
- production web build
- production dependency audit
- 80mm receipt/KOT browser and PDF certification
- managed Neon restore rehearsal
- staging DB reconciliation
- F06 guarded legacy-KOT cancellation staging evidence

That exact-SHA certification is historical evidence only after convergence. V1.97 must rerun the affected gates.

## Staging-derived auth migration rehearsal

The converged auth migration was also applied on a temporary Neon branch cloned from the real Restaurant staging parent:

- project: `wandering-moon-51932710`
- parent staging branch: `br-delicate-credit-b5lttgnc`
- temporary migration branch: `br-curly-wildflower-b5tgb8vv`
- migration id: `bd03bfb4-f623-42e3-b2ee-0f5447c387bf`

Observed schema delta is exactly:

- nullable text column `users.supabaseId`
- unique index `users_supabaseId_key`

The temporary branch retained all 4 existing staging users as unlinked `supabaseId=NULL` rows. Parent and temporary-branch row counts plus deterministic content hashes matched for users (excluding the new nullable column), workspace memberships, Restaurant orders, payments, returns, GL entries and inventory transactions.

The parent staging branch was not changed. Applying or discarding the prepared migration through Neon remains an explicit operator decision; this certification does not silently mutate the pinned staging branch.

## V1.97 hard gates

The V1.97 workflow requires both V1.95 and current main to be ancestors of the candidate and asserts that convergence did not lose:

- durable Supabase identity mapping
- Restaurant vertical routing
- WorkspaceVertical schema
- Supabase identity migration
- fail-closed production Supabase configuration
- production database-target guard
- Windows build compatibility
- dependency version alignment
- V1.97 deployment block

It then reruns:

- npm install determinism
- advisory containment
- production dependency audit
- Prisma validation
- complete migration chain on PostgreSQL 18
- F07/race-focused regressions
- Restaurant + warehouse regressions
- auth/vertical convergence regressions
- full application suite
- finance-grade suite
- TypeScript
- production web build
- isolated receipt/KOT browser + thermal PDF certification

## Remaining external acceptance

Even after green V1.97 CI, these remain operator/hardware boundaries:

1. live authenticated two-tab F07 race on staging
2. physical 80mm customer and KOT printer acceptance
3. customer capacity/latency threshold only if required for launch sign-off

No production readiness verdict is allowed until the exact V1.97 head is green and the required external acceptance is explicitly classified.
