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
