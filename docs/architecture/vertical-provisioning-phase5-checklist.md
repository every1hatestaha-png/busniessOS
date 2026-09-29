# Phase 5 review checklist

- Workspace creation, OWNER membership, subscription, modules, optional checkout preference, and provisioning audit commit in one serializable transaction.
- Browser double submits are idempotent within the submission window.
- API retries may reuse `Idempotency-Key`.
- Existing initial-workspace behavior remains compatible.
- Multi-business owners may create a later distinct workspace.
- Restaurant, Property, and Services remain unavailable.
- Native PostgreSQL gate must pass before merge.
- No merge or production deployment is part of this phase.
