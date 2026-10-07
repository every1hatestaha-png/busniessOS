# Restaurant server-action runtime failure
On the certified staging SHA9e6ae06852e9355c468795aa71e49d926e37ed26, OWNER opening a zero-cash shift through /restaurant returned HTTP500 at2026-10-03T09:22:39Z. The staging Vercel runtime log reported Next.js errorE352: a "use server" file exported an object. Before/after fingerprints proved no cash shift or other business mutation committed.

The Restaurant actions module exported initialRestaurantActionState alongside its async actions. Move that shared state and its type into action-state.ts, and import the state directly from both client controls. The six server action implementations, authentication checks, entitlements, tenant checks and accounting services remain unchanged.

The regression imports the actual actions module with external services mocked and runs the installed Next.js ensureServerEntryExports validator. It also reproduces E352 when the shared object is included. CI performs these checks, type checking, lint, certified ancestry/guard checks and a web build. This new stacked draft targets architecture/restaurant-staging-readiness-v1-94. Automatic deployment is disabled; commits use [vercel skip].

This change is undeployed. F03 and cash capacity remain blocked on the current staging SHA. A successful build does not establish runtime acceptance; a separately authorized nonproduction deployment and rerun are required.
