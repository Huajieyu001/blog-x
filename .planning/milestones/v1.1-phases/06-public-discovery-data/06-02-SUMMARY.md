---
phase: 06-public-discovery-data
plan: "02"
subsystem: api
tags: [fastify, postgresql, related-content, error-boundary, privacy]
requires:
  - phase: 06-public-discovery-data
    plan: "01"
    provides: strict discovery contracts, published-only search, and bounded public-card hydration
provides:
  - deterministic public-only related article ranking with fixed four-card limit
  - strict GET /public/search and GET /public/articles/:slug/related routes
  - route-local typed 503 and exact opaque discovery 500 responses
affects: [07-responsive-discovery-experience, 08-reliable-local-delivery]
tech-stack:
  added: []
  patterns: [lexicographic taxonomy ranking, route-local opaque errors, identical hidden-source not-found]
key-files:
  created: []
  modified:
    - apps/api/src/content/public-repository.ts
    - apps/api/src/routes/public-posts.ts
    - apps/api/test/public-discovery.test.ts
key-decisions:
  - "Rank related posts lexicographically by category match, shared tag count, publication time, and UUID instead of using an additive score."
  - "Catch unexpected discovery failures inside only the two discovery handlers and never serialize or log the exception at that boundary."
patterns-established:
  - "A source slug is authorized with publicPredicate before any taxonomy association is read."
  - "Known query/page/timeout outcomes use distinct strict schemas; every unexpected discovery error is exactly discovery_error."
requirements-completed: [SRCH-01, SRCH-02, SRCH-03, READ-08]
coverage:
  - id: D1
    description: Public-only deterministic related article ranking and fixed result cap
    requirement: READ-08
    verification:
      - kind: integration
        ref: apps/api/test/public-discovery.test.ts#related posts require public overlap and use deterministic category/tag/time/UUID ranking
        status: pass
    human_judgment: false
  - id: D2
    description: Strict search route with empty-query no-scan and typed invalid/timeout states
    requirement: SRCH-02
    verification:
      - kind: integration
        ref: apps/api/test/public-discovery.test.ts#public search route fails closed and never scans for an empty normalized query
        status: pass
    human_judgment: false
  - id: D3
    description: Exact opaque route-local discovery failures with hostile exception non-disclosure
    requirement: SRCH-01
    verification:
      - kind: integration
        ref: apps/api/test/public-discovery.test.ts#discovery routes expose only typed 503 and exact opaque route-local 500 bodies
        status: pass
    human_judgment: false
duration: 56min
completed: 2026-08-15
status: complete
---

# Phase 6 Plan 02: Public Discovery Routes Summary

**Public-only related ranking and strict Fastify search/related endpoints with exact opaque failure boundaries**

## Performance

- **Duration:** 56 min
- **Started:** 2026-08-15T06:17:55Z
- **Completed:** 2026-08-15T07:13:35Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added deterministic related selection that excludes the source and every non-public/no-overlap candidate, returns at most four cards, and reacts immediately to lifecycle changes.
- Added strict `/public/search` and `/public/articles/:slug/related` routes ready for the same-origin Phase 7 UI.
- Proved exact typed invalid/timeout states, empty-query no-scan behavior, identical hidden-source 404s, and byte-exact opaque 500 responses with no SQL/pattern/environment/credential/address disclosure.

## Task Commits

1. **Task 1: Rank only real public related articles** — `65fedcb`
2. **Task 2: Expose strict search and related public routes end to end** — `74bc6ae`

## Files Created/Modified

- `apps/api/src/content/public-repository.ts` — related source authorization, overlap selection, lexicographic ranking, fixed limit, and strict card hydration.
- `apps/api/src/routes/public-posts.ts` — public search/related handlers and route-local strict error mapping.
- `apps/api/test/public-discovery.test.ts` — repository, real Fastify/PostgreSQL, stubbed error, lifecycle, and non-disclosure assertions.

## Decisions Made

- Kept category match as a separate first sort key, so no future tag-count growth can outrank a real category overlap.
- Returned `null` for every unavailable source at the repository boundary and reused the existing strict public 404 response in HTTP.
- Left Fastify's global handler untouched; the discovery routes own only their narrow failure surface.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used the verified installed dependency runtime for generated database suites**

- **Found during:** Plan 01 and retained through Plan 02 integration verification.
- **Issue:** The frozen-install Docker layer remained unavailable offline.
- **Fix:** Reused the existing installed local dependency image with current clean source mounted read-only into generated Compose database namespaces; no pull/install/network fallback occurred.
- **Files modified:** None.
- **Verification:** Discovery 8/8, public list 1/1, public visibility 2/2, taxonomy 1/1, and security hardening 9/9 passed with zero skip/TODO/cancel in authoritative generated-database runs; typecheck and boundaries passed.

**Total deviations:** 1 auto-fixed (1 blocking). **Impact:** Route and database semantics received full real PostgreSQL coverage without changing dependency, topology, migration, server, or production authority.

## Issues Encountered

- One long combined Compose run lost its host tool session after the public visibility suite. Its exact generated namespace was inspected and removed, then taxonomy/security suites were rerun in a fresh exact generated namespace and passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Discovery contracts, repositories, and public routes are ready for the isolated Phase 6 gate.
- Phase 7 still owns the visual search and related-reading experience; no UI change is claimed here.
- Production remains `BLOCKED`; neither cloud server was contacted.

## Self-Check: PASSED

- Task commits `65fedcb` and `74bc6ae` exist.
- All discovery and named regression suites passed with nonzero tests under generated PostgreSQL authority.
- Workspace typecheck and repository boundaries passed with zero findings.

---
*Phase: 06-public-discovery-data*
*Completed: 2026-08-15*
