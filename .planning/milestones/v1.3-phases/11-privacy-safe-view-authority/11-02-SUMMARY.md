---
phase: 11-privacy-safe-view-authority
plan: "02"
subsystem: anonymous-view-security
tags: [fastify, privacy, rate-limiting, analytics, testing]
requires:
  - phase: 11-01
    provides: opaque aggregate-only public view tracer and fixed source contract
provides:
  - deterministic same-origin, referrer-source, prefetch, and crawler boundary policy
  - dedicated bounded anonymous-view socket limiter with opaque failures
  - guarded default-test ownership for privacy/security coverage
affects: [public-api, analytics, local-verification, phase-11-plan-03]
actuals:
  tokens: 7824
  tasks: 3
  commits: 5
tech-stack:
  added: []
  patterns: [pure-transient-request-policy, opaque-fail-closed-route, sealed-default-test-ownership]
key-files:
  created:
    - apps/api/src/analytics/view-request-policy.ts
    - apps/api/test/public-view-security.test.ts
  modified:
    - apps/api/src/routes/public-views.ts
    - scripts/test-inventory.mjs
    - scripts/default-test.mjs
    - scripts/local-verify.mjs
decisions:
  - "Only exact same-origin requests may enter anonymous view aggregation; all untrusted transport values remain transient."
  - "Fixed source enums and opaque 204/no-store responses preserve aggregate utility without visitor identity or article-state disclosure."
  - "The anonymous endpoint uses a separate, bounded, timer-free socket-keyed limiter rather than administrator mutation protections."
metrics:
  duration: "31 minutes"
  completed: "2026-09-05"
status: complete
requirements-completed: [STAT-01, STAT-02, STAT-03]
coverage:
  - id: D1
    description: Deterministic same-origin anonymous-view classification with coarse source attribution and automation rejection.
    requirement: STAT-01
    verification:
      - kind: unit
        ref: apps/api/test/public-view-security.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: Aggregate-only request boundary that retains no raw Origin, Referer, User-Agent, socket, cookie, or session value.
    requirement: STAT-02
    verification:
      - kind: unit
        ref: apps/api/test/public-view-security.test.ts
        status: pass
    human_judgment: false
  - id: D3
    description: Dedicated bounded fail-closed abuse guard with sealed default-test execution ownership.
    requirement: STAT-03
    verification:
      - kind: unit
        ref: scripts/test-inventory.test.mjs and scripts/default-test.test.mjs
        status: pass
      - kind: other
        ref: corepack pnpm test
        status: pass
    human_judgment: false
---

# Phase 11 Plan 02: Privacy-Safe View Authority Summary

Anonymous public-view requests are now admitted only through a transient, fail-closed policy and retained solely as fixed-source aggregates.

## Performance

- **Duration:** 31 minutes
- **Started:** 2026-09-05T03:13:19Z
- **Completed:** 2026-09-05T03:43:59Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Added exhaustive pure classification for exact same-origin requests, five fixed source enums, malformed referrers, prefetches, and known crawlers without allowing raw transport metadata across the writer boundary.
- Hardened the opaque public route with a dedicated bounded socket-keyed limiter, tiny body limit, disabled request logging, and identical `204`/`no-store` outcomes for invalid, limited, hidden, and repository-failure requests.
- Registered the security suite exactly once in the sealed default inventory; refreshed the fixed local runtime from the committed revision with health, canonical integration, and delivery acceptance passing while release remains blocked.

## Task Commits

Each task was committed atomically:

1. **Task 1: Make transient request classification exhaustive and fail closed** - `c23b264` (TDD RED) and `6ba9395` (feat)
2. **Task 2: Give the security suite exact guarded test ownership** - `521845c` (test)
3. **Task 3: Refresh the fixed local display after request-boundary hardening** - runtime-only verification; no repository file changed.

**Corrective verification commit:** `cf9f1e2` — aligned local schema/inventory gates with the Phase 11 aggregate migration.

