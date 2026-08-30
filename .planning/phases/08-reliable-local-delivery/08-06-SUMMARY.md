---
phase: 08-reliable-local-delivery
plan: "06"
subsystem: testing
tags: [playwright, generated-fixture, process-ownership, postgres, cleanup]
requires:
  - phase: 08-05
    provides: exact package-test inventory and main-browser fixture classification
provides:
  - six legacy Web E2E specs that consume only generated runner facts
  - one exact migrated main-browser scheduler with scenario-specific seeds
  - success/failure cleanup proof for generated browser paths and canonical non-ownership
affects: [08-07, canonical-integration, local-delivery]
actuals:
  tokens: 10366
  tasks: 2
  commits: 4
tech-stack:
  added: []
  patterns: [runner-required-e2e-facts, generated-scenario-seeding, exact-finally-cleanup]
key-files:
  created: []
  modified:
    - apps/web/e2e/article-lifecycle.spec.ts
    - apps/web/e2e/auth-session.spec.ts
    - apps/web/e2e/draft-preview.spec.ts
    - apps/web/e2e/public-list.spec.ts
    - apps/web/e2e/public-reading.spec.ts
    - apps/web/e2e/walking-skeleton.spec.ts
    - scripts/local-verify.mjs
    - scripts/local-verify.test.mjs
key-decisions:
  - "Migrated specs fail at module load when generated origin, run ID or administrator facts are absent; they never skip or fall back to fixed authority."
  - "Session expiry and revoked-token checks consume two runner-seeded opaque tokens instead of importing database test helpers."
  - "One generated context schedules the six migrated paths once, resets scenario data between paths and acknowledges path cleanup only after filesystem absence is proven."
patterns-established:
  - "Browser assertion ownership: Playwright specs own only visible page/API behavior; the runner owns services, database facts, ports and teardown."
  - "Environment narrowing: inherited Blog X, administrator, database and E2E authority is stripped before exact generated fields are added."
requirements-completed: [DEVX-02, DEVX-03]
coverage:
  - id: D1
    description: All six legacy Web E2E specs require generated origin, run ID and administrator facts while containing no child, fixed-port, database or teardown authority.
    requirement: DEVX-02
    verification:
      - kind: unit
        ref: scripts/local-verify.test.mjs#legacy Web E2E specs require runner facts and own no infrastructure
        status: pass
      - kind: other
        ref: corepack pnpm exec tsc --noEmit --project apps/web/tsconfig.json
        status: pass
    human_judgment: false
  - id: D2
    description: The generated main-browser fixture selects the six paths exactly once, supplies sanitized scenario facts and retains pass-only counts.
    requirement: DEVX-03
    verification:
      - kind: unit
        ref: scripts/local-verify.test.mjs#generated main-browser selection owns each migrated spec exactly once
        status: pass
      - kind: unit
        ref: scripts/local-verify.test.mjs#main-browser environment exposes only generated facts and rejects canonical authority
        status: pass
    human_judgment: false
  - id: D3
    description: Generated browser paths are unique and absent after both successful and fault-injected runs while canonical blogxlocal and port 3100 are rejected.
    requirement: DEVX-03
    verification:
      - kind: unit
        ref: scripts/local-verify.test.mjs#generated main-browser fixture schedules exact specs and cleans its paths once on success and failure
        status: pass
      - kind: other
        ref: node scripts/check-boundaries.mjs
        status: pass
    human_judgment: false
duration: 25min
completed: 2026-08-30
status: complete
---

# Phase 08 Plan 06: Generated Main-Browser Fixture Summary

**Six formerly self-spawning Web journeys now run solely against one generated, scenario-seeded fixture whose ports, database, identities and temporary paths are isolated and cleaned fail-closed.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-08-30T07:51:00Z
- **Completed:** 2026-08-30T08:16:33Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Removed API/Next child spawning, fixed 3100/3001 origins, direct database access, lifecycle hooks and missing-fixture skips from all six migrated specs.
- Preserved lifecycle, authentication, draft preview, public list, technical reading and walking-skeleton assertions with run-scoped identities and runner-seeded session/list facts.
- Added one exact main-browser scheduler that derives its six paths from frozen inventory ownership, strips inherited authority and records pass-only per-path results.
- Added generated backup/media paths with strict success/failure removal checks; existing outer generated Compose cleanup remains the sole container/volume owner.

## Task Commits

Each TDD task was committed as RED then GREEN:

1. **Task 1 RED: Web fixture ownership contract** — `9e98f7b` (`test`)
2. **Task 1 GREEN: runner-supplied Web facts** — `b93f534` (`feat`)
3. **Task 2 RED: generated fixture lifecycle contract** — `7ab4921` (`test`)
4. **Task 2 GREEN: generated main-browser owner** — `78dc378` (`feat`)

## Files Created/Modified

- `apps/web/e2e/article-lifecycle.spec.ts` — runner-bound lifecycle journey with run-scoped article identity.
- `apps/web/e2e/auth-session.spec.ts` — opaque expired/revoked runner token facts replace database mutation.
- `apps/web/e2e/draft-preview.spec.ts` — generated origin and identity with no embedded processes.
- `apps/web/e2e/public-list.spec.ts` — consumes run-scoped 12-article scenario seed and retains lifecycle visibility checks.
- `apps/web/e2e/public-reading.spec.ts` — creates only run-scoped visible/hidden reading states through UI.
- `apps/web/e2e/walking-skeleton.spec.ts` — generated-origin publishing journey with no lifecycle ownership.
- `scripts/local-verify.mjs` — exact selection, environment narrowing, scenario seed, scheduler and path cleanup owner.
- `scripts/local-verify.test.mjs` — source prohibitions, authority validation, cardinality and fault-cleanup regressions.

## Decisions Made

- Required fixture facts throw immediately instead of turning missing infrastructure into skipped Playwright tests.
- Auth expiry/revocation is prepared by the runner as opaque tokens so browser code never receives database authority.
- The six paths run sequentially with scenario data reset before each path; this preserves exact assertions without duplicating infrastructure ownership.
- Plan 08-07 remains responsible for invoking this fixture from the complete canonical integration producer and changing signed acceptance schemas.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None. No dependency, Docker, canonical runtime, cloud server or production configuration was changed.

## Verification

- Task 1 source contract — 1/1 passed, zero skipped/TODO.
- `corepack pnpm exec tsc --noEmit --project apps/web/tsconfig.json` — passed.
- `node --test scripts/local-verify.test.mjs` — 33/33 passed, zero failed/cancelled/skipped/TODO.
- `corepack pnpm test` — 38/38 passed: Contracts 10, API 15, Web 13; release remained `BLOCKED`.
- `node scripts/check-boundaries.mjs` — 425 files checked, zero findings.
- Prohibition scan and `git diff --check` — passed.
- Real `test:integration` and `local:deliver` were not invoked; canonical `blogxlocal`, port 3100, both servers and historical receipts were untouched.

## Next Phase Readiness

- Plan 08-07 can compose this fixture with the remaining generated database/media/browser owners and attest all integration-owned paths exactly once.
- Production remains `BLOCKED`.

## Self-Check: PASSED

All eight modified files exist, all four TDD commits are present, focused/default/type/boundary checks pass, and the worktree is clean apart from this summary before metadata closeout.

---
*Phase: 08-reliable-local-delivery*
*Completed: 2026-08-30*
