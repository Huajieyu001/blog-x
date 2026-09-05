---
phase: 12-administrator-insights
plan: "01"
subsystem: api
tags: [fastify, postgresql, drizzle, zod, analytics, administrator]
requires:
  - phase: 11-privacy-safe-view-authority
    provides: anonymous daily PV aggregates and the shared current-public predicate
provides:
  - Authenticated private no-store administrator analytics read authority
  - Strict 7/30/90/400 Shanghai-day aggregate contract with top-eight cap
  - D-01 lifecycle-filtered aggregate projection and recovery regression coverage
affects: [12-02, 12-03, administrator-dashboard]
actuals:
  tokens: 11672
  tasks: 2
  commits: 4
tech-stack:
  added: []
  patterns:
    - Session-first protected GET routes use a plugin-scoped onSend cache policy for every response.
    - Aggregate-only PostgreSQL reads validate bigint-derived values through shared strict response contracts.
key-files:
  created:
    - apps/api/src/content/admin-analytics-repository.ts
    - apps/api/src/routes/admin-analytics.ts
    - apps/api/test/admin-analytics.test.ts
    - packages/contracts/src/analytics.test.ts
  modified:
    - packages/contracts/src/analytics.ts
    - apps/api/src/app.ts
key-decisions:
  - "D-01 applies the exported publicPredicate to the one eligible CTE used by totals, daily rows, sources, and top articles."
  - "Analytics uses four literal ranges, Shanghai SQL calendar bounds, a 2000ms local statement timeout, and no schema or dependency change."
requirements-completed: [STAT-05]
coverage:
  - id: D1
    description: Protected administrator analytics route rejects anonymous and malformed reads, returns opaque failures, and is private no-store.
    requirement: STAT-05
    verification:
      - kind: integration
        ref: apps/api/test/admin-analytics.test.ts#analytics route contracts
        status: pass
    human_judgment: false
  - id: D2
    description: Strict contract enforces supported ranges, zero-filled Shanghai calendar continuity, arithmetic, source completeness, and deterministic top rows.
    requirement: STAT-05
    verification:
      - kind: unit
        ref: packages/contracts/src/analytics.test.ts#analytics response invariants
        status: pass
    human_judgment: false
  - id: D3
    description: PostgreSQL projection applies D-01 hide/reappear behavior while retaining historical aggregate rows.
    requirement: STAT-05
    verification:
      - kind: integration
        ref: apps/api/test/admin-analytics.test.ts#analytics aggregates only currently public articles and restores stored PV when republished
        status: unknown
    human_judgment: true
    rationale: Generated disposable PostgreSQL authority is created by Plan 12-03 and was unavailable in this plan run.
duration: 8min
completed: 2026-09-05
status: complete
---

# Phase 12 Plan 01: Administrator Analytics Read Authority Summary

**Authenticated Fastify analytics authority exposing current-public, aggregate-only Shanghai PV trends through a strict bounded contract.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-09-05T11:18:49Z
- **Completed:** 2026-09-05T11:26:54Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added `GET /admin/analytics`, authenticated before query parsing or repository access and non-cacheable on every outcome.
- Added exact 7/30/90/400 range and 1..8 top-limit contracts, plus response validation for calendar continuity, arithmetic, source buckets, and top ordering.
- Added a read-only repeatable-read PostgreSQL projection with Shanghai dates, zero-fill, safe aggregate conversion, timeout, and D-01 public lifecycle filtering.

## Task Commits

1. **Task 1: Prove one authenticated 30-day analytics path from contract through API** - `62fe2e6`, `e71f7dc` (test, feat)
2. **Task 2: Complete bounded zero-filled aggregates and D-01 lifecycle behavior** - `fc2df30`, `6640862` (test, feat)

## Files Created/Modified

- `packages/contracts/src/analytics.ts` - shared strict admin analytics wire contracts and aggregate invariants.
- `apps/api/src/content/admin-analytics-repository.ts` - bounded current-public SQL aggregate projection.
- `apps/api/src/routes/admin-analytics.ts` - session-first private no-store Fastify route.
- `apps/api/src/app.ts` - production repository registration and narrow test seam.
- `packages/contracts/src/analytics.test.ts` - response and query invariant tests.
- `apps/api/test/admin-analytics.test.ts` - route contracts and generated-PostgreSQL D-01 regression suite.

## Decisions Made

- Reused the exported `publicPredicate` in the common eligible SQL CTE so all aggregate branches obey D-01 identically.
- Kept analytics read-only: no audit writes, identity data, event records, migration, dependency, remote service, or production operation was added.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Preserved the exact private cache policy for unauthorized reads**
- **Found during:** Task 1
- **Issue:** `requireAdministrator` correctly applied generic `no-store`, but overwrote the route's required exact `private, no-store, max-age=0` header on the 401 path.
- **Fix:** Added a plugin-scoped `onSend` cache policy, which covers 200, 400, 401, and 503 responses.
- **Files modified:** `apps/api/src/routes/admin-analytics.ts`
- **Verification:** Route-level Fastify injection test passes for every response family.
- **Committed in:** `e71f7dc`

**Total deviations:** 1 auto-fixed (Rule 1)

## Issues Encountered

- `ADMIN_ANALYTICS_TEST_DATABASE_URL` was absent, as expected before Plan 12-03 creates the generated local disposable database authority. The database lifecycle test therefore reported one skip in this run.
- Local Docker inspection was denied at the Colima socket by the sandbox. No server, network, credential, deployment, or production operation was attempted. Plan 12-03 must run the encoded database suite with its generated local URL and zero skips.
- `state.advance-plan` could not parse the pre-existing orchestrator-owned `STATE.md` body (`Phase: null`, `Plan: 1 of ?`). Other SDK state, metric, session, roadmap, and requirement updates succeeded; the malformed ownership context was preserved rather than manually rewritten.

## Known Stubs

None.

## Self-Check: PASSED

- All six implementation/test artifacts exist.
- All four TDD commits are present in Git history.

## Next Phase Readiness

- Plan 12-02 can consume `AdminAnalytics` through the protected `/admin/analytics` endpoint.
- Plan 12-03 must register this suite, supply `ADMIN_ANALYTICS_TEST_DATABASE_URL`, and run its D-01 lifecycle assertions against a generated local PostgreSQL database before phase completion.

---
*Phase: 12-administrator-insights*
*Completed: 2026-09-05*
