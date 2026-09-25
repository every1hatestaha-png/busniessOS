# MunshiOS production audit and remediation checkpoint

## 1. Executive summary

Target: https://www.munshios.tech. Testing used the supplied owner account and disposable Crust workspace only. This is a partial audit, not a production certification. Confirmed workflow/reporting defects have code patches in this branch; none should be called resolved in production until deployed and retested. No cross-tenant exploit, auth bypass, secret disclosure or ledger imbalance was demonstrated. Tenant isolation and lower-role enforcement remain unverified.

## 2. Critical blockers

**F01 Critical: cancelled returns inflate gross sales and return totals.** Route `/reports/profit-loss` and dashboard. Preconditions: confirmed sale and customer return. Reproduce: sale revenue 225.50; return revenue 180.40; cancel return; cancel sale; create and cancel another sale for 200. Expected gross sales 425.50 and returns/cancellations 425.50, net zero. Actual both gross and returns 605.90, net zero. Evidence: revenue GL includes 180.40 credit reversing the return; UI counts that as a new sale. Impact: incorrect financial statement presentation, although net profit remains correct in this scenario. Root: all revenue credits treated as sales. Fix: classify return reversal using its original GL source and period; dashboard use net revenue. Regression: same-period and prior-period return reversals, scoped workspace filter. **Patched; unit tested; production retest pending.** Critical per requested financial-statement severity policy; no financial loss or unbalanced posting proven.

## 3. Security findings

**F02 Medium: development authentication configuration on production.** Route `/sign-in` and account panel. Preconditions: production domain. Reproduce: open sign-in/account panel. Expected production auth instance. Actual Clerk panel displays Development mode; anonymous response indicates development browser auth configuration. Evidence: `dev-browser-missing` reason and development Clerk host; sensitive values omitted. Impact: production auth readiness/configuration concern, not a demonstrated bypass. Root: development instance configuration likely. Fix: configure and validate production Clerk instance, domain, redirect allowlist and production keys through secure settings. Regression: login/logout/reset and callback manipulation against production instance. **Unresolved; requires genuine production credentials, not fabricated replacements.**

**F03 Medium: permissive script CSP.** Route `/sign-in`, anonymous response. Reproduce: inspect response headers. Expected constrained required script origins and nonce/hash where supported. Actual `script-src` includes `unsafe-inline`, `https:` and `http:`. Impact: weak XSS mitigation; no XSS exploit demonstrated. Root: broad compatibility policy. Fix: inventory required hosts and introduce a tested nonce-based policy, initially report-only. Regression: auth and application flows under restrictive CSP; injected unapproved scripts rejected. **Unresolved.** HTTPS, HSTS, DENY frame header, nosniff and private/no-store observed on this response; not certified across all routes.

## 4. Financial integrity findings

F01 is the confirmed critical reporting finding. Sale/return/cancellation, partial GRN/void and supplier payment/reversal produced expected net changes in tested flows. This does not prove absence of orphan records or race conditions.

**F04 Medium: on-account receipts cannot exceed outstanding balance.** Route customer payment form. Preconditions: customer owes 750. Reproduce: select unallocated/on-account and enter 800.25. Expected advance credit accepted, with clear allocation information. Actual native maximum 750 blocks submission. Evidence: no payment posted; input maximum matches customer balance. Impact: legitimate advances cannot be recorded. Root: debt cap incorrectly applied to on-account mode. Fix: remove this cap only for on-account mode; preserve invoice/opening allocation limits. Regression: 800.25 receipt against 750 debt creates 50.25 credit; specific invoice over-allocation still rejected. **Patched; authenticated retest pending.**

**F05 Medium: cancelled sales included in sales-value summary.** Route `/sales`. Preconditions: cancelled 266.09 sale and active 200 sale. Expected posted sale value 200. Actual summary 466.09. Impact: overstated operational sales metric. Root: sum includes cancelled/draft orders. Fix: exclude those statuses and label posted sales value. Regression: active, draft and cancelled mix. **Patched; production retest pending.**

## 5. Functional bugs

**F06 Medium: fractional returns blocked.** Route sale detail, customer return form. Preconditions: sale 1.25 KG. Reproduce: enter return 0.25 or full 1.25. Expected supported fractional quantity accepted. Actual native step validation blocks submission; integer 1 works. Impact: cannot correctly reverse fractional inventory/revenue via return flow. Root: quantity step 1. Fix: fractional step matching supported storage precision. Regression: 0.25 and 1.25 returns, stock/GL/prorated tax and remaining limits. **Patched; production retest pending.**

