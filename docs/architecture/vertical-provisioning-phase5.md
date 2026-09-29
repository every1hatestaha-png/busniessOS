# Phase 5: transactional workspace provisioning

## Goal

Make workspace creation a single server-side transaction before any new vertical becomes provisionable. This phase does not enable Restaurant, Property, or Services and does not change the persisted vertical migration.

## Transaction boundary

A successful workspace provisioning request now commits these records together:

1. Workspace with explicit persisted vertical identity.
2. OWNER membership for the authenticated internal user.
3. Owner profile name update.
4. Starter workspace subscription.
5. Workspace module entitlement rows.
6. Optional builder checkout-preference event.
7. `workspace.provisioned` audit event.

If an operation inside that boundary fails, the transaction rolls back instead of leaving a workspace with partially initialized subscription or module state.

## Idempotency

Provisioning is serialized per internal user by locking that user's row inside the serializable transaction. The transaction checks the `workspace.provisioned` audit event for the supplied provisioning request identifier before creating anything.

The browser onboarding action derives a request identifier from the authenticated user, normalized workspace payload, selected modules, billing choice, builder selection, creation mode, and a five-minute submission bucket. Repeated browser submits of the same setup in that window resolve to the same committed workspace.

The public workspace API accepts the existing `Idempotency-Key` header and passes it into the same provisioning transaction. CORS already allows this header. API clients that need retry-safe creation should reuse one key for all retries of the same logical request.

The idempotency record is the immutable provisioning audit event. Module flags and business type are never used as idempotency identity.

## Security properties

The authenticated internal user ID is supplied by the server authentication boundary. The client cannot select the OWNER user ID or persisted vertical directly.

Provisioning locks only the authenticated user's row. It does not use a global lock and does not couple tenants.

Restaurant and Services selections remain rejected for new workspaces. Property remains unavailable and has no onboarding path. Existing LEGACY module entitlements are unaffected.

## Vertical responsibility

`Workspace.vertical` remains the experience identity. The server derives the initial value from the currently supported legacy business classification:

- MANUFACTURER -> MANUFACTURING
- WHOLESALER, DISTRIBUTOR, RETAILER -> TRADING
- OTHER -> LEGACY

Module rows are entitlements only. They do not change the vertical.

## Verification gate

The Phase 4 native PostgreSQL workflow also runs on this branch. It validates migrations, the full unit and database-backed regression suite, finance scenarios, TypeScript, and the production build.

A dedicated database-backed provisioning test verifies that repeating one provisioning request creates exactly one workspace boundary with one OWNER membership, one subscription, the expected module rows, and one provisioning audit event. A distinct request remains able to create another workspace for a multi-business owner.

## Remaining boundary before a new vertical

Restaurant, Property, and Services stay unavailable. A future vertical may only become provisionable after its customer requirements, domain data model, transaction rules, server-side route/action/API guards, reporting behavior, printing behavior, subscription compatibility, and migration/rollback plan are implemented and reviewed.
