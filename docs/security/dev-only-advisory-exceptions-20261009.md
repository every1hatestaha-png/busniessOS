# Temporary development dependency audit exceptions (2026-10-09)

The production-only audit must return zero vulnerabilities. Run it independently with `npm audit --omit=dev --audit-level=moderate`. **No exception below applies to production dependencies.**

The full-tree audit script `scripts/restaurant-audit-dev-advisories-v1-96.cjs` fails on any newly reported advisory or if an expected temporary advisory disappears. It also checks that every listed dependency is classified `dev: true` in the npm lockfile. These exceptions are not a declaration that vulnerable development software is safe.

- `GHSA-vfj7-8cjw-p6xm`, `braces`, currently rooted in ESLint/shadcn development tooling. As of this review npm advertises only an incompatible forced downgrade of shadcn. Do not run `npm audit fix --force` without evaluating its breaking changes.
- `GHSA-ch52-4w7c-c8xp`, `http-cache-semantics`, through `got/cacheable-request` development tooling. GitHub's advisory currently lists no patched release. No user response cache may depend on this dev-only package in a production deploy.
- `GHSA-hp3w-g68c-fv3c`, `sprintf-js`, through `roarr/global-agent/@electron/get/electron-builder` development packaging. GitHub's advisory currently lists no patched release. Avoid processing untrusted precision format strings through that toolchain.

Patched releases enforced in `package.json` overrides: `sharp@0.35.5`, `source-map-js@1.2.2`, `@modelcontextprotocol/sdk@1.31.0`, `proxy-addr@2.0.8`, `postcss-selector-parser@7.1.6`.

**Release conditions:** clean production audit, current-head unit/finance/Restaurant+browser CI, clean npm install, no development-only advisory escaping the dev dependency graph, and written review of any remaining development tooling exposure. Remove each exception when an upstream patch is available and dependency resolution can use it without introducing a separate regression.