**F07 Medium: decimal monetary inputs blocked.** Route `/sales/new`. Preconditions: otherwise valid sale. Reproduce: order discount 12.50. Expected valid currency cents accepted. Actual preview calculates but native step rejects submission. Per-unit discount and paid-now have same step issue in source. Root: monetary fields step 1. Impact: forces inaccurate amounts or abandoned sale. Fix: step 0.01. Regression: fractional discount and receipt with matching GL. **Patched; production retest pending.**

**F08 Medium: ordinary product edit fails on empty optional numeric fields.** Route `/inventory/[id]/edit`. Preconditions: product without FBR IDs/default weight. Reproduce: edit status only and save. Expected optional blank fields remain absent. Actual positive-number errors prevent saving. Evidence: FBR transaction/rate/default-weight errors without configured values. Root: client conversion `Number(null)` yields zero. Fix: preserve null/empty as undefined. Regression: edit null fields succeeds; explicit zero/negative remain rejected. **Patched; unit tested; production retest pending.**

**F09 Medium: warehouse creation crashes.** Route `/manufacturing`. Preconditions: owner, no warehouses. Reproduce: add QA Warehouse A, code QA250925-A, dummy address/default. Expected warehouse created or actionable validation. Actual page error `2225035077@E352`, repeated twice; retry restores page, count remains zero. Impact: blocks warehouse-dependent manufacturing audit/workflows. Likely root: non-async runtime constant exported from a `use server` action module. Fix: move initial state into client modules and retain type-only export. Regression: production build and create warehouse; create BOM/run lifecycle smoke tests. **Likely cause patched; not yet production-confirmed.**

**F10 Medium: archived product still accepts stock adjustments.** Route `/inventory/[id]` and stock adjustment server service. Preconditions: archive product. Reproduce: apply +0.25 after archive. Expected reject as archive confirmation promises. Actual adjustment accepted and inventory increased. Impact: stock/value changes to supposedly frozen archived item. Root: missing status check on server and visible adjustment UI. Fix: require active status within serializable transaction; hide adjustment control otherwise. Regression: direct service request for archived/inactive rejects without writes. **Patched; unit tested; production retest pending.**

## 6. UX issues

**F11 Low: completed return remains labelled Recording.** Route sale return form. Reproduce valid return, observe success with Recording label. Expected terminal success state. Actual busy wording remains. Impact: user unsure whether operation completed. Root: combined pending/success state used for button text. Fix: show Return recorded while retaining duplicate prevention. Regression: success/error/pending states. **Patched.**

**F12 Medium: same-day customer movement order creates misleading running balance.** Route `/customers/[id]`, receivable GL display. Preconditions: opening 1000 created with time, same-day receipt 250 stored at midnight. Reproduce view movements. Expected business sequence understandable. Actual receipt precedes opening, temporary -250 then 750; full customer statement shows opening first. Impact: misleading apparent credit during reconciliation; final balance correct. Likely root: mixed date-only and timestamp semantics. Fix: define a consistent accounting-date/opening ordering policy across reports, preserving real posting timestamps for audit. Regression: same-day opening, backdated and ordinary receipts across statement/detail/GL. **Unresolved; policy-sensitive change deferred.**

## 7. Performance issues

No defensible latency, N+1, bundle or mobile performance finding established. No stress tests performed. Do not label performance passed.

## 8. Improvement opportunities

**F13 Medium: public industry CTA requires login.** Route `/industries/manufacturing` (other industry subpages share source cause). Reproduce signed-out landing Explore manufacturing. Expected public industry page. Actual sign-in redirect. Root: middleware public allowlist only industry index. Impact: broken acquisition journey and crawling. Fix: exact allowlist of existing industry pages and crawler endpoints, retaining private boundaries. Regression: all five pages public; adjacent unknown/private paths remain protected. **Patched; unit tested.**

**F14 Low: canonical origin differs from actual redirect destination.** Route `/`, metadata/robots/sitemap/structured data. Reproduce open apex, inspect canonical. Expected www destination consistently canonical. Actual apex canonical while navigation redirects www; source fallback also retains old Vercel origin. Impact: inconsistent crawl signals. Fix: shared normalized public origin helper. Regression: apex/www normalize, custom preview origin preserved; anonymous crawler routes accessible. **Patched; unit tested.**

Further opportunities, not demonstrated defects: reconcile historical inventory GL against current rounded average cost explicitly (observed disclosed variance around 0.05 after receipt); improve cash-funded voucher naming; align pricing comparison copy; add isolated tenant/role fixtures, financial invariant integration tests and browser print snapshots to release gates.

## 9. Tested routes/modules and running checklist

