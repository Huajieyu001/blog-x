---
phase: 07-responsive-discovery-experience
plan: "04"
subsystem: testing
tags: [playwright, nextjs, responsive, accessibility, seo, privacy]

requires:
  - phase: 07-responsive-discovery-experience
    plan: "03"
    provides: strict related reading, responsive discovery implementation and focused generated-port Chromium proof
provides:
  - Finite strict search, related, lifecycle, failure and distribution acceptance fixture
  - Exhaustive semantic Phase 7 browser matrix covering all edge IDs, UI categories and D-01 through D-16
  - Fail-closed unfiltered runner with nonzero result enforcement and exact-child cleanup proof
affects: [08-reliable-local-delivery, phase-7-verification, v1.1-content-discovery]

actuals:
  tokens: 8490
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - finite symbolic fixture modes are strict-parsed before successful responses and reject unknown controls
    - generated-port Playwright output is parsed for nonzero tests, exact pass count and zero skip/TODO
    - every managed local child is terminated by exact handle with bounded SIGTERM/SIGKILL fallback

key-files:
  created: []
  modified:
    - apps/web/e2e/public-discovery-fixture.ts
    - apps/web/e2e/public-discovery.spec.ts
    - scripts/phase7-browser-verify.mjs

key-decisions:
  - "Keep acceptance controls finite and same-origin through the generated Web rewrite; reject unknown control vocabulary."
  - "Treat Playwright exit zero as insufficient until discovered count, passed count and skip/TODO counters agree."
  - "Prove cleanup through exact child handles and generated-origin refusal checks rather than broad process inspection."

patterns-established:
  - "Discovery acceptance matrix: every state and edge is asserted semantically against real generated Web routes."
  - "Runner result authority: nonzero discovered tests must equal passed tests and no disabled acceptance control may exist."
  - "Runner cleanup authority: normal, zero-match and forced-failure paths all close generated origins before return."

requirements-completed: [SRCH-01, SRCH-02, READ-08, READ-09]

coverage:
  - id: D1
    description: "Finite strict fixture and exact named browser matrix cover search zero/one/ten/eleven, related zero/one/four, failures, lifecycle, concurrency and hostile public text without disclosure."
    requirement: SRCH-01
    verification:
      - kind: automated_ui
        ref: "apps/web/e2e/public-discovery.spec.ts#phase 7 edge and privacy matrix (6/6)"
        status: pass
      - kind: unit
        ref: "packages/contracts/src/public-discovery.test.ts and apps/web/lib/search-encoding.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "The unfiltered suite independently proves D-01 through D-16, all eight UI categories, all 20 edge IDs, exact responsive geometry, keyboard, theme, no-JavaScript, SEO and same-origin behavior."
    requirement: READ-09
    verification:
      - kind: automated_ui
        ref: "node scripts/phase7-browser-verify.mjs (14/14, 0 skipped/TODO)"
        status: pass
      - kind: integration
        ref: "corepack pnpm -r typecheck and node scripts/check-boundaries.mjs"
        status: pass
    human_judgment: false
  - id: D3
    description: "The generated-port runner rejects zero/disabled acceptance and performs bounded exact-child cleanup on normal and forced-failure paths."
    requirement: SRCH-02
    verification:
      - kind: integration
        ref: "node scripts/phase7-browser-verify.mjs --force-failure and unmatched --grep controlled checks"
        status: pass
    human_judgment: false

duration: 18min
completed: 2026-08-19
status: complete
---

# Phase 7 Plan 04: Independent Discovery Acceptance Gate Summary

**A strict generated-port Chromium gate now proves every Phase 7 search, related-reading, responsive, SEO, privacy and topology contract with bounded exact-child cleanup.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-08-19T12:07:30Z
- **Completed:** 2026-08-19T12:25:10Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Expanded the local fixture into finite strict search, related, lifecycle, concurrency, failure and distribution scenarios, including rejection of unknown controls.
- Added the exact `phase 7 edge and privacy matrix` with named semantic coverage for all 20 edge IDs, eight UI categories and locked decisions D-01 through D-16.
- Hardened the sole Phase 7 runner to require nonzero unfiltered execution, exact pass-count agreement, zero skip/TODO and bounded cleanup on success or failure.

## Task Commits

Each task was committed atomically:

1. **Task 1: Expand the strict browser matrix across every state, edge and privacy boundary** - `88c9752` (test)
2. **Task 2: Run and harden the independent full Phase 7 acceptance gate** - `12b513a` (test)

## Files Created/Modified

- `apps/web/e2e/public-discovery-fixture.ts` - supplies allowlisted strict states for search, related content, lifecycle, failures, concurrency and public distribution.
- `apps/web/e2e/public-discovery.spec.ts` - executes the complete semantic browser matrix over real Web routes and same-origin API smoke paths.
- `scripts/phase7-browser-verify.mjs` - owns generated ports, isolated Web root, nonzero result parsing, bounded execution and exact cleanup.

## Decisions Made

- Acceptance state mutation is fixture-only, finite and observed through relative same-origin `/api` rewrites; arbitrary proxy or response controls remain impossible.
- A Playwright process exit code alone is not evidence: the runner independently requires discovered tests to equal passed tests and rejects skip, fixme or only controls.
- Cleanup verification uses only runner-owned child handles and its generated origins, never process-name scans, port-wide kills or unrelated process inspection.

## Deviations from Plan

None - plan executed within its three-file test-harness boundary.

## Issues Encountered

- The package-level contracts script uses the `tsx` CLI IPC server, which the filesystem sandbox rejected with `EPERM`. The same two tracked contract suites passed through `node --import tsx --test` with 10/10 tests.
- Chromium/Next normalizes malformed raw percent sequences before App Router browser observation. The exact raw `%`/UTF-8 rejection matrix remains executable in `apps/web/lib/search-encoding.test.ts`; browser acceptance independently covers encoded literal percent, Unicode normalization, duplicate/unknown keys, numeric/bounds rejection and zero upstream fetches.

## User Setup Required

None - no external service configuration required.

## Automated Evidence

- `node scripts/phase7-browser-verify.mjs --grep "phase 7 edge and privacy matrix"` - PASS, 6/6 Chromium tests.
- `node scripts/phase7-browser-verify.mjs` - PASS, 14/14 Chromium tests, 0 skipped/TODO, cleanup pass.
- Controlled unmatched `--grep` - expected nonzero result with cleanup pass.
- `node scripts/phase7-browser-verify.mjs --force-failure` - expected nonzero result after healthy children with cleanup pass.
- Contract, search encoding, resolver and metadata suites - PASS, 23/23 tests.
- `corepack pnpm -r typecheck` - PASS for contracts, API and Web.
- `node scripts/check-boundaries.mjs` - PASS, 385 tracked files and zero findings.
- `git diff --check` - PASS.

## Self-Check: PASSED

- All three planned artifacts exist, both task commits are present, and each task acceptance gate was rerun after final edits.
- The focused and unfiltered suite, zero-match guard, controlled negative-path cleanup, contracts, raw encoding, resolver, metadata, type and boundary checks all behaved as required.
- No production source, dependency, API route, database/schema, Docker, server, deployment, fixed-3100 runtime, public IP or credential changed.

## Next Phase Readiness

- Phase 7 is complete and ready for independent verification and Phase 8 fixed-3100/full-receipt integration.
- Production remains frozen and both cloud servers were untouched.

---
*Phase: 07-responsive-discovery-experience*
*Completed: 2026-08-19*
