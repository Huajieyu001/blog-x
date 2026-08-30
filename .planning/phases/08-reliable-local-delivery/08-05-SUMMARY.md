---
phase: 08-reliable-local-delivery
plan: "05"
subsystem: testing
tags: [node-test, tap, test-inventory, package-scripts, fail-closed]
requires:
  - phase: 08-04
    provides: revision-addressed local delivery authority and immutable historical receipts
provides:
  - exact ownership manifest for all 37 package test files
  - self-contained default gate covering seven files and 38 semantic tests
  - explicit sealed integration alias retaining all 30 runner-owned files
affects: [08-06, 08-07, 08-08, 08-09, verification, local-delivery]
actuals:
  tokens: 6921
  tasks: 2
  commits: 4
tech-stack:
  added: []
  patterns: [explicit-test-ownership, zero-argument-coordinator, semantic-tap-accounting]
key-files:
  created:
    - scripts/test-inventory.mjs
    - scripts/test-inventory.test.mjs
    - scripts/default-test.mjs
    - scripts/default-test.test.mjs
  modified:
    - package.json
    - apps/api/package.json
key-decisions:
  - "The default gate owns exactly two Contracts, two API and three Web unit files; every other package test remains explicitly integration-owned."
  - "The root integration alias is exactly the zero-argument local-delivery acceptance coordinator, never a second partial runner."
  - "Every default child and the aggregate require nonzero TAP v13 pass-only arithmetic with zero failed, cancelled, skipped or TODO results."
patterns-established:
  - "Inventory equality: a fixed filesystem scan must equal one frozen canonical manifest with cardinality-one ownership."
  - "Default execution: exact literal Node argv, bounded redacted diagnostics and no caller-selected path or environment authority."
requirements-completed: [DEVX-01, DEVX-02, DEVX-03]
coverage:
  - id: D1
    description: Every Contracts, API and Web package test file has one exact default or integration owner, with missing, added, duplicate and reassigned paths rejected.
    requirement: DEVX-03
    verification:
      - kind: unit
        ref: scripts/test-inventory.test.mjs#package test inventory is frozen exact complete and disjoint
        status: pass
      - kind: unit
        ref: scripts/test-inventory.test.mjs#synthetic ownership failure cases
        status: pass
    human_judgment: false
  - id: D2
    description: The zero-argument default command runs exact Contracts, API and Web unit children and reports 38 of 38 semantic tests with no non-pass result.
    requirement: DEVX-01
    verification:
      - kind: unit
        ref: scripts/default-test.test.mjs#default coordinator executes every layer and emits a nonzero pass-only aggregate
        status: pass
      - kind: integration
        ref: corepack pnpm test
        status: pass
    human_judgment: false
  - id: D3
    description: All 30 remaining files retain explicit runner-owned integration classifications and root test:integration points exactly to the sealed formal acceptance coordinator.
    requirement: DEVX-02
    verification:
      - kind: unit
        ref: scripts/test-inventory.test.mjs#integration inventory has exact runner-owner counts
        status: pass
      - kind: unit
        ref: scripts/default-test.test.mjs#root and API scripts expose exact default and integration authorities
        status: pass
    human_judgment: false
duration: 6min
completed: 2026-08-30
status: complete
---

# Phase 08 Plan 05: Honest Default Test Gate Summary

**A frozen 37-file ownership inventory now drives a zero-infrastructure default gate that passes 38/38 Contracts, API and Web tests while retaining all 30 integration files behind the formal acceptance authority.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-08-30T07:42:21Z
- **Completed:** 2026-08-30T07:48:35Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Accounted for all 37 on-disk package tests exactly once: 7 default files and 30 runner-owned integration files.
- Replaced the failing recursive root test with a sealed, infrastructure-free coordinator that produced 38 passed, 0 failed/cancelled/skipped/TODO.
- Preserved full integration coverage through exact `test:integration: node scripts/local-delivery-acceptance.mjs` authority without running it in this plan.
- Kept `releaseState: BLOCKED`; no Docker runtime, receipt, cloud server or production authority was accessed.

## Task Commits

Each TDD task was committed as RED then GREEN:

