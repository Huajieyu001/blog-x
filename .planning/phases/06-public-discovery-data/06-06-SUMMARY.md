---
phase: 06-public-discovery-data
plan: "06"
subsystem: local-delivery
tags: [docker, compose, offline-build, provenance, rollback, evidence]
requires:
  - phase: 06-public-discovery-data
    provides: sanitized offline image primitives and the identified fake-adapter gap
provides:
  - strict revision-bound outside-repository refresh-attempt claim protocol
  - bounded live API/Web refresh adapter with fixed local authority
  - no-stub CLI dispatch and read-only claim/evidence verification entry points
affects: [06-07, phase-08-reliable-local-delivery]
actuals:
  tokens: 9670
  tasks: 2
  commits: 3
tech-stack:
  added: []
  patterns:
    - stateful refresh authority is private to a fixed-constant adapter with argv-only process execution
    - revision-bound claims are atomically published outside the repository before a live build can begin
key-files:
  created:
    - scripts/refresh-local-live.mjs
  modified:
    - scripts/refresh-local.mjs
    - scripts/refresh-local.test.mjs
key-decisions:
  - "A clean implementation revision may receive only one external attempt claim; an existing claim stops the CLI before adapter construction."
  - "The adapter permits only fixed blogxlocal argv families and retains release state as BLOCKED."
requirements-completed: []
coverage:
  - id: D1
    description: Strict no-stub live refresh CLI, revision claim guard, and fixed argv policy
    requirement: SRCH-01
    verification:
      - kind: unit
        ref: node --test scripts/refresh-local.test.mjs
        status: pass
    human_judgment: false
  - id: D2
    description: Read-only blocked evidence and claim verification contract before the single future live attempt
    requirement: READ-08
    verification:
      - kind: unit
        ref: scripts/refresh-local.test.mjs#evidence verification is read-only and refuses malformed or non-BLOCKED records
        status: pass
    human_judgment: false
duration: 0h 0m
completed: 2026-08-16
status: complete
---

# Phase 6 Plan 06: Strict Live Refresh Adapter Summary

**A clean future revision can perform one bounded `blogxlocal` refresh through a real adapter, while this plan made no live attempt.**

## Performance

- **Tasks:** 2 completed
- **Files modified:** 3 implementation/test files plus this summary
- **TDD:** RED then GREEN commits preserved

## Accomplishments

- Replaced the hardcoded no-option CLI failure with `runRefreshCli`, an early clean-revision claim guard, and read-only claim-check modes.
- Added the fixed-authority live adapter with argv allowlisting, offline target-build/cutover/rollback pathways, loopback route checks, atomic evidence writing, and blocked-state preservation.
- Added external revision claim and strict evidence verification primitives; the existing historical `b7fa05c` failure remains untouched and does not collide with the next revision.

## Task Commits

1. **Task 1: Specify the live adapter and no-stub CLI contract in RED** — `ca2fac5` (`test(06-06): specify strict live refresh adapter`)
2. **Task 2: Implement the strict live adapter and make focused tests GREEN** — `11396dc` (`feat(06-06): implement strict live refresh adapter`)
3. **Task 2 blocking interface completion: Export read-only claim inspection** — `1081ebb` (`fix(06-06): expose attempt claim inspection`)

## Files Created/Modified

- `scripts/refresh-local-live.mjs` — fixed live adapter, argv policy, external attempt claims, route checks, evidence writer, and verifier.
- `scripts/refresh-local.mjs` — import-safe CLI dispatch, clean revision resolver, claim checks, and live-adapter integration.
- `scripts/refresh-local.test.mjs` — RED/GREEN coverage for CLI dispatch, claims, evidence reading, and permitted/prohibited commands.

## Decisions Made

- Attempt claims are deterministic JSON stored only under `/private/tmp/blog-x-refresh-attempts`; a matching revision is rejected before any adapter/Docker operation.
- The real adapter is limited to exact `blogxlocal` services and loopback origin. It does not provide SSH, server, deployment, pull, host-network, teardown, volume-removal, or release-READY paths.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Exported the planned read-only claim inspector**

- **Found during:** Task 2 artifact verification.
- **Issue:** `inspectRefreshAttemptClaim` was required by the plan artifact but not exported.
- **Fix:** Added the read-only wrapper and assertion coverage.
- **Verification:** focused suite passed and artifact verification reported 3/3.
- **Committed in:** `1081ebb`.

**Total deviations:** 1 blocking interface completion. **Impact:** No expanded authority or runtime action.

## Issues Encountered

- The historical 06-04 tests deliberately prohibited `docker-compose`; the RED suite replaced that broad prohibition with fixed argv-policy coverage so the real adapter can use only the required bounded Compose families.

## User Setup Required

None.

## Validation Results

- `node --test scripts/refresh-local.test.mjs` — 12 passed.
- `node --test scripts/local-verify.test.mjs` — 27 passed.
- `corepack pnpm -r typecheck` — contracts, API, and Web passed.
- `node scripts/check-boundaries.mjs` — 340 files checked, 0 findings.
- `node scripts/release-gate.mjs --evidence=ops/release-evidence.blocked.json --expect-blocked` — `RELEASE BLOCKED` as required.
- Protected artifact diff for runtime evidence, milestone archive, retained receipt, and `06-VERIFICATION.md` — clean.

## Next Phase Readiness

- Plan 06-07 alone owns the next clean revision's single no-option refresh invocation, its evidence-only commit, and closure documentation.
- No real attempt claim, runtime evidence, Docker/Compose action, `blogxlocal` mutation, server contact, deployment, or production transition occurred in this plan.
- Production remains `BLOCKED`; Phase 6 completion remains an independent verifier decision.

## Self-Check: PASSED

- RED and GREEN commits are ordered and present.
- The worktree stayed free of runtime evidence and protected-artifact changes.
- No-option refresh and offline probe modes were not invoked.

---
*Phase: 06-public-discovery-data*
*Completed: 2026-08-16*