| Module | Observed testing | Status |
|---|---|---|
| 1 Authentication/session | Sign-in, owner session, signed-in auth routes, logout, back, protected direct URLs; reset/signup forms rendered | Partial |
| 2 Tenant isolation | Wrong-type dummy entity UUID returns 404 | Partial; cross-tenant isolation unproven |
| 3 RBAC | Owner UI/actions only; one member available | Lower roles untested |
| 4 Sales | Credit/cash, tax/discount, fractional sale, integer return/cancel, paid-sale edit rejection, cancellation, safe doubleclick | Partial; defects above |
| 5 Purchase/GRN | PO 2.5 at120, received1.5 accepted1.25 rejected0.25, supplier150 movement, void restoration | Partial |
| 6 Inventory | Opening10.5 at100, remove0.25, insufficient remove11 rejected, archive and post-archive adjustment | Partial |
| 7 Manufacturing/BOM | Warehouse creation twice failed; recovery works | Blocked |
| 8 Parties/balances | Customer opening1000 receipt250; supplier opening500 payment100.25 and reversal; statements | Partial |
| 9 Accounting | Inspected AR/AP/cash/inventory/revenue/tax/COGS effects for tested flows, P&L | Partial; critical presentation finding |
| 10 Printing | On-screen invoice, voucher, customer statement; thermal action clicked | Partial; actual output unverified |
| 11 Responsive/mobile | No viewport coverage | Untested |
| 12 Input security | Required fields, number limits, wrong-entity not-found; attempted marker save blocked by product validation | Partial; XSS not tested successfully |
| 13 Web security | One anonymous sign-in response headers, public auth guards | Partial |
| 14 Uploads | None | Untested |
| 15 Abuse/rate limits | One safe sale doubleclick created one sale | Throttling untested |
| 16 Errors | Warehouse error/retry, wrong-entity 404, payment/edit/stock validation | Partial |
| 17 Public/SEO | Root, apex/www, metadata presence, industry CTA | Partial |
| 18 Performance | No measured assessment | Untested |
| 19 Accounting UX | Amount precision, archive contract, return status, movement ordering | Partial |
| 20 Improvements | Recommendations above | Partial |

Final observed fixture state: customer balance750, cash250, supplier500; product archived with stock10.5 at cost100 after post-archive adjustment. SO1 and SO2 cancelled; customer return cancelled; GRN voided; supplier payment reversed. Records retained for evidence. Do not repeat these operations outside this disposable workspace.

## 10. Untested areas and why

No second authorized tenant or lower-role session was available. Thus API/UI IDOR/BOLA, horizontal/vertical escalation and every role cannot be certified. Browser capabilities did not provide raw request replay/cookie manipulation or mobile viewport coverage. Session expiry/fixation, CSRF/CORS, OAuth, completed password reset/signup, file upload, rate limits, malformed API payloads, full print output, concurrency, BOM consumption and warehouse transfers remain untested or blocked. No isolated database was configured for integration testing; unit tests use mocks and a dummy loopback database URL. Source changes are not a substitute for live end-to-end retesting.

## 11. Exact recommended fix order

1. Review and deploy reporting classification fix F01; reconcile same-period and cross-period reports against GL.
2. Configure production authentication F02; establish isolated second test tenant and role sessions, complete authorization release gate.
3. Deploy warehouse action fix F09 and verify actual create/BOM/run flows.
4. Deploy F10/F08 and verify archive prohibition and product reactivation.
5. Deploy F06/F07/F04 and reconcile fractional returns, monetary cents and advances through GL/stock.
6. Deploy F05/F11 and verify summaries/success states.
7. Deploy F13/F14 and verify public crawling/canonicals.
8. Resolve F12 date-order policy; tighten CSP F03 with compatibility testing.
9. Complete untested tenant/RBAC, uploads, print, mobile, API and concurrency coverage before production certification.

## 12. Release verdict

**Block release certification.** Critical reporting fix is not yet production-retested, and high-impact authorization areas remain unverified. This branch is a remediation candidate, not evidence that the complete product is production-ready. No database migration or production data repair is included.

## Remediation validation

349 unit tests passed across 64 files. TypeScript `tsc --noEmit` passed. ESLint passed for changed and new TypeScript files. Tests used a dummy loopback database URL only; no production database access. Optimized Next.js production build passed with a dummy loopback database URL. Deployed browser regressions remain a release gate. Regression coverage added for return reversal classification, inactive stock rejection, optional product numeric values and public-route/canonical boundaries.

GitHub publication was blocked by automatic approval review because explicit permission to share the changes with the repository destination was not established. Changes are committed locally; no successful push or deployment is claimed.