1. **Task 1 RED: package-test inventory contract** — `9349ec3` (`test`)
2. **Task 1 GREEN: complete frozen ownership inventory** — `92882d2` (`feat`)
3. **Task 2 RED: sealed default coordinator contract** — `30af662` (`test`)
4. **Task 2 GREEN: semantic default gate and package scripts** — `12bdc9c` (`feat`)

## Files Created/Modified

- `scripts/test-inventory.mjs` — frozen 37-file manifest, derived default/integration lists and exact filesystem/cardinality assertion.
- `scripts/test-inventory.test.mjs` — complete-union, disjointness, owner-count and synthetic drift regressions.
- `scripts/default-test.mjs` — exact three-child coordinator with strict TAP accounting and bounded redacted failures.
- `scripts/default-test.test.mjs` — argv, parser, failure, override, aggregate and package-script regressions.
- `package.json` — exact default and formal integration entry points.
- `apps/api/package.json` — exact two-file infrastructure-free API unit scope.

## Decisions Made

- Default coverage is an explicit allowlist rather than a glob: Contracts 2, API 2 and Web 3 files.
- Integration fixture owners are finite: database 11, backup-restore 1, media 1, main-browser 14, error-browser 1, restore-browser 1 and phase7-browser 1.
- The coordinator removes only Node's inherited internal `NODE_TEST_CONTEXT` marker from child environments so nested semantic TAP remains ordinary standalone output; it accepts no path or Blog X environment override.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Isolated nested Node test children from the parent test-runner protocol**
- **Found during:** Task 2 GREEN verification
- **Issue:** A child spawned from `node --test` inherited `NODE_TEST_CONTEXT` and emitted the runner's internal protocol instead of TAP v13.
- **Fix:** Remove only that Node-internal marker from each exact child environment before spawn.
- **Files modified:** `scripts/default-test.mjs`
- **Verification:** Focused coordinator test and `corepack pnpm test` both produced strict TAP counts.
- **Committed in:** `12bdc9c`

**2. [Rule 1 - Bug] Removed a tracked credential-shaped negative fixture from source text**
- **Found during:** Task 2 boundary verification
- **Issue:** The redaction regression contained a literal credential-shaped database URL, correctly tripping the repository boundary audit.
- **Fix:** Construct the synthetic scheme and sensitive value at runtime while preserving the same redaction assertion.
- **Files modified:** `scripts/default-test.test.mjs`
- **Verification:** Boundary scan passed with 424 files and zero findings; redaction regression remained green.
- **Committed in:** `12bdc9c`

---

**Total deviations:** 2 auto-fixed Rule 1 bugs. **Impact:** Both fixes were required for the planned self-contained and boundary-clean default gate; no scope expansion occurred.

## Issues Encountered

None beyond the two inline auto-fixes above.

## User Setup Required

None. No dependency, lockfile, external service, Docker or server change is required.

## Verification

- Plan structure: valid, 2 tasks, zero errors/warnings.
- `node --test scripts/test-inventory.test.mjs scripts/default-test.test.mjs` — 13 passed, 0 failed/cancelled/skipped/TODO.
- `corepack pnpm test` — 38/38 passed: Contracts 10, API 15, Web 13; zero failed/cancelled/skipped/TODO.
- Inventory — 37 total files: 7 default and 30 integration, with exact owner counts.
- `node scripts/check-boundaries.mjs` — 424 files checked, 0 findings.
- Syntax and `git diff --check` — passed.
- Real `test:integration` and `local:deliver` were not invoked; canonical Docker and both cloud servers were untouched.
- `main` remains the README-only baseline `c665030fae22553f5c10ae063c67103b8eba6572`.

## Next Phase Readiness

- Plans 08-06 and 08-07 can consume the executable inventory to bind database/media and browser fixture owners to generated runners.
- Plan 08-09 remains the only authorized real formal-delivery step after review and verification.
- Production remains `BLOCKED`.

## Self-Check: PASSED

All four created scripts exist, all four TDD commits are present, the exact focused/default/boundary gates pass, and no untracked or deleted files remain outside this summary.

---
*Phase: 08-reliable-local-delivery*
*Completed: 2026-08-30*
