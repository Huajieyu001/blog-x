---
phase: 03-distribution-and-portability
plan: "01"
subsystem: api, web, testing
tags: [fastify, drizzle, zod, nextjs, rss, docker]
requires:
  - phase: 02-complete-reading-experience
    provides: public visibility predicate, strict public API boundary, and generated local verification topology
provides:
  - fail-closed generated Phase 3 database verification selections
  - strict publication-only public distribution DTO and Fastify route
  - same-origin, no-store RSS 2.0 Route Handler
affects: [03-02, sitemap, robots, metadata, export]
actuals:
  tokens: 14000
  tasks: 3
  commits: 4
tech-stack:
  added: []
  patterns: [fail-closed semantic test reports, publicPredicate distribution projection, validated public-origin RSS]
key-files:
  created: [packages/contracts/src/distribution.ts, apps/web/app/lib/site-metadata.ts, apps/web/app/rss.xml/route.ts]
  modified: [scripts/local-verify.mjs, apps/api/src/content/public-repository.ts, apps/web/app/lib/api.ts]
key-decisions:
  - "Force TAP only for Node/tsx suites inspected by the semantic verifier, allowing zero-valued footer counters while rejecting real skip/TODO directives and nonzero counters; do not parse Playwright's non-TAP output as TAP."
  - "One repeatable-read publicPredicate projection supplies all public discovery consumers and returns only a strict allowlist."
  - "Every RSS URL derives from validated PUBLIC_ORIGIN while INTERNAL_API_ORIGIN remains server-fetch-only."
patterns-established:
  - "Phase 3 selections name their owned suites and reject skipped/TODO or zero-test Node semantic output without mistaking TAP footer counters for directives."
  - "RSS serializes escaped summaries only, strips forbidden XML controls, and never reads Markdown/rendered HTML."
requirements-completed: [SEO-02, FEED-01]
coverage:
  - id: D1
    description: Generated local Phase 3 verification owns a migrated disposable database and rejects missing/skip/zero semantic test outcomes.
    requirement: SEO-02
    verification:
      - kind: unit
        ref: scripts/local-verify.test.mjs#Phase 3 semantic TAP output fails closed on skip or zero tests
        status: pass
      - kind: integration
        ref: corepack pnpm local:verify -- --phase3-api
        status: pass
    human_judgment: false
  - id: D2
    description: Public distribution exposes only predicate-visible discovery facts through a strict Fastify DTO.
    requirement: SEO-02
    verification:
      - kind: integration
        ref: apps/api/test/public-distribution.test.ts#Phase 3 distribution only exposes predicate-visible discovery facts
        status: pass
    human_judgment: false
  - id: D3
    description: RSS is a same-origin no-store XML feed with a 20-item bound and hostile-text escaping.
    requirement: FEED-01
    verification:
      - kind: unit
        ref: apps/web/app/lib/site-metadata.test.ts#RSS escapes hostile summary text, removes invalid controls, and preserves permanent same-origin links
        status: pass
    human_judgment: false
duration: 1h 0m
completed: 2026-08-09
status: complete
---

# Phase 03 Plan 01: Public Distribution and RSS Summary

**A fail-closed local distribution verifier, a strict publication-only API projection, and safe same-origin RSS now form Phase 3's discovery foundation.**

## Performance

- **Duration:** 1h 0m
- **Started:** 2026-08-09T03:20:00Z
- **Completed:** 2026-08-09T04:20:11Z
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments

- Added generated Phase 3 database/suite selections with loopback public origin separation, exact cleanup, secret redaction, and skip/zero-test rejection.
- Added the strict `publicDistributionSchema`, repository-owned repeatable-read `publicPredicate` projection, and `/public/distribution` route.
- Added a validated `PUBLIC_ORIGIN` helper and dynamic no-store `/rss.xml` handler with 20-item bounds, permanent links/guid values, RFC-822 dates, and XML escaping.

## Task Commits

1. **Task 1: Trace a generated Phase 3 database through one non-skippable semantic test** - `3225fc4`, `4490b30` (feat, fix)
2. **Task 2: Expand the sentinel to the strict public distribution contract** - `498fdb8` (feat)
3. **Task 3: Render the distribution contract as safe same-origin RSS** - `4d855f8` (feat)

## Files Created/Modified

- `scripts/local-verify.mjs` - Generated Phase 3 selections and fail-closed Node semantic-suite execution.
- `apps/api/test/public-distribution.test.ts` - Disposable-database public lifecycle and DTO secrecy assertions.
- `packages/contracts/src/distribution.ts` - Strict distribution allowlist shared by API and Web.
- `apps/api/src/content/public-repository.ts` - Repeatable-read public discovery snapshot using `publicPredicate`.
- `apps/api/src/routes/public-posts.ts` - Validated public distribution endpoint.
- `apps/web/app/lib/site-metadata.ts` - Public-origin, XML escaping, and RSS serialization helpers.
- `apps/web/app/rss.xml/route.ts` - Dynamic no-store RSS Route Handler.

## Decisions Made

- Explicitly request TAP for Node/tsx suites whose output is semantically inspected, then distinguish zero-valued TAP footer counters from test-level skip/TODO directives.
- Keep Playwright output outside the TAP parser until a dedicated structured Playwright result checker is introduced by the later browser slice.
- Keep the external `PUBLIC_ORIGIN` and server-only `INTERNAL_API_ORIGIN` as distinct configuration authorities.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TAP footer counters were mistaken for TODO directives**
- **Found during:** Task 1 (generated verification recovery)
- **Issue:** After switching inspected Node/tsx tests to TAP, Node's valid `# todo 0` footer was incorrectly treated as a test-level TODO directive, causing the successful semantic suite to fail.
- **Fix:** Added `--test-reporter=tap`, then distinguish zero-valued TAP footer counters from actual test-level skip/TODO directives while continuing to reject nonzero skipped/todo counters and zero tests; Playwright is not sent through the TAP parser.
- **Files modified:** `scripts/local-verify.mjs`, `scripts/local-verify.test.mjs`
- **Verification:** `corepack pnpm test:ops`; `corepack pnpm local:verify -- --phase3-api`
- **Committed in:** `3225fc4`, `4490b30`

**Total deviations:** 1 auto-fixed (Rule 1: 1)
**Impact on plan:** Necessary verifier compatibility repair; no scope expansion or dependency change.

## Issues Encountered

The sandbox blocks tsx's temporary IPC socket, so the Web pure test was run with the approved local execution permission. No application issue resulted.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 03-02: metadata, robots, and Sitemap can consume the strict `/public/distribution` source without database, Markdown, or internal-origin access.

No cloud, server, external service, CDN, or remote credential contact occurred.

---
*Phase: 03-distribution-and-portability*
*Completed: 2026-08-09*
