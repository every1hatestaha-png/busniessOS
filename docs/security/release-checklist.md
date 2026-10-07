# Security and Legal Release Checklist

Use this checklist for a production release that changes authentication, legal/customer-facing policy, billing, permissions, data handling or security controls.

## Authentication and sessions

- Email/password sign-in succeeds for a verified user.
- Unverified accounts cannot enter protected workspaces.
- Logout invalidates the normal browser session path.
- Password recovery is scanner-safe and requires valid recovery proof.
- Auth/callback/recovery responses are private/no-store.
- Redirect targets are restricted to safe internal paths.
- Legacy Clerk paths cannot silently authenticate normal web traffic.
- Recovery and verification endpoints are rate-limited.
- Configured recovery origins are HTTPS in hosted environments; HTTP is limited to local development.
- Password recovery mutations reject cross-origin browser requests.
- Supabase leaked-password protection is enabled for the production Auth project and security advisors no longer report it as disabled.

## Authorization and tenant isolation

- Every protected read/write resolves the current authenticated user server-side.
- Workspace membership and role are checked before mutations.
- Cross-workspace IDs are rejected.
- Current Terms/Privacy acceptance is enforced at post-login, onboarding, workspace resolution and protected API boundaries.
- Platform-owner audit attribution resolves from the verified Clerk owner identity, not from an unrelated customer Supabase session.
- Stale membership/role changes are rejected.
- Restaurant, finance, inventory and other vertical boundaries remain covered by regression tests.

## Browser and application security

- HTTPS/HSTS enabled.
- CSP present.
- X-Content-Type-Options, frame protection, Referrer-Policy and Permissions-Policy present.
- Auth and sensitive responses are not CDN cached.
- No production secret appears in client bundles, source maps, logs or repository files.
- User-provided content is rendered as text unless explicitly sanitized.

## Dependencies and infrastructure

- Production dependency audit passes.
- Any remaining full-audit advisory is verified as dev-only and explicitly contained.
- Vercel runtime errors reviewed.
- Supabase security advisors reviewed.
- Database migration chain validates on a clean database.
- The target database has the current user policy-acceptance migration before code that reads those columns is deployed.
- Readiness endpoint passes in staging.
- Backup/restore procedure is current for the release.

## Performance

- Signed-out marketing/auth entry pages do not perform unnecessary remote session lookups.
- Protected navigation does not trigger route-prefetch storms.
- Normal page reads do not perform avoidable writes.
- Large decorative auth artwork is not eagerly loaded on mobile.
- Loading states exist for slower authenticated transitions.

## Privacy and legal

- Privacy Policy, Terms, Cookie Policy and Refund/Cancellation Policy are public and linked.
- Signup requires explicit Terms acceptance and Privacy acknowledgement.
- Policy revision dates match the release.
- Data collection/use/retention statements match actual product behavior.
- No certification, compliance or FBR-license claim is made unless it is actually held.
- Pricing/refund text matches the approved commercial offer.
- A legal entity name, business address and dedicated support/security contact should be added before relying on the public terms for scaled commercial use.
- Material policy changes receive appropriate customer notice.

## Release evidence

Record:

- release commit SHA
- CI/workflow results
- staging deployment ID
- tested routes
- readiness result
- runtime-error review
- dependency-audit result
- any accepted residual risk and owner

Production deployment or merge still requires explicit release approval.
