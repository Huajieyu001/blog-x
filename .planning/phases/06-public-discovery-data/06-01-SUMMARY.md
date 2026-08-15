---
phase: 06-public-discovery-data
plan: "01"
subsystem: api
tags: [postgresql, drizzle, zod, unicode, search]
requires:
  - phase: 05-v1-0-integration-gap-closure
    provides: strict published projections and generated local verification authority
provides:
  - strict public discovery query, response, related, and opaque error contracts
  - published-only literal NFC substring search across title, summary, and Markdown
  - deterministic 3/2/1 relevance with repeatable-read pagination and batched public-card hydration
affects: [06-public-discovery-data, 07-responsive-discovery-experience, 08-reliable-local-delivery]
tech-stack:
  added: []
  patterns: [strict discriminated wire states, literal ILIKE ESCAPE, bounded batch hydration]
key-files:
  created:
    - packages/contracts/src/public-discovery.ts
    - packages/contracts/src/public-discovery.test.ts
    - apps/api/test/public-discovery.test.ts
  modified:
    - packages/contracts/src/index.ts
    - apps/api/src/content/public-repository.ts
key-decisions:
  - "Normalize queries with NFC after the raw UTF-16 cap and before the Unicode code-point cap."
  - "Use one highest-field relevance class (title 3, summary 2, Markdown 1) followed by publishedAt and UUID descending."
  - "Retain simple bounded PostgreSQL search without a migration, extension, or external search service."
patterns-established:
  - "Discovery responses reuse the existing strict public card instead of defining another projection."
  - "Search count and items share one repeatable-read, read-only transaction with a 2000ms local statement timeout."
requirements-completed: [SRCH-01, SRCH-02, SRCH-03]
coverage:
  - id: D1
    description: Strict bounded and coherent public discovery wire contracts
    requirement: SRCH-02
    verification:
      - kind: unit
        ref: packages/contracts/src/public-discovery.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: Published-only multilingual literal search with stable deterministic ranking
    requirement: SRCH-01
    verification:
      - kind: integration
        ref: apps/api/test/public-discovery.test.ts#published search is literal, multilingual, strict, ranked, and stable
        status: pass
    human_judgment: false
  - id: D3
    description: Stable bounded pagination and typed timeout-only unavailability
    requirement: SRCH-03
    verification:
      - kind: integration
        ref: apps/api/test/public-discovery.test.ts#search pagination is bounded and byte-stable across publication and UUID ties
        status: pass
    human_judgment: false
duration: 55min
completed: 2026-08-15
status: complete
---

# Phase 6 Plan 01: Strict Public Search Data Summary

**Strict NFC search contracts and a published-only PostgreSQL query with literal wildcard handling, 3/2/1 ranking, and stable pagination**

## Performance

- **Duration:** 55 min
- **Started:** 2026-08-15T05:23:00Z
- **Completed:** 2026-08-15T06:17:55Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added strict search query/state/error envelopes with exact raw, semantic, page, and related-result caps.
- Added literal NFC `ILIKE ... ESCAPE` search over the single published-only predicate without schema or dependency changes.
- Proved hidden-state confidentiality, CJK/English/emoji/canonical Unicode behavior, literal wildcard safety, 3/2/1 order, stable ties, and strict public-card output in PostgreSQL 18.

## Task Commits

1. **Task 1: Specify and implement strict discovery contracts** — `e86a0f8`
2. **Task 2: Implement published-only literal search with stable repository ordering** — `fff38ce`

Supporting boundary hygiene: `a13dbfc` replaces a credential-shaped synthetic plan fixture with a symbolic placeholder.

## Files Created/Modified

- `packages/contracts/src/public-discovery.ts` — strict discovery constants, query normalization, coherent states, related cap, and opaque failures.
- `packages/contracts/src/public-discovery.test.ts` — Unicode, input, state, strictness, and error-contract assertions.
- `packages/contracts/src/index.ts` — exports the discovery contract.
- `apps/api/src/content/public-repository.ts` — published-only search, bounded batch card hydration, stable ordering, and typed timeout mapping.
- `apps/api/test/public-discovery.test.ts` — PostgreSQL semantic, confidentiality, wildcard, Unicode, ranking, and pagination coverage.

## Decisions Made

- Kept search as a bounded literal substring query for consistent Chinese and English behavior at personal-blog scale.
- Reused the existing `publicPredicate` and strict card projection so search cannot invent a parallel visibility boundary.
- Wrapped only direct PostgreSQL SQLSTATE `57014`; all other database failures retain their original identity for the route-local opaque 500 boundary in Plan 02.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reused the installed frozen dependency tree after the classic Docker build cache was missing**

- **Found during:** Task 2 integration verification
- **Issue:** The exact Dockerfile build reached `corepack pnpm install --frozen-lockfile`, but its cached layer was absent and DNS to the registry was unavailable.
- **Fix:** Did not pull or install. Reused `blog-x-api-local:latest` only as the installed dependency runtime, mounted the clean current API/contracts/test sources read-only, and ran migrations plus all suites in a uniquely generated Compose PostgreSQL namespace with exact EXIT cleanup.
- **Files modified:** None.
- **Verification:** Discovery 3/3, public list 1/1, and public visibility 2/2 passed with zero skip/TODO/cancel; workspace typecheck and repository boundaries passed.

**2. [Rule 3 - Blocking] Removed a credential-shaped synthetic URI from the checked plan**

- **Found during:** Task 2 boundary verification
- **Issue:** The Phase 6 Plan 02 hostile-error description itself matched the repository credential-URI detector.
- **Fix:** Replaced the literal secret segment with `${ROUTE_SECRET}` while retaining the hostile leak-test intent.
- **Files modified:** `.planning/phases/06-public-discovery-data/06-02-PLAN.md`
- **Verification:** `node scripts/check-boundaries.mjs` reported zero findings.
- **Committed in:** `a13dbfc`

**Total deviations:** 2 auto-fixed (2 blocking). **Impact:** Product semantics and isolation remained unchanged; no package, network fallback, server, migration, production, or historical evidence change occurred.

## Issues Encountered

- Classic Docker dependency-layer cache was absent. The generated database verification remained fully local and used the already-installed frozen dependency tree; durable cache-loss recovery remains owned by Phase 8.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `searchPage` and all strict contracts are ready for public routes and deterministic related selection in Plan 02.
- Production release remains `BLOCKED`; neither cloud server was contacted.

## Self-Check: PASSED

- All three created files exist.
- Task commits `e86a0f8` and `fff38ce` exist.
- Contract tests, generated PostgreSQL suites, workspace typecheck, and repository boundaries passed.

---
*Phase: 06-public-discovery-data*
*Completed: 2026-08-15*
