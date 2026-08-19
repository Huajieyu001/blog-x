---
phase: 07-responsive-discovery-experience
verified: 2026-08-19T15:35:27Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
decision_coverage:
  honored: 16
  total: 16
  not_honored: []
---

# Phase 7: Responsive Discovery Experience Verification Report

**Phase goal:** 访客在手机和桌面端都能从公共导航搜索内容，并在阅读后继续发现相关文章。

**Result:** PASSED — all five ROADMAP success criteria are implemented, wired, and behaviorally evidenced. No blocking gap or behavior-only human verification remains.

**Verification metadata:** generic-agent workaround: core verify-phase protocol; typed gsd-verifier unavailable

## Goal Achievement

| # | ROADMAP success criterion | Status | Evidence |
|---|---|---|---|
| 1 | 公共导航提供可键盘访问的搜索入口；搜索页显示查询、计数、分页及清除/返回操作。 | ✓ VERIFIED | `SearchForm.tsx` is a labeled native GET search form; `PublicHeader.tsx` places it in the public navigation and manages compact-menu tab order/Escape focus restoration; `search/page.tsx` renders normalized query context, totals, pagination and ordinary navigation actions. Browser acceptance covers desktop, 375px/768px compact menus, keyboard submit and no-JavaScript submit. |
| 2 | 普通、空查询、无结果、无效查询与服务异常状态诚实且可继续导航。 | ✓ VERIFIED | `search-discovery.ts` resolves strict request and transport outcomes without collapsing errors into empty results. `search/page.tsx` has separate `invalid`, `upstream_error`, `empty_query`, `no_results`, `page_out_of_range`, and `results` branches, each with appropriate retry/clear/back links. Contract/unit tests cover malformed shapes and every state; browser tests cover the complete visitor-visible matrix. |
| 3 | 真实匹配才显示相关文章；无匹配隐藏；不伪造或泄露私有数据。 | ✓ VERIFIED | `posts/[slug]/page.tsx` consumes the strict related endpoint, preserves API order, removes source/duplicate slugs, hides true-zero, and isolates related failure from the primary article. `publicRelatedPostsResponseSchema` permits at most four strict public cards. The browser fixture contains actual private sentinels and source/duplicate rows, and assertions prove they cannot render. Published-only selection and deterministic ranking remain independently verified by Phase 6's disposable-PostgreSQL gate. |
| 4 | 搜索和相关文章适配现有主题及手机、平板、桌面，并保持浏览器同源。 | ✓ VERIFIED | `public.module.css` retains the 700px/1023px layers, 44px search/menu/pagination/compact-taxonomy targets, one-column phone and two-column wider related layout, visible focus and reduced-motion rules. Browser assertions at 375/768/1280 check content order, columns, target sizes and zero horizontal overflow; light/dark/system, keyboard, no-JS and same-origin observations are covered. |
| 5 | 搜索采用受控 canonical/noindex，不进入 Sitemap，RSS/SEO 不回归。 | ✓ VERIFIED | `search/page.tsx`, `search-discovery.ts`, and `site-metadata.ts` always noindex search while emitting canonical only for normalized real result/no-result shapes. `sitemap.ts` enumerates public content without `/search`; `rss.xml/route.ts` continues to use public distribution. Metadata/RSS unit tests and browser canonical/Sitemap/RSS cases pass, including same-origin URL hardening. |

**Score:** 5/5 ROADMAP must-haves verified.

## Required Artifacts

