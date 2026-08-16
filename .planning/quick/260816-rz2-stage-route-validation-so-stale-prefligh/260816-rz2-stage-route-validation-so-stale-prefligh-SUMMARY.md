---
phase: quick
plan: "260816-rz2-stage-route-validation-so-stale-prefligh"
subsystem: local-refresh
tags: [route-observation, content-type, evidence-v4, rollback, verifier, tdd]
requires:
  - phase: quick-260816-rol
    provides: canonical plural archives route authority across sealed collection and evidence
provides:
  - Stage-aware route observation and strict final-contract validators
  - Media-type-aware bounded route collection for stale HTML and JSON responses
  - Observation-safe failure digests and pre-cutover v4 evidence projections
  - Strict postCutover evidence schema and sealed verifier reconstruction
affects: [local-refresh, failure-reporting, evidence-v4, phase6-verification]
actuals:
  tokens: 10109
  tasks: 2
  commits: 3
tech-stack:
  added: []
  patterns: [observation-final-contract-split, explicit-projection-mode, content-aware-json-decoding]
key-files:
  created:
    - .planning/quick/260816-rz2-stage-route-validation-so-stale-prefligh/260816-rz2-stage-route-validation-so-stale-prefligh-SUMMARY.md
  modified:
    - scripts/refresh-local-facts.mjs
    - scripts/refresh-local-runtime-core.mjs
    - scripts/refresh-local.test.mjs
key-decisions:
  - "Kept raw collection structural and observation-only; final route authority remains explicit at postCutover, evidence final-stage and verifier boundaries."
  - "Projected every API observation with a deterministic contractSha256 field whose value is either a canonical JSON digest or null."
  - "Required rollback callers to provide the original preflight route baseline and compare the full observation object exactly."
patterns-established:
  - "Lifecycle inputs are observed before mutation and promoted to success claims only at explicit terminal proof boundaries."
  - "Response bodies are parsed only when a normalized media type is application/json or has a +json suffix."
requirements-completed: []
coverage:
  - id: D1
    description: Bounded route collection accepts stale HTML and JSON observations by declared media type while rejecting malformed declared JSON.
    verification:
      - kind: unit
        ref: scripts/refresh-local.test.mjs#route collection records stale HTML and JSON API observations by declared media type
        status: pass
    human_judgment: false
  - id: D2
    description: Stale preflight reaches both builds, pre-cutover observations stay exact, final routes stay strict and rollback restores the explicit baseline.
    verification:
      - kind: unit
        ref: scripts/refresh-local.test.mjs#stale preflight reaches both builds but exact observation drift stops before cutover
        status: pass
      - kind: unit
        ref: scripts/refresh-local.test.mjs#stale postCutover fails final authority and rollback must restore exact stale observations
        status: pass
    human_judgment: false
  - id: D3
    description: Failure recollection hashes deterministic stale-route projections without retaining response bodies, media types or URLs.
    verification:
      - kind: unit
        ref: scripts/refresh-local.test.mjs#failure recollection hashes stale route projections without retaining raw responses
        status: pass
    human_judgment: false
  - id: D4
    description: Evidence v4 permits equal stale pre-cutover projections and requires exact final postCutover contracts during publication and read-only verification.
    verification:
      - kind: unit
        ref: scripts/refresh-local.test.mjs#complete fake live refresh uses target API one-off, immutable cutover and sanitized atomic v4 evidence
        status: pass
    human_judgment: false
duration: 7min
completed: 2026-08-16
status: complete
---

# Quick Task: Stage-Aware Route Validation Summary

**Sealed refresh now observes stale fixed-runtime routes before mutation while retaining strict final route authority for cutover, evidence and verification.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-08-16T20:15:08+08:00
- **Completed:** 2026-08-16T20:22:15+08:00
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Split route validation into exact structural observations and exact final contracts, with a fail-closed final default for sanitized projection.
- Made the sealed source parse bodies only for case-insensitive `application/json` or `+json` media types while preserving the fixed paths, same-origin URL, redirect policy and 1 MiB bound.
- Preserved exact preflight-to-postMigration observations and explicit rollback restoration while allowing a stale runtime to reach offline builds.
- Kept failure reports body-free and evidence v4 deterministic, with strict postCutover contract digests and strict verifier reconstruction.

## Task Commits

1. **Task 1: Commit RED lifecycle-aware stale route tests** - `72fea5b` (test)
2. **Task 2: Implement stage-aware observation and final route authority** - `1f0e7e0` (fix)
3. **Execution summary** - documented in the commit containing this file

## Files Created/Modified

- `scripts/refresh-local-facts.mjs` - Observation validator, final validator composition, projection modes and explicit rollback baseline.
- `scripts/refresh-local-runtime-core.mjs` - Content-aware collection, observation-safe failure/evidence projections and strict final evidence/verifier gates.
- `scripts/refresh-local.test.mjs` - Stale route fixtures and source, lifecycle, rollback, failure-report, evidence and verifier regressions.
- This summary - execution record and deterministic coverage map.

## Decisions Made

- Observation mode accepts only exact canonical keys, non-redirect HTTP statuses, lowercase SHA-256 body digests and optional valid JSON values.
- API projections always include `contractSha256`; non-JSON observations use `null`, avoiding ambiguity without persisting raw content.
- Preflight and postMigration evidence routes must be exactly equal, while postCutover is checked against fixed status and canonical contract digests.
- The verifier reconstructs observations through the same sealed source, then explicitly promotes them through final projection validation before comparison.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Repository index locking required the already-approved scoped staging operation to be retried with managed approval; content and scope were unchanged.

## User Setup Required

None - no external service configuration required.

## Validation Results

- `node --test scripts/refresh-local.test.mjs` — 46/46 pass.
- `node --test scripts/local-verify.test.mjs` — 27/27 pass.
- `corepack pnpm -r typecheck` — pass.
- `node scripts/check-boundaries.mjs` — 360 files checked, 0 findings.
- `node scripts/release-gate.mjs --evidence=ops/release-evidence.blocked.json --expect-blocked` — canonical release state remains `BLOCKED`.
- `git diff --check` — pass.
- Stub/skip scan over the three declared files found no new placeholders or skipped tests.
- Protected planning, milestone, receipt, runtime-evidence, verification, requirement, roadmap, state and release-evidence paths remain unchanged from `b6a72d43dca668cd0208226c2813c848e11e7921`.

## Next Phase Readiness

- A future separately authorized refresh can observe stale Phase 6 routes, reach offline builds and prove only a strict final runtime.
- The consumed `b6a72d43dca668cd0208226c2813c848e11e7921` attempt remains historical, untouched and unretried.

## Self-Check: PASSED

- RED and GREEN commits exist: `72fea5b`, `1f0e7e0`.
- Focused tests, regressions, typecheck, boundary audit, canonical release-state gate and diff check passed.
- Only the three declared code/test files and this summary changed; historical and protected repository artifacts remain unchanged.
- No Docker/Compose, bare refresh/probe, claim/report/evidence CLI, browser/network, server, deployment or push action was performed.

---
*Phase: quick*
*Completed: 2026-08-16*
