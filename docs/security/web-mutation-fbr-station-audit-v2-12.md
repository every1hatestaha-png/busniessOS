# Web mutation, FBR and Restaurant station audit — 2026-10-08

Base: draft [#306](https://github.com/every1hatestaha-png/busniessOS/pull/306), exact `fb83ed414c0d99a0a6f9fac2acf3c24c631896d9`.
Isolated branch: `fix/web-mutation-fbr-station-audit-v2-12`. Resolve the follow-up exact HEAD and CI in its draft PR.
Restaurant remains a vertical inside MunshiOS. No migration, hosted deployment, provider/DNS change, real inbox, credential lookup or customer-data access was performed. This branch's Vercel automatic deployments are disabled.

## Findings and fixes

1. **CSRF:** both origin helpers accepted absent Origin. The API guard only covered API v1 in Proxy; AI chat relied on a wrapper with no CSRF check. Next Server Actions compare supplied Origin against Host, but missing-header requests require our fail-closed application guard. All unsafe methods now use a shared request policy in Proxy, including recovery/desktop pages previously excluded from its matcher. apiHandler also checks the actual Request before handler execution; the four hand-written browser POSTs retain their own strict same-origin guard.
2. **Cookie versus bearer:** cookie requests require positive same-origin Origin, or (when Origin is absent) same-origin Referer / protected same-origin Fetch Metadata. Cross-site, same-site sibling, opaque/null, malformed or contradictory evidence is denied. Origin and Fetch Metadata both absent, with no same-origin Referer, is denied even when an attacker adds Authorization. A cookie-free API-v1 Bearer client remains supported; a localhost Expo Bearer client keeps its explicit CORS allowlist. Cookies are not admitted by that cross-origin exception. No authentication is granted by this policy: the existing provider and membership checks still run.
3. **FBR:** invalid runtime environments previously selected the production URL. Low-level validate/post calls had no production transmission switch. The client is now server-only, validates the provider environment/operation, and denies production network calls unless the exact switch is 1, VERCEL_ENV is production, VERCEL_PROJECT_ID is the approved business-os project, and the deployment is not identified as staging. Credential readiness/resolution use the same policy. Tenant enabled and configured environment are checked before reading/claiming a submission, followed by submission-versus-configured/expected environment checks. Disabled reference-option/product-mapping requests also stop before remote I/O. Owner-only connection setup requires explicit enablement before verifying a supplied token, checks production policy, and verifies encryption availability before sending a credential.
4. **Restaurant:** existing persisted station/page/API gates and locked actor/service authorization were retained. New tests exercise actual page-context and API authorization, next-request station changes/removal, Proxy overwrite of spoofed internal paths, and denied receipt/KOT variants before document loading. No station rights were expanded.

## Client compatibility contract

| Client/request | Decision |
|---|---|
| Browser write with exact same-origin Origin, metadata absent or same-origin | Allowed to proceed to authentication |
| Missing Origin, same-origin Referer; or same-origin Fetch Metadata without Referer | Allowed to proceed to authentication |
| Missing Origin + Fetch Metadata + Referer on a cookie write | 403 UNTRUSTED_ORIGIN |
| Cross-site or same-site sibling cookie write | Denied |
| Bearer plus ambient cookies, without web origin proof | Denied; cannot silently authenticate through cookie fallback |
| Native API-v1 Bearer, no Cookie / browser provenance headers | Allowed to proceed to bearer validation |
| Explicit localhost Expo API-v1 Bearer, no Cookie | Allowed by existing development origin list |
| Expo cookie-authenticated cross-origin write | Denied; CORS no longer emits Access-Control-Allow-Credentials |
| GET / HEAD / OPTIONS | Existing behavior preserved |
| POST /api/webhooks/clerk | Exact Proxy exemption; signature/timestamp verification required in route |

The deliberate compatibility change is fail-closed cookie writes from older/CLI clients with no provenance: supply a same-origin Origin or use the existing cookie-free bearer API. Cross-origin Expo clients must use bearer authentication without credentials. No API response schema, station permission matrix, database model or migration was changed.

## Complete route coverage

Read-only TypeScript-AST registry: `node scripts/web-mutation-inventory.cjs`.
Current inventory: **43 unsafe-method route exports**, **72 server-action exports/inline declarations**.
The route harness imports every one of the **38 apiHandler mutations** and verifies foreign/missing-header/cross-site cookie requests return 403 before identity or DB access. A coverage test rejects unaccounted route exports; four independent browser guards and the one signed webhook are explicitly inventoried. Proxy matcher tests include every inventoried action's page and every mutation route. Browser-authenticated handlers remain protected when called directly without Proxy.

| Method | Route | Protection |
|---|---|---|
| POST | `/api/ai/chat` | Proxy + apiHandler |
| POST | `/api/legal/acceptance` | Proxy + same-origin route guard |
| POST | `/api/v1/accounting/cash-bank` | Proxy + apiHandler |
| POST | `/api/v1/accounting/expenses` | Proxy + apiHandler |
| POST | `/api/v1/accounting/expenses/[id]/reverse` | Proxy + apiHandler |
| POST | `/api/v1/customer-credits/[id]/allocations` | Proxy + apiHandler |
| POST | `/api/v1/customer-returns` | Proxy + apiHandler |
| POST | `/api/v1/customer-returns/[id]/cancel` | Proxy + apiHandler |
| POST | `/api/v1/customers` | Proxy + apiHandler |
| PATCH | `/api/v1/customers/[id]` | Proxy + apiHandler |
| DELETE | `/api/v1/customers/[id]` | Proxy + apiHandler |
| POST | `/api/v1/goods-receipts` | Proxy + apiHandler |
| PATCH | `/api/v1/goods-receipts/[id]` | Proxy + apiHandler |
| POST | `/api/v1/goods-receipts/[id]` | Proxy + apiHandler |
| DELETE | `/api/v1/goods-receipts/[id]` | Proxy + apiHandler |
| DELETE | `/api/v1/invitations/[id]` | Proxy + apiHandler |
| POST | `/api/v1/members` | Proxy + apiHandler |
| PATCH | `/api/v1/members/[id]` | Proxy + apiHandler |
| DELETE | `/api/v1/members/[id]` | Proxy + apiHandler |
| POST | `/api/v1/payments` | Proxy + apiHandler |
| POST | `/api/v1/payments/[id]/reverse` | Proxy + apiHandler |
| POST | `/api/v1/products` | Proxy + apiHandler |
| PATCH | `/api/v1/products/[id]` | Proxy + apiHandler |
| DELETE | `/api/v1/products/[id]` | Proxy + apiHandler |
| POST | `/api/v1/purchases` | Proxy + apiHandler |
| POST | `/api/v1/purchases/[id]/cancel` | Proxy + apiHandler |
| PATCH | `/api/v1/purchases/[id]` | Proxy + apiHandler |
| DELETE | `/api/v1/purchases/[id]` | Proxy + apiHandler |
| POST | `/api/v1/sales` | Proxy + apiHandler |
| POST | `/api/v1/sales/[id]/cancel` | Proxy + apiHandler |
| POST | `/api/v1/supplier-payments/[id]/reverse` | Proxy + apiHandler |
| POST | `/api/v1/supplier-returns` | Proxy + apiHandler |
| POST | `/api/v1/supplier-returns/[id]/cancel` | Proxy + apiHandler |
| POST | `/api/v1/suppliers` | Proxy + apiHandler |
| POST | `/api/v1/suppliers/[id]/payments` | Proxy + apiHandler |
| PATCH | `/api/v1/suppliers/[id]` | Proxy + apiHandler |
| DELETE | `/api/v1/suppliers/[id]` | Proxy + apiHandler |
| POST | `/api/v1/workspace` | Proxy + apiHandler |
| POST | `/api/v1/workspace/switch` | Proxy + apiHandler |
| POST | `/api/webhooks/clerk` | Svix signature (exact exemption) |
| POST | `/auth/confirm` | Proxy + same-origin route guard |
| POST | `/auth/recovery/password` | Proxy + same-origin route guard |
| POST | `/auth/recovery/start` | Proxy + same-origin route guard |

Server-action list: `web-mutation-server-actions-v2-12.csv`. This inventory records every exported/inline action, including read-like operations exposed through POST; role/tenant tests focus on the requested Restaurant boundaries. Read-like GET authentication callbacks/post-login intentionally consume fresh provider proof and establish session/workspace cookies; they are not financial mutations and must remain navigable from provider email links. Recovery token-hash GET remains a scanner-safe confirmation page; its consuming POST is guarded.

## Regression evidence

- Base #306 five exact-head workflows were SUCCESS (read from GitHub); base evidence is not follow-up exact-head proof.
- Full local unit regression after initial fixes: **968 PASS / 1 opt-in SKIP / 126 files**. No skipped case is claimed PASS.
- Latest affected rerun after additional owner/reference tests: **151 PASS / 4 files**.
- Prisma validation, final TypeScript and scoped changed-file lint PASS. Initial scoped lint caught one test variable named module; renamed. Initial TypeScript caught two test-header union types; explicit Record headers fixed. Latest FBR client/disabled-tenant rerun after adding the server-only boundary: **27 PASS / 2 files**. Build outcomes and fresh exact-head CI are recorded in the draft PR and external evidence.
- Local finance execution was blocked before scenarios: the intentionally unused synthetic localhost database could not be connected to (seven setup failures, 49 scenarios not executed). This is not finance PASS. CI runs the same suite against its disposable PG18 service. Initial sandbox build encountered Windows SWC access-denied; the same synthetic, migration-free production build **passed** when retried outside the sandbox, including TypeScript and all 107 generated pages. Neither attempt accesses a hosted database or deploys code.
- CI checks out the exact follow-up HEAD, rehearses 132 migrations on disposable PG18, runs all unit + Restaurant/warehouse + finance suites, real-DB recovery concurrency/pagination, station/actor/race integrity, TypeScript, schema validation, scoped security lint and a synthetic production-mode build. No credentials or remote FBR calls are used.
- FBR positive tests use injected mock fetch and synthetic environment values only. No provider transmission switch was changed in any deployed environment.

## Unresolved external acceptance

These code changes have not been deployed. Actual current-follow-up browser/desktop/mobile acceptance remains pending an authorized nonproduction deployment and isolated test accounts. Legacy Clerk provider isolation and external clients that rely on credentialed Expo CORS require separate acceptance. Missing-header cookie callers must adopt the provenance/bearer contract above.

Production FBR remains off. Provider ownership, token environment attestation, legal authorization, encryption-key validity and real validation/submission acceptance require a separately authorized integration workflow; passing synthetic fetch tests does not certify the provider. The approved production project check intentionally blocks alternate/self-hosted production targets until that policy is reviewed, rather than treating NODE_ENV=production as authorization.

PR #306 documents managed Neon restore blocked by snapshot/root-branch quotas, protected hosted/inbox acceptance, leaked-password provider control, physical 80mm printer and legal identity sign-off. Those are inherited unresolved operational gates, not new live passes. No customer data or provider settings were inspected or changed for this audit.

## Guidance checked

[OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) supports checking Origin/Referer and Fetch Metadata with an explicit fallback policy when headers are absent. Bundled Next 16.3.8 `data-security.md`, `server-actions.md`, and experimental matcher utility documentation were read before Proxy/server-action changes. Framework CSRF, SameSite cookies and hiding UI controls are supplementary to request and persisted authorization.