| Artifact | Expected role | Status | Verification |
|---|---|---|---|
| `apps/web/app/_components/SearchForm.tsx` | Accessible native search entry | ✓ VERIFIED | Substantive default export; labeled GET form, bounded search input and submit button. |
| `apps/web/app/_components/PublicHeader.tsx` | Desktop/compact public navigation integration | ✓ VERIFIED | Search is in established navigation order; compact hidden controls leave tab order; Escape restores focus. |
| `apps/web/app/search/page.tsx` | Server-rendered search state authority | ✓ VERIFIED | Exhaustive visible states, normalized pagination and metadata integration. |
| `apps/web/app/lib/search-discovery.ts` | Strict request/outcome/canonical resolver | ✓ VERIFIED | Whole-object validation, fail-closed response agreement, stable hrefs and canonical policy. |
| `apps/web/proxy.ts` + `apps/web/lib/search-encoding.ts` | Raw query encoding boundary | ✓ VERIFIED | Narrow `/search` matcher overwrites a request-only validity marker before decoded parameters are accepted. |
| `apps/web/app/lib/api.ts` | Server-only strict discovery adapters | ✓ VERIFIED | `getPublicSearch` and `getPublicRelatedPosts` use the existing internal origin and shared response schemas. |
| `apps/web/app/posts/[slug]/page.tsx` | Related reading after primary article | ✓ VERIFIED | Real related cards, true-zero omission, source/dedup defense and local failure recovery. |
| `apps/web/app/_components/PostCard.tsx` + `Pagination.tsx` | Reused compact card and accessible paging | ✓ VERIFIED | Strict public DTO rendering, preserved taxonomy/read actions and query-aware paging hook. |
| `apps/web/app/public.module.css` | Responsive/theme/accessibility presentation | ✓ VERIFIED | Required breakpoints, wrapping, columns, target sizes, focus and reduced-motion behavior exist. |
| `apps/web/e2e/public-discovery-fixture.ts` + `public-discovery.spec.ts` | Independent finite browser oracle | ✓ VERIFIED | Success/failure/lifecycle/concurrency/hostile/privacy cases are explicit fixture constants and observable assertions, not derived from implementation output. |
| `scripts/phase7-browser-verify.mjs` | Bounded isolated browser gate | ✓ VERIFIED | Requires nonzero exact pass count, rejects skip/TODO/only, owns process groups, validates cleanup and removes only its generated temporary root. |

The GSD artifact parser reported false negatives for bracketed multi-export/default-export descriptors, but direct source inspection confirms every named export and default export exists and is substantive. All GSD key-link checks passed (13/13).

## Key-Link Verification

| From | To | Connection | Status |
|---|---|---|---|
| `PublicHeader.tsx` | `SearchForm.tsx` | Existing public header owns desktop/compact placement and tab state. | ✓ WIRED |
| `search/page.tsx` | `search-discovery.ts` → `api.ts` | Body and metadata consume one strict SSR outcome authority backed by the internal public-search adapter. | ✓ WIRED |
| `proxy.ts` | `search-encoding.ts` → `search-discovery.ts` | Raw encoding is validated before decoded query acceptance. | ✓ WIRED |
| `Pagination.tsx` | `searchHref()` | Every search page link preserves the normalized query and omits page one. | ✓ WIRED |
| `posts/[slug]/page.tsx` | `api.ts` → `PostCard.tsx` | Related fetching is isolated from primary content and renders strict ordered compact cards. | ✓ WIRED |
| Browser spec | Fixture + runner | Generated loopback origins drive real Next routes; the browser sees only the Web origin. | ✓ WIRED |

## Requirements Coverage

| Requirement | Status | Evidence |
|---|---|---|
| SRCH-01 | ✓ SATISFIED | Navigation-to-results visitor path is complete. Strict public-card schemas and Phase 6's PostgreSQL verification establish title/summary/Markdown matching and published-only visibility; Phase 7 did not alter API/contracts/database code after baseline `62fc953`. |
| SRCH-02 | ✓ SATISFIED | Normalization, bounds, stable pagination, explicit states/errors, native submission and resource-limited contracts are implemented and tested. |
| READ-08 | ✓ SATISFIED | Detail pages render only strict related-card responses in API order with source/dedup defense; Phase 6 independently verifies real category/tag scoring, public predicates and deterministic tie order. |
| READ-09 | ✓ SATISFIED | Zero, failure, lifecycle, concurrency, privacy, accessibility and 375/768/1280 layouts are explicitly exercised. |

No orphaned Phase 7 requirement was found. The checked REQUIREMENTS entries agree with the implementation and evidence.

## Behavioral Verification

### Fresh checks run during verification

| Check | Result |
|---|---|
| Web search/metadata/encoding unit tests | ✓ 13/13 passed; 0 skipped/TODO |
| Discovery contract plus shared tracer tests | ✓ 10/10 passed; 0 skipped/TODO |
| Workspace TypeScript checks | ✓ contracts, Web and API passed |
| Architecture boundary scan | ✓ 388 files checked, 0 findings |
| Runner syntax | ✓ `node --check` passed |
| Patch whitespace check | ✓ `git diff --check` passed |
| CONTEXT decision gate | ✓ 16/16 trackable decisions honored; non-blocking false count 0 |

