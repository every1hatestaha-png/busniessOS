# RC132 protected staging acceptance, October 2026

This guide is a **controlled nonproduction validation procedure**, not authorization to promote code or alter production. The one-off Vercel Preview is `munshios-restaurant-staging-koqofe1bz-khzr.vercel.app`, deployment `dpl_3XZgnNN4CGvxcNo7iFEZ8CKcmXCu`, revision `e777e3ee88ac410b16a247c3411d814ddd8c8bed`. It points only to Neon child `br-sweet-hat-b5x5nzzz` with all 132 migrations applied.

## Prerequisites

- Vercel project `munshios-restaurant-staging` must remain protected. Never disable project-wide protection.
- The operator must sign in to Vercel to view the Preview, or supply a privately managed, short-lived project automation bypass secret for API smoke tests. **Do not copy the secret into a PR, CI log, chat, URL or issue.** Prefer an injected environment variable or a Vercel authenticated CLI session.
- The health checker deliberately rejects any host or commit SHA other than this reviewed Preview; it never sends credentials to another origin.
- A protected Preview returning an HTML sign-in page, even with HTTP 200, is **not** a passing health check.

## API smoke (operator only)

Run in an authorized environment with Node 22+ and the checked-out reviewed branch, using a secret from Vercel's approved secret manager. Supply environment variables securely, not in shell history:

```bash
export RC132_STAGING_URL=https://munshios-restaurant-staging-koqofe1bz-khzr.vercel.app
export RC132_EXPECTED_SHA=e777e3ee88ac410b16a247c3411d814ddd8c8bed
# VERCEL_AUTOMATION_BYPASS_SECRET must be injected by a trusted secret manager.
node scripts/rc132-protected-preview-smoke.cjs
```

Expected stdout contains only `{"health":"PASS","readiness":"PASS","revision":"e777e3ee88ac"}`. Health and readiness responses are checked for HTTP 200 and JSON, readiness reports `database=ready`, `auth=configured` and exact commit revision. The checker never submits business mutations.

For an operator with authenticated Vercel CLI access, `vercel curl /api/health --deployment https://munshios-restaurant-staging-koqofe1bz-khzr.vercel.app` can also be used for the same read-only verification, and similarly for `/api/readiness`. This alternative must report actual JSON, not a Vercel Authentication challenge.

## Separate real employee acceptance (not completed)

Use *new, non-customer staging-only* Supabase identities confirmed through their inboxes. Only the two existing Restaurant OWNER memberships were present at the last check; cashier/kitchen accounts have not yet been provisioned or accepted.

1. Owner assigns one STAFF membership to POS only, another to KITCHEN only. Confirm assignments are persisted in the isolated Neon child and not in production/staging root.
2. Cashier can open POS, rapidly search/add dishes, choose visible menu categories, create/collect orders, and print a receipt. Cashier must be denied kitchen management, menu settings and direct legacy KOT action submissions.
3. Kitchen worker sees complete dish names, quantities and notes on kitchen board and KOT; can progress preparation but cannot mutate sales, cash shifts, payments, or print customer-sensitive receipts beyond approved contracts.
4. Test 200 READY backlog plus a fresh CONFIRMED order, ambiguous dish names, duplicate fast submissions, stale-role assignment and removed membership; verify server-action/API denials in addition to hidden navigation.
5. In separate workspaces, validate tenant isolation, refunds/void reversals, stock consumption and GL balance.
6. Exercise sign-up, OTP verification, sign-in, password recovery and verified inbox delivery using only staging identities. Current staging Supabase has 7 auth user records but no new dedicated cashier/kitchen inbox acceptance proof.
7. A physical 80mm receipt printer and KOT printer must be used to test long tickets, item notes, cancellation/refund and feed/cut behavior. Generated PDFs alone are not hardware acceptance.

No identity passwords, tokens, one-time verification codes or customer data belong in reports.

## Verified database evidence

- Root nonproduction staging branch `br-delicate-credit-b5lttgnc`: 130 migrations, no `restaurantStation` column/recovery table.
- Isolated child `br-sweet-hat-b5x5nzzz`: 132 applied, 0 incomplete. Twenty legacy table digests/counts matched root after #131-132 (excluding newly added `restaurantStation` value).
- Ledger unbalanced sources 0; orphan orders, items, memberships 0.
- Managed snapshot **restore was blocked by Neon's root-branch quota**, while new snapshot creation was blocked by snapshot quota. Do not delete existing backups or branches as a workaround. Provider-approved backup and restore remains a separate release gate.
- Existing source snapshot `snap-young-firefly-b5ldlejq` was scheduled to expire 2026-10-09T00:00:00Z and should not be treated as long-term recoverability.

## Release sign-off rule

Do not merge the stacked PRs, alter production, or promote the Vercel Preview until protected runtime/API health, real role-based staging acceptance, managed restore plan, email delivery, provider security settings, physical printers and explicit release approval are complete. FBR transmission remains disabled until its credentials/encryption are certified.
