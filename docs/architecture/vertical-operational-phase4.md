# Phase 4 operational boundary

This branch stacks on draft PR #165. It does not enable a new vertical or change the schema. No production database or customer data is used.

## Entry point inventory

`vertical-entrypoints.json` enumerates every App Router page, API route, and exported server action found under `app/`. Categories are `SHARED_CORE`, `TRADING`, `MANUFACTURING`, and `LEGACY_COMPATIBILITY`. There are no Restaurant, Property, or Services vertical entry points. Existing `/restaurant` and `/services` paths are explicitly legacy module compatibility, available only in active ERP verticals with the corresponding enabled module. Public marketing pages named for industries remain shared public content.

Dashboard pages inherit authenticated membership and vertical availability from the dashboard layout and call scoped services. API v1 uses authenticated API context, apart from workspace creation and switching which authenticate the user and validate creation or target membership. Search and AI resolve authenticated server workspace context. Legacy module read and mutation services enforce persisted vertical availability and module entitlement. Manufacturing services do likewise. Module entitlement never changes the persisted vertical. RBAC and subscription checks remain separate. The inventory script and unit test fail when entry points change or an inventory boundary remains unreviewed. The inventory is a review aid, not a security enforcement substitute.

## Switching and caches

Workspace switching verifies membership before setting the server cookie. The client performs a full document navigation to `/dashboard` after a successful switch. This discards the prior React tree, Router Cache, mounted client requests, and stale layout state. Existing search requests abort on unmount. Product creation drafts now include the workspace ID; edit drafts include both workspace and product IDs. AI history already uses a workspace key. GRN draft keys use a workspace-scoped purchase order ID. Server auth uses React `cache` only within one request and reads the selected workspace cookie. Database services query by workspace ID. API v1 and search responses have `no-store` headers; search requests also use `no-store`. No tenant data is stored in Next persistent cache. Browser behavior still needs authenticated end-to-end observation on the target deployment before merge.

## Native PostgreSQL gate

`.github/workflows/vertical-phase4.yml` provisions a fresh PostgreSQL 16 service database for this PR. It deploys every pre-vertical migration, seeds synthetic legacy workspaces, modules, memberships, subscriptions, and ERP rows, then deploys the actual vertical migration. The script checks exact backfill mapping and equality of every table row apart from the new column and Prisma migration ledger. It checks enum labels, NOT NULL/default, primary key index, new row default, SQL rollback, Prisma enum read and transaction rollback, and direct storage of all unavailable identities. The workflow then runs the full database-backed suite, finance suite, typecheck, and production build. It has no production secrets and no deployment step. Exact native results must be recorded from the completed CI run, not inferred from local embedded PostgreSQL.

The vertical migration is additive and does not remove `businessType`. Recovery before deployment uses a backup and staging replay. If deployment fails before commit, PostgreSQL rolls back the migration transaction. Once applied, do not drop the enum or column to roll back an application release. Restore the prior application version while retaining the additive column, investigate using a database snapshot, then ship a corrective forward migration if necessary. Test this procedure against a disposable native database before production approval.

## Future provisioning contract

Only an authenticated user may create a workspace. Public input selects an existing supported business type, never a raw vertical. Server policy maps MANUFACTURER to MANUFACTURING, WHOLESALER/DISTRIBUTOR/RETAILER to TRADING, and OTHER to LEGACY. RESTAURANT, PROPERTY, and SERVICES are non-provisionable even if the request supplies their names or module flags. Defaults and requested optional modules must pass server policy. Owner membership is created for the authenticated user. Subscription and module records must be compatible with the selected vertical. A future provisioning command should use one serializable database transaction for workspace, membership, subscription, module rows, and audit event, with a stable idempotency key unique to the user. Retries return the same workspace. A failure rolls back every row. The current onboarding creates the workspace and membership atomically, then initializes subscription and modules separately. That split is a remaining blocker before enabling a new vertical, not a contract to reuse as-is.

## Future vertical transition contract

Settings cannot change `businessType` or `vertical` to transform an experience. A future platform-only transition must require fresh administrative authorization, target-vertical availability, a compatibility preflight of data, module entitlements and subscription, an audit record of before/after and actor, and one transaction for state updates. Make a restorable snapshot before executing. Retain old domain data and define explicit reversibility. No public route, API, form field, or customer action exposes this transition today.

## Remaining gates

Native PostgreSQL CI must pass and its logs must be reviewed. An authenticated browser switch rehearsal should observe dashboard, sidebar, mobile navigation, reports, branding, currency, timezone, print context, role, subscription, and pending requests across differing workspaces. The current server tests verify the trusted context and tenant queries but do not replace that visual observation. Provisioning must become one transaction with audit and idempotency before any new vertical is provisioned.
