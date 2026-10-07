# Phase 3: dashboard and navigation composition

Stacked on draft PR #164. No schema or migration changes in this branch.

`lib/verticals/experience.ts` is the presentation manifest. Each persisted
vertical has its own navigation sections, dashboard lead, report catalog order,
and search result order. The same route catalog, business services, finance
panels, search API, RBAC, and tenant context are reused. Composition changes
only presentation; server-side membership, route, API, module, and role checks
from Phase 2 remain authoritative.

TRADING presents trading operations first. MANUFACTURING presents production
and stock first, then explicitly composes purchasing, receiving, sales, finance,
and workspace routes. Its dashboard adds a workspace-scoped production summary
and production action before the existing shared ERP panels. LEGACY preserves
the original ERP navigation section names, route order, dashboard title,
report order, and search order. Enabled legacy industry modules remain visible
through each experience's optional module section. Hiding a route never
revokes an existing entitlement.

The report catalog contains the same reports for all three active ERP
experiences. Manufacturing orders inventory first. Search still returns the
same four data types, but the manifest controls order. Its server query
continues to filter by the authenticated workspace; the manifest runs after
that scope check. Global search remounts on workspace switch so stale results
from the previous tenant cannot remain visible. Desktop and mobile navigation
both use the same composed sidebar. No separate command palette exists in the
current codebase.

RESTAURANT, PROPERTY, and SERVICES define no dashboard, navigation, report
catalog, or search catalog and remain unavailable through the Phase 2 server
guards. No restaurant or property domain model is added. Future customer
requirements can add vertical-specific dashboard widgets and navigation while
using shared core services and preserving tenant checks. New vertical routes
will still require server guards for pages, actions, and APIs.
