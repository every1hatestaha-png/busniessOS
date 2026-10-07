# Workspace vertical foundation

## Audit of the existing architecture

`Workspace.businessType` is a five-value Prisma enum: WHOLESALER, DISTRIBUTOR,
MANUFACTURER, RETAILER, OTHER. Onboarding writes it; settings can change it.
The public builder translates restaurant and services to OTHER, and stores the
builder choice in subscription event metadata. That event is not an authoritative
workspace type. The modules table is a separate entitlement/configuration system.
It already exposes restaurant, manufacturing, and services alongside inventory
and accounting. Manufacturing, restaurant, and services pages and server methods
already exist. They must remain accessible to existing customers with enabled
modules until a separately reviewed transition is possible.

The active workspace is selected by an HTTP-only cookie. Both the web context
and API context fetch membership and its workspace from the database. The switch
endpoint validates membership before writing the cookie and redirects to the
dashboard. Role permissions come from that selected membership. The dashboard,
sidebar, global search, reports, settings, and subscription views currently use
one ERP presentation. Route access mostly depends on page-level checks and
module checks. There is no comprehensive vertical route gate across pages,
server actions, and APIs.

## Classification

| Shared core | Trading domain | Manufacturing domain | Coupled today |
| --- | --- | --- | --- |
| Auth, users, workspaces, membership, roles, subscriptions, audit, accounting, cash/bank, expenses, payments, printing | Sales, purchasing, GRN, suppliers, stock, returns, invoices, trade reports | BOM, production runs, consumption, manufacturing inventory | One sidebar and dashboard, mutable businessType in settings, module flags used as industry identity, industry services in one file, finance and trade reports in one navigation |

## Foundation and next boundary

`lib/verticals/registry.ts` resolves the active legacy business type to a
vertical, declares capabilities, dashboard destinations, and fail-closed route
policy for unavailable verticals. Dashboard layout passes the resolved context
to both navigations, and API context resolves it from the same selected
membership. This foundation does not alter module entitlements, legacy route
access, database schema, or onboarding. Existing pages and enabled modules keep
their current behavior. No production data backfill or migration is needed.

Restaurant and Property are unavailable definitions. They cannot be assigned
by the legacy enum, and have no dashboard or capabilities. Before activation,
add an explicit immutable workspace vertical field with a reviewed migration
that preserves every existing row, provision only supported verticals, and
enforce capability checks in all page, action, and API entry points. Separate
navigation and dashboards can then be composed by vertical, while keeping the
same member, accounting, security, and subscription services. Customer domain
requirements are needed before either experience is implemented.

## Compatibility constraints

An existing OTHER row might be an ordinary business, a restaurant builder
selection, or a services builder selection. No automatic reassignment is safe.
An existing trading row can also have manufacturing enabled. Module entitlement
continues to govern those legacy pages. Changing the settings business type
currently changes the resolved presentation; freeze or audit that operation
before introducing a persisted explicit vertical. Current module checks alone
are insufficient to secure future vertical routes, so neither placeholder is
provisionable or exposed to customers.

## Phase 2 persisted identity and security boundary

The `Workspace.vertical` enum stores TRADING, MANUFACTURING, LEGACY,
RESTAURANT, PROPERTY, and SERVICES. It defaults to LEGACY for any creation path
that does not explicitly choose a supported experience. Onboarding explicitly
sets it from the submitted legacy business classification. The migration adds
one non-null column, then maps MANUFACTURER to MANUFACTURING, WHOLESALER,
DISTRIBUTOR, and RETAILER to TRADING, and OTHER to LEGACY. It does not inspect
module flags or subscription event metadata. All existing workspaces retain
ERP navigation, pages, and their existing module entitlements. No RESTAURANT,
PROPERTY, or SERVICES identity is created by onboarding or migration.

The central resolver reads the persisted field from the workspace record
selected through authenticated membership. `businessType` remains a legacy
classification for existing workflows and no longer controls resolution.
Settings displays it read-only. The server action rejects changed or forged
values and does not update it. Vertical transitions require a separately
reviewed operation with authorization, audit, data compatibility, and rollback.

The dashboard and mobile sidebar receive vertical context from the selected
membership. API context resolves the same persisted field. Unavailable
verticals are denied by the web workspace resolver and API context. A dedicated
page allows switching away from an unavailable workspace; the switch endpoint
checks the target membership directly, even when the current vertical is
unavailable. Manufacturing, restaurant, and services route segments use a
server guard that checks the selected workspace and enabled module, including
nested pages. Industry server methods check persisted vertical availability
and module entitlement. Server actions relying on `requireWorkspace` and
`requireWorkspaceModule` therefore cannot bypass the boundary by changing
browser inputs. Global search uses `requireWorkspace` and tenant-scoped queries;
reports use the same workspace context. Ordinary ERP routes remain available
for TRADING, MANUFACTURING, and LEGACY to preserve live behavior.

Vertical identity controls the experience. Modules remain optional entitlements
for legacy ERP capabilities. A TRADING workspace with manufacturing enabled
continues to use it; a LEGACY workspace with restaurant or services enabled
continues to use those existing ERP modules. Neither flag changes identity.
Permissions still come from the membership of the active workspace. All data
queries must continue to scope by the authenticated workspace ID.

The registry declares dashboard destinations and navigation modes; all three
active legacy identities still resolve to the existing ERP dashboard and
navigation. Separate experiences require a reviewed provisioning flow,
vertical-specific route coverage for every page/action/API, dedicated
navigation/dashboard/search/report composition, customer requirements, and
isolated database-backed tenant tests. Restaurant, Property, and Services stay
unavailable until that work is complete. The schema migration and these changes
must be verified together in a nonproduction environment before merge.

New builder and onboarding screens no longer advertise Restaurant or Services as
new workspace experiences. The server creation path rejects forged restaurant
or services module selections, including direct API requests. Existing
restaurant and services module entitlements remain usable in existing ERP
workspaces. The OTHER classification remains selectable as a legacy ERP
business and is never interpreted as either industry.
