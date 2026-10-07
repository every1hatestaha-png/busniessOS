# Data requests and hardening release limits

## Operator workflow for data requests

Use the existing private commercial/support channel until the business owner supplies a dedicated published contact. Do not invent an address or contact, promise an unapproved deadline, or represent this document as legal advice.

1. Verify the requester's identity through the normal authenticated account and establish the workspace owner's authority. A matching email in a message is insufficient. Record request scope, authorization, assigned operator and outcome in the private support record.
2. For access/export, use existing tenant-scoped reports and document exports permitted by that user's role. The product does not yet offer a comprehensive self-service portable account export. Review exports for other users' personal data before delivery through the existing private channel.
3. For correction, use supported application edits. Posted financial/tax/FBR records require an authorized reversal or correction workflow; never rewrite their immutable history with SQL.
4. For access removal, the authorized owner uses supported member removal/role changes. Re-read membership on subsequent operations. Provider logout revokes refresh sessions; an issued JWT can remain valid until expiry, so membership checks remain essential. Do not promise instantaneous revocation of every issued access token.
5. For workspace closure/cancellation, verify billing and the owner's authority; document the agreed access, export and retention arrangements. Cancellation does not delete accounting history. There is no automated erase-all-workspace workflow.
6. For deletion/anonymization requests, obtain a documented retention assessment for accounting, tax, audit, security, FBR and backup records. Only remove eligible data through a separately reviewed scoped operation. Do not delete immutable records or a provider identity before considering remaining memberships, ownership and identity mapping. Backup expiry, legal hold and third-party deletion require operator coordination.

The business owner must approve retention periods, governing-law/dispute text, the legal entity and address, tax/registration disclosures, support/security contacts and commercial refund handling. Public policy drafts are not evidence of lawyer approval or certification.

## Residual controls requiring operator review

- The application rate limiter uses an in-process Map and trusted hosting IP headers. It resets with instances and cold starts; it is defense in depth, not a distributed or authoritative multi-instance quota. Supabase provider limits are separate. Confirm deployment-wide abuse protection and provider limits before production approval. No new paid infrastructure is enabled by this release.
- The customer CSP currently restricts base URI, objects, embedding, form targets and mixed content. It does not implement a nonce-based script allowlist; it must not be described as complete XSS prevention. A nonce rollout needs browser acceptance across Next.js, Supabase and legacy Clerk paths.
- Staging Supabase security advisory review found leaked-password protection disabled. Enabling it may require a supported plan and operator approval; no production settings are changed here.
- Physical printer acceptance remains distinct from synthetic browser/PDF verification.
- Inbox delivery, real recovery-link activation/password replacement and fresh confirmed signup require an approved inbox. A mock token or direct provider login is not proof of these steps.

## Controlled nonproduction migration build

Only after exact-head CI passes, create a preview deployment on `munshios-restaurant-staging` with the one-deployment build command:

```text
node scripts/assert-staging-database-target.cjs && npx prisma migrate deploy && npm run build
```

The guard runs in Vercel against the actual configured DATABASE_URL without exporting it. It refuses every other Vercel project/environment, recognizes only the verified approved staging Neon endpoints, validates all applied migration checksums and allows only the additive policy migration to be pending. It records a non-secret endpoint/branch fingerprint and pre-migration counts. Reconcile migrations, users, memberships, workspaces, orders and orphans afterward. Normal builds continue to skip migration execution. This command must never be used for production.
