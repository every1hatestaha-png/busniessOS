# Restaurant release audit V1.90

This draft continues PR #269 at `3916bedf80d7bf8340f71a2d9bb47dfdae2a758b`. GitHub PRs #266–#269, Restaurant refs, review comments and CI were inspected before editing. #269 was the newest checkpoint, with five successful checks and no review comments. The original local V1.86 checkout was clean and remains untouched.

## Reproduced defects and fixes

1. Replaying a successful POS action created another order, KOT and audit event. Ten concurrent copies also produced distinct orders. POS now submits a persistent request identity. The service serialises equal workspace/request keys, uses the existing immutable `externalReference` and unique index, and checks an immutable audit payload hash. Changed baskets and different actors cannot claim the prior request; permission checks still run before replay. Distinct identities permit intentional identical orders. The browser resets the identity only after success.
2. A direct KOT URL rendered a `PENDING_REVIEW` WhatsApp order. The route now rejects unapproved orders. Confirmed/preparing/ready/completed history remains printable; cancelled KOTs retain the existing prominent do-not-fulfil marking.
3. A null recipe line escaped input validation as a TypeError. Recipe parsing now rejects non-object lines before property access.
4. The production build wrapper could not launch `npx.cmd` on Windows. Only the fixed npx commands use the Windows shell; database target checks continue to use a direct Node process. The intercepted build guard fixture now supports both Windows and POSIX paths/launchers.
5. #269 omitted the completed performance changes from sibling PR #267. Its measured unscoped financial projection returned 22,003 rows, despite bounded displayed queues. The V1.88 scoped projection implementation, migration, regressions and query-plan certification were reused from `0af50879ae6295efdad2ad57faa54cbf55ff2289`. Orders scopes financial reads to the union of its existing active, outstanding-completed and recent-closed queues. The scope supports all 430 visible orders and rejects oversized input instead of silently dropping IDs. The existing 500-payment display cap is disclosed; receipts keep complete per-order history.

## Migration and concurrency

The only added migration is the existing PR #267 migration `20261001140000_restaurant_operational_query_indexes`, containing measured workspace/recency indexes. No new backfill or historical rewrite is introduced. The complete chain is 128 migrations.

The rich upgrade rehearsal preserves hashes/counts across 18 historical tables, including paid and unpaid completed dine-in orders across two distinct tables, partial payments, voids, refunds, partial/full returns and reversal, legacy KOT, WhatsApp pending review, open/closed shifts and OTHER payment evidence. The older staged rehearsal separately preserves pre-V1.82 completed unpaid dine-in and pre-V1.84 cash without shift attribution.

New regressions cover POS replay, ten copied requests, changed payload, separate orders, catalogue changes, malformed carts, workspace isolation, actor changes and revoked financial override permission. Added collision tests hold a PostgreSQL order lock until all three service callers are blocked, then release them and verify terminal state, bank balance, stock/consumption, receipts, balanced GL and tenant isolation for payment/completion/cancellation and return/refund/void races. Existing ten-finalizer, final-payment, refund, last-stock, table and cash-shift races remain intact.

## Certification and limits

`.github/workflows/restaurant-release-audit-v1-90.yml` runs full isolated PostgreSQL 16 UTC/Karachi certification, application and finance suites, Prisma validation/migrations, history rehearsals, lint, TypeScript, production web build, dependency audit, browser/thermal evidence and both broad/scoped query-plan probes. Production release workflow is unchanged. Vercel deployment is disabled for this branch. No merge or deployment is authorised.

The real POS/forms/error/print components use synthetic browser transport. These checks do not authenticate against Supabase/Clerk or exercise provider-backed Next action transport. Staging session expiry, membership revocation, workspace switching and multiple tabs still require approved nonproduction provider acceptance. Service/action regressions cover the corresponding identity and permission boundaries.

Thermal evidence uses synthetic 30-item receipts/KOTs, cancellation, return and refund states. PDF dimensions, retained labels and physical text size are checked, and first/last pages are visually inspected. Physical printers, cutters, paper feed, routing and fiscal compliance are not certified. Workspace branding and table names remain current labels; immutable historical item/financial evidence is preserved.

The broad load probe has 500 menu items, 200 tables, 22,003 orders, 10,003 payments and 2,003 KOTs. The scoped plan probe has 20,000 orders/10,000 payments and 200 visible IDs, verifies the measured indexes and rejects a full order-history scan. Large return/refund/ledger histories and sustained production HTTP/locking load are not established by these probes.

## Operational dependencies and release workflow

Use the V1.88 runbook for backup/restore prerequisites, exact host/database allow-list checks, guarded explicit migrations, failure recovery, post-migration invariants, migration-before-promotion control and compatible rollback/forward fixes. Keep `RUN_PRISMA_MIGRATIONS_ON_BUILD=0`. The workflow does not create backups or enforce Vercel promotion ordering; those remain operator prerequisites.

| Dependency | Classification |
| --- | --- |
| POS/financial code, subject to exact-head gates | CODE READY |
| WhatsApp provider webhook and automatic intake | NOT IMPLEMENTED |
| FBR credentials | CONFIGURATION REQUIRED |
| FBR fiscal/provider approval | EXTERNAL APPROVAL REQUIRED |
| Thermal receipt and KOT printers | HARDWARE VALIDATION REQUIRED |
| Supabase Auth staging setup | CONFIGURATION REQUIRED |
| Legacy Clerk dependency | CONFIGURATION REQUIRED |
| Neon backup, target and historical preflight | CONFIGURATION REQUIRED |
| Vercel deployment ordering and environment | CONFIGURATION REQUIRED |

WhatsApp integration is a code blocker if included in the promised launch scope. Restaurant operational receipts are not certified FBR fiscal invoices. This audit does not establish readiness for an integrated/fiscal launch, nor real production validation. Next: review the combined draft, confirm POS-only versus integrated scope, and complete approved authenticated staging and physical-printer acceptance before release authorisation.