## Files Created/Modified

- `apps/api/src/analytics/view-request-policy.ts` - Pure transient request classifier returning only accept/ignore plus a fixed source enum.
- `apps/api/src/routes/public-views.ts` - Opaque route policy enforcement and its dedicated bounded rate limiter.
- `apps/api/test/public-view-security.test.ts` - Privacy, source, automation, limiter, and response-parity regressions.
- `scripts/test-inventory.mjs` and `scripts/default-test.mjs` - Exact default ownership for the new security suite.
- `scripts/local-verify.mjs` and `scripts/local-verify.test.mjs` - Current ten-migration aggregate schema and local delivery inventory assertions.

## Verification

- Passed: `node --import tsx --test --test-reporter=tap apps/api/test/public-view-security.test.ts` — 4/4 tests.
- Passed: `corepack pnpm --filter @blog-x/api typecheck`.
- Passed: `node --test scripts/test-inventory.test.mjs scripts/default-test.test.mjs` — 17/17 tests.
- Passed: `corepack pnpm test` — 55/55 tests; release state `BLOCKED`.
- Passed: `node --test scripts/local-verify.test.mjs` — 39/39 tests.
- Passed: `node scripts/local-verify.mjs --canonical-integration --interruption-check --parallel-check` — 58/58 tests with generated cleanup acknowledgement; release state `BLOCKED`.
- Passed: `corepack pnpm local:deliver && curl -fsS http://127.0.0.1:3100/api/health` — fixed local revision `cf9f1e2`, health 200, acceptance 75/75; release state `BLOCKED`.

## Decisions Made

- Origin matching normalizes the configured public origin but requires exact equality; referrer roots use exact or dot-delimited subdomain matching so lookalikes fall to `external`.
- Crawler and prefetch hints are inspected only in memory and rejected before limiter or repository work.
- Local delivery evidence is runtime-only and was removed after verification to preserve Task 3's byte-identical repository contract.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Local verification drift] Updated local schema and generated inventory authority for migration `0009_article_daily_views`.**
- **Found during:** Task 3 local delivery.
- **Issue:** The existing local verifier still asserted the prior nine-migration, nine-table schema, causing the delivery acceptance path to fail after the Phase 11 aggregate migration.
- **Fix:** Updated exact table, constraint, index, Drizzle journal/snapshot, and generated inventory assertions to the current ten-migration authority.
- **Files modified:** `scripts/local-verify.mjs`, `scripts/local-verify.test.mjs`.
- **Verification:** 39/39 local-verifier tests, 58/58 canonical integration tests, and 75/75 local delivery acceptance passed.
- **Committed in:** `cf9f1e2`.

---

**Total deviations:** 1 auto-fixed (Rule 1).
**Impact on plan:** Necessary local verification alignment only; no new runtime feature, dependency, database artifact, server operation, or scope expansion.

## Issues Encountered

The first local delivery attempt exposed the stale verifier authority. After the corrective commit, the canonical local verification and sealed delivery path passed. All evidence remained local and redacted.

## Security Notes

- No raw Origin, Referer, User-Agent, socket address, cookie, session, audit event, or request event is persisted or emitted by the anonymous route.
- No administrator CSRF/session guard is reused; the anonymous limiter is process-local, finite, and expires entries without timers.
- No claim of visitor uniqueness, precise attribution, bot completeness, fraud prevention, or billing accuracy is introduced.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 11-03 can add retention, recovery, and final browser delivery proof against the now-hardened route. Production release remains `BLOCKED`; no server or production adapter was used.

## Self-Check: PASSED

- Required request-policy, route, security suite, test inventory, and local-verifier files exist.
- Commits `c23b264`, `6ba9395`, `521845c`, and `cf9f1e2` exist on `dev` and are pushed to `origin/dev`.

---
*Phase: 11-privacy-safe-view-authority*
*Completed: 2026-09-05*
