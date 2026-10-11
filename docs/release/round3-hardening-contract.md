# Round 3 behavior and release prerequisites

Base: PR #295, `c520c63f2d62b2542fbb230b9bf43dbf2c547314`.

## Restaurant authority

Completion posts stock and GL and now requires `financial.manage` (OWNER, ADMIN,
MANAGER), as payment void already does. Server actions deny STAFF before invoking
services. Transactions lock and re-read the actor's same-workspace membership;
stale claimed roles, removed membership and foreign actors cannot finalize or void.
Cancellation retains POS station authority; PREPARING/READY retain KITCHEN authority.
The legacy transition service rejects terminal statuses: terminal changes must go
through the integrity service. POS cashier payment collection is unchanged.

## Recovery

Three provider recovery requests per normalized email hash per 15 minutes across
all application workers. PostgreSQL arbitrates admission atomically using its own
clock; rejected requests do not prolong the window. The existing coarse IP limiter
remains. Each request prunes at most 64 hashes older than a day, skipping locked
rows. Hashes are not plaintext emails, but are potentially dictionary-matchable;
do not expose the bucket table. Storage outages fail closed with the same generic
HTTP 200 response. No user provisioning or identity lookup is added.

Migration `20261008160000_round3_recovery_buckets_sales_cursor` is mandatory before
releasing this code. It creates shared buckets and a sales cursor index only.
No managed database is migrated by this branch; build migrations remain disabled.

Email acceptance is separate from budget tests: an operator must verify delivery,
open a fresh Supabase recovery link in the requesting browser, reset the password,
sign in and access the intended workspace/Restaurant. Supabase Site URL must be
the intended deployment origin and Redirect URLs must allow exactly its
`/auth/callback` endpoint (including the recovery `next` query if using exact URL
entries). Recovery template must use Supabase's generated `ConfirmationURL`.
`AUTH_REDIRECT_ORIGIN`, if set, must point at that same approved origin. The code
defaults to `/auth/callback?next=%2Frecovery%2Fnew-password`. No localhost entry is
needed for hosted recovery. This implementation does not change provider settings,
send production recovery email or claim live inbox acceptance.

Read-only staging provider inspection on 2026-10-08 confirmed project
`xerthngocvaqxqxkrnap` is ACTIVE_HEALTHY. The preceding 24-hour unified logs
contained three recovery mentions each in auth and edge streams and zero
`otp_disabled` mentions. These counts are historical provider activity, not
proof of this branch's email delivery. The available connector does not expose
the full Site URL, redirect allowlist or recovery template:
**OPERATOR CONFIG VERIFICATION REQUIRED**. Fresh inbox/link/reset/login acceptance:
**LIVE OPERATOR VERIFICATION REQUIRED**. Provider settings were not changed.
Reference: [Supabase redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).

## Sales API compatibility

Repository callers inspected: GET route and `/sales` page were the only application
list callers; integration tests also call legacy `listSales`. That internal helper
retains its full-list behavior. No repository client fetches the list endpoint.
External consumers are unknown and need release communication.

GET `/api/v1/sales` preserves `{ data: SaleListItem[] }` and adds
`pagination: { limit, hasMore, nextCursor }`. Defaults to 50, bounded 1–100.
Consumers must follow `nextCursor` as the next `cursor` query parameter; the previous
HTTP implementation was **unbounded**, so consumers assuming one response contains
all sales need updating. Sorting is `orderDate DESC, id DESC`. Cursors bind workspace,
search and status; changing filters requires restarting pagination. Optional `q`
(120 characters) and `status` apply to the whole dataset; invalid limits/filters/
cursors return 422. The UI offers server-wide filters, First page and Next page;
browser Back returns to the previous page. Totals explicitly describe the shown page.
This is keyset traversal, not a frozen snapshot: changes to order dates during a walk
can change traversal membership; new rows newer than the cursor appear on restart.

## FBR and schema

Missing/disabled FBR config denies validation and transmission before reading or
claiming a submission, resolving credentials, freshness checks, audit or remote I/O.
Existing encrypted credentials, environment and production transmission guards stay.
See the Restaurant SQL ownership ADR and reviewed read-only registry gate.

The branch disables automatic Vercel Git deployment in repository configuration.
No merge, deployment, cloud infrastructure mutation or production/staging DB access
is part of this batch.