The build was intentionally not rerun because the verifier was instructed to avoid build/service mutation; successful build evidence already existed in the Phase 7 execution/review record.

### Existing independent execution evidence inspected

| Evidence | Result | Assessment |
|---|---|---|
| Post-review full Chromium gate | ✓ 15/15 passed; 0 skipped/TODO; cleanup passed | Accepted after source-level audit of all test bodies, fixture values and runner result parsing. |
| Phase 7 review remediation | ✓ 5/5 warnings fixed | Compact taxonomy target measurement, incomplete-root cleanup, descendant termination, non-vacuous privacy/dedup fixtures and same-origin URL hardening are present in current source. |
| Phase 6 data verification | ✓ 4/4 passed; behavior_unverified 0 | Supplies real disposable-PostgreSQL proof for published-only search/related semantics and deterministic ordering inherited unchanged by Phase 7. |

No browser runner, preview, Docker service, network request or cloud/server operation was started during this verification.

## Test Quality Audit

| Test-quality gate | Result | Notes |
|---|---|---|
| Active acceptance tests | ✓ PASS | Current spec resolves to 15 Playwright tests, including the two generated failure cases. No `skip`, `fixme`, `only` or conditional disable control exists. |
| Nonzero/complete result enforcement | ✓ PASS | Runner parses discovered and passed counts, rejects failed/flaky/skipped/TODO/incomplete output, and requires exact equality. |
| Assertion strength | ✓ PASS | Tests assert visible headings/copy, exact hrefs/order/counts, DOM absence, canonical/robots, request origins, target dimensions, focus, overflow and grid columns—not merely HTTP 200. |
| Independent oracle | ✓ PASS | Fixture uses explicit expected public values, hostile inputs, private sentinels, malformed DTOs and lifecycle counters; expected UI output is not generated by production code. |
| Privacy claims are non-vacuous | ✓ PASS | Private sentinel values are actually injected into malformed responses; source and duplicate related rows are actually supplied. Database publication filtering is correctly attributed to Phase 6 rather than the Web fixture. |
| Failure and cleanup behavior | ✓ PASS | HTTP 400/500/503, refusal, malformed JSON/DTO, contradictory totals, forced setup failure and bounded timeout paths are represented; runner owns exact child process groups and exact temporary-root cleanup. |
| Circular/self-proving checks | ✓ PASS | No test rewrites production outputs or snapshots implementation output as its own expectation. Temporary source copying is isolated runner setup, not an acceptance oracle. |

## Anti-Patterns and Scope

- No TODO/FIXME/HACK/placeholder implementation marker was found in the Phase 7 production or acceptance files. The only matched `TODO` strings are the runner's deliberate rejection messages.
- No API, shared contract, database, migration or server file changed in `62fc953..HEAD`; Phase 7 remains a Web/acceptance slice over the verified Phase 6 data boundary.
- Search is submit-only SSR: no type-ahead fetch, autocomplete, stale substitution, browser-to-backend bypass or second ranking authority was introduced.
- No production server, credential, deployment, Docker runtime or fixed local preview was touched.

## Decision Coverage

The core verification gate reports all 16 trackable decisions D-01 through D-16 honored by shipped artifacts (`honored: 16`, `total: 16`, `not_honored: []`). Direct inspection agrees: native GET entry, controlled URLs/SEO, strict state separation, compact public cards, truthful related behavior, responsive/theme/accessibility rules and real-browser same-origin proof are all present.

## Human Verification

None required for phase completion. User-visible behavior that would ordinarily need manual inspection—responsive widths, keyboard focus, theme contrast separation, overflow, semantic state copy, related placement, SEO tags and same-origin requests—is covered by executable real-browser assertions. Broader visual preference feedback can still occur later, but it is not an unverified success criterion.

## Gaps Summary

No blocking, non-blocking, or deferred Phase 7 verification gaps were found. Phase 7 is ready to be marked complete and handed to Phase 8 for reliable fixed-`3100` delivery integration.

---

_Verified: 2026-08-19T15:35:27Z_
_Verifier: generic-agent workaround: core verify-phase protocol; typed gsd-verifier unavailable_
