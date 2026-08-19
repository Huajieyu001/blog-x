---
phase: quick
plan: "260816-rol-correct-sealed-refresh-archive-route-con"
subsystem: local-refresh
tags: [archives, route-authority, evidence-v4, verifier, tdd]
requires:
  - phase: quick-260816-pzr
    provides: strict sealed local-refresh runtime authority and Compose v5 compatibility
provides:
  - Exact plural /archives authority across raw facts, sanitized projection and evidence v4 schema
  - Sealed /archives fetch with singular-route exclusion and redirect:error preservation
  - Fake-boundary verifier coverage rejecting singular-only evidence route drift
affects: [local-refresh, route-authority, phase6-verification]
actuals:
  tokens: 3300
  tasks: 2
  commits: 3
tech-stack:
  added: []
  patterns: [single-route-authority, strict-key-rejection, fake-boundary-verification]
key-files:
  created:
    - .planning/quick/260816-rol-correct-sealed-refresh-archive-route-con/260816-rol-correct-sealed-refresh-archive-route-con-SUMMARY.md
  modified:
    - scripts/refresh-local-facts.mjs
    - scripts/refresh-local-runtime-core.mjs
    - scripts/refresh-local.test.mjs
key-decisions:
  - "Used one exact plural route key throughout collection, facts, projection and evidence verification; no alias or normalization was added."
  - "Constructed singular negative cases from the plural literal so the active source scan can prove no standalone singular route remains."
patterns-established:
  - "Sealed route authorities use one identical exact-key set across raw collection, sanitized persistence and read-only reconstruction."
requirements-completed: []
coverage:
  - id: D1
    description: Raw route facts and sanitized projections require plural archives and reject singular-only or dual authority.
    verification:
      - kind: unit
        ref: scripts/refresh-local.test.mjs#route facts and sanitized projections require one plural archives authority
        status: pass
    human_judgment: false
  - id: D2
    description: The real sealed route source fetches plural archives exactly once with redirect:error and never requests singular authority.
    verification:
      - kind: unit
        ref: scripts/refresh-local.test.mjs#route collection fetches plural archives exactly once and never requests singular authority
        status: pass
    human_judgment: false
  - id: D3
    description: Every v4 evidence stage persists plural archives only and the read-only verifier rejects singular-route evidence drift.
    verification:
      - kind: unit
        ref: scripts/refresh-local.test.mjs#complete fake live refresh uses target API one-off, immutable cutover and sanitized atomic v4 evidence
        status: pass
    human_judgment: false
duration: 8min
completed: 2026-08-16
status: complete
---

# Quick Task: Correct Sealed Refresh Archive Route Contract Summary

**The sealed refresh pipeline now uses canonical `/archives` consistently from raw collection through evidence v4 reconstruction.**

## Performance

- **Duration:** 8 min
- **Completed:** 2026-08-16T20:04:31+08:00
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Replaced the singular route key in both strict fact/projection and evidence-v4 key authorities.
- Updated the sealed route collector to fetch `/archives` once while retaining exact status, bounded digest and `redirect: "error"` behavior.
- Added raw-fact, sanitized-projection, fetch-trace and read-only verifier regressions proving singular-only and dual-key inputs are rejected.

## Task Commits

1. **Task 1: Commit RED plural archive-route authority tests** - `bf982f7` (test)
2. **Task 2: Replace the sealed route key and restore GREEN** - `5040058` (fix)
3. **Execution summary** - documented in the commit containing this file

## Files Created/Modified

- `scripts/refresh-local-facts.mjs` - Canonical raw and projected `/archives` key and HTML contract.
- `scripts/refresh-local-runtime-core.mjs` - Plural route-source request and matching strict evidence-v4 key schema.
- `scripts/refresh-local.test.mjs` - Canonical fixtures plus strict fact, fetch and verifier regression coverage.
- This summary - execution record and machine-readable coverage map.

## Decisions Made

- Kept the archive contract fail-closed: singular-only and dual-key objects are invalid rather than migrated or normalized.
- Preserved the seven-route authority, route order, HTTP contract, evidence version and every non-archive route unchanged.
- Left application routing and all historical phase records untouched because the application and active 06-11 plan already use the plural route.

## Deviations from Plan

None - plan executed as specified.

## Issues Encountered

- Repository index locking required the already-approved scoped staging operation to be retried with managed approval; no content or task scope changed.

## User Setup Required

None - no external service configuration required.

## Validation Results

- `node --test scripts/refresh-local.test.mjs` — 40/40 pass.
- `node --test scripts/local-verify.test.mjs` — 27/27 pass.
- `corepack pnpm -r typecheck` — pass.
- `node scripts/check-boundaries.mjs` — 358 files checked, 0 findings.
- `node scripts/release-gate.mjs --evidence=ops/release-evidence.blocked.json --expect-blocked` — canonical release state remains `BLOCKED`.
- Scoped source scan — `/archives` is present and no standalone singular literal remains in the three declared active files.
- `git diff --check` — pass.
- Protected planning, milestone, receipt, runtime-evidence, verification, requirement, roadmap, state and release-evidence paths remain unchanged from `eb6ea25b6fc15d9f1c77a21f82eb3fd5722a912c`.

## Next Phase Readiness

- A future separately authorized refresh attempt can use the corrected committed route authority.
- The consumed `eb6ea25b6fc15d9f1c77a21f82eb3fd5722a912c` attempt remains historical, untouched and unretried.

## Self-Check: PASSED

- RED and GREEN commits exist: `bf982f7`, `5040058`.
- Focused tests, regressions, typecheck, boundary audit, canonical release-state gate and diff check passed.
- Only the three declared code/test files and this summary changed; historical and protected repository artifacts remain unchanged.
- No Docker/Compose, bare refresh/probe, claim/report/evidence, browser/network, server, deployment or push action was performed.

---
*Phase: quick*
*Completed: 2026-08-16*
