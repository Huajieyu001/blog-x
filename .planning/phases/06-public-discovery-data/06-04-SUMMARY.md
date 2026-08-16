---
phase: 06-public-discovery-data
plan: "04"
subsystem: local-delivery
tags: [docker, pnpm, offline-build, seed-store, rollback, provenance]
requires:
  - phase: 06-public-discovery-data
    provides: strict public discovery implementation and an identified stale fixed-runtime gap
provides:
  - sanitized dependency-seed Docker targets rooted only at /refresh-workspace
  - deterministic pnpm version-store relocation with canonical manifest verification
  - fail-closed offline refresh planning, probe, provenance and rollback primitives
affects: [06-05, phase-08-reliable-local-delivery]
actuals:
  tokens: 4700
  tasks: 2
  commits: 3
tech-stack:
  added: []
  patterns:
    - dependency seed is data-only; inherited application trees are removed before current source is copied
    - offline Docker probes use generated tags, network-none builds, and deterministic cleanup
key-files:
  created:
    - apps/api/Dockerfile.refresh
    - apps/web/Dockerfile.refresh
    - scripts/refresh-seed-store.mjs
    - scripts/refresh-local.mjs
  modified:
    - scripts/refresh-local.test.mjs
key-decisions:
  - "Relocate the complete pnpm v<digits> store into pnpm's computed neutral path before deleting the inherited application tree."
  - "Keep the fixed refresh entry fail-closed in this implementation plan; only the generated offline probe runs here, while 06-05 owns the one mutating refresh."
requirements-completed: [SRCH-01, SRCH-02, SRCH-03, READ-08]
coverage:
  - id: D1
    description: Sanitized API and Web refresh images use current manifests and source under /refresh-workspace with an offline neutral pnpm store.
    requirement: SRCH-01
    verification:
      - kind: integration
        ref: node scripts/refresh-local.mjs --probe-offline-builds
        status: pass
      - kind: unit
        ref: scripts/refresh-local.test.mjs#source contracts require neutral stores, offline frozen installs and sanitized refresh workspaces
        status: pass
    human_judgment: false
  - id: D2
    description: Refresh orchestration enforces fixed authority, two-image pre-mutation barriers, sanitized evidence ordering, and API/Web-only rollback.
    requirement: READ-08
    verification:
      - kind: unit
        ref: scripts/refresh-local.test.mjs#refresh plan has one fixed local authority and offline two-image barrier before mutation
        status: pass
      - kind: unit
        ref: scripts/refresh-local.test.mjs#a post-start failure rolls back only api and web and suppresses evidence
        status: pass
    human_judgment: false
duration: 0h 0m
completed: 2026-08-16
status: complete
---

# Phase 6 Plan 04: Sanitized Offline Fixed Refresh Summary

**Current-source API and Web targets can be rebuilt from sanitized offline dependency seeds, with the fixed runtime mutation deliberately deferred to the ordered 06-05 execution.**

## Performance

- **Tasks:** 2 completed
- **Files modified:** 6
- **TDD:** RED then GREEN product commits preserved

## Accomplishments

- Added exact pnpm store-path discovery, canonical file/symlink manifest comparison, verified version-directory relocation, and only-then deletion of inherited source/store trees.
- Added API/Web refresh Dockerfiles that install from the neutral store with `--offline --frozen-lockfile`, copy current source only after dependency restoration, and execute under `/refresh-workspace`.
- Added a fixed-authority refresh state machine with offline two-target build barriers, provenance/filesystem validators, evidence-read mode, and API/Web-only post-start rollback; the bare live entry fails closed in this plan.
- Built both disposable API/Web probe targets with `--network=none --pull=false` from the committed GREEN revision and confirmed cleanup; no Compose action, volume action, runtime evidence, or `blogxlocal` refresh occurred.

## Task Commits

1. **Task 1: Specify sanitized seed and refresh safety behavior in RED** — `f2a2cd5` (`test(06-04): specify offline fixed refresh controls`)
2. **Task 2: Implement sanitized offline images and orchestrator** — `c8ab22a` (`feat(06-04): add sanitized offline refresh primitive`)

## Files Created/Modified

- `apps/api/Dockerfile.refresh` — current-source API target built from a data-only seed.
- `apps/web/Dockerfile.refresh` — current-source production Web target with fixed local origin.
- `scripts/refresh-seed-store.mjs` — shell-free pnpm store discovery, canonical comparison, relocation, and legacy-tree removal.
- `scripts/refresh-local.mjs` — fixed authority constants, build/provenance/filesystem guards, probe mode, read-only evidence verifier, and rollback sequencing primitives.
- `scripts/refresh-local.test.mjs` — RED/GREEN checks for relocation, barriers, filesystem rejection, rollback, evidence, and source contracts.

## Validation Results

- `node --test scripts/refresh-local.test.mjs` — 9 passed.
- `node scripts/refresh-local.mjs --probe-offline-builds` — passed for API and Web (`OFFLINE REFRESH PROBES PASSED c8ab22a`).
- `node --test scripts/local-verify.test.mjs` — 27 passed.
- `corepack pnpm -r typecheck` — contracts, API, and Web passed.
- `node scripts/check-boundaries.mjs` — 332 files checked, 0 findings.
- `node scripts/release-gate.mjs --evidence=ops/release-evidence.blocked.json --expect-blocked` — `RELEASE BLOCKED` as required.
- Protected-artifact diff for `.planning/milestones`, `ops/phase5-full-gate-receipt.json`, and `06-VERIFICATION.md` — clean.

## Decisions Made

- A seed image contributes only the pnpm content-addressed store. The helper validates pnpm's exact source and neutral `v<digits>` paths, verifies equal manifests, then removes inherited `/workspace` before the target source is reconstructed.
- This plan does not make the fixed runtime mutable. `--probe-offline-builds` is the sole Docker action and uses generated tags with `--network=none --pull=false`; 06-05 alone owns the actual fixed `blogxlocal` cutover and evidence.

## Deviations from Plan

None — plan execution stayed within its stated offline-probe-only authority.

## Issues Encountered

- The first RED shell wrapper used zsh's read-only `status` parameter; rerunning it with `exit_status` captured the intended missing-module RED failure without changing product state.
- Docker access requires the local engine permission boundary. The approved offline probe completed without registry fallback and left no generated probe tags.

## User Setup Required

None.

## Next Phase Readiness

- Plan 06-05 can now start from the clean committed GREEN revision and invoke its one permitted fixed refresh command.
- Actual `blogxlocal` API/Web recreation, persistent-data comparison, runtime evidence publication, 06-03 closure documentation, and any Phase 6 verification/status decision remain exclusively owned by 06-05 and an independent verifier.
- Production remains `BLOCKED`; no server, SSH, deploy, push, or production-state change occurred.

## Self-Check: PASSED

- RED and GREEN commits are present in order, all required checks passed, and only the summary remains uncommitted.

---

*Phase: 06-public-discovery-data*
*Completed: 2026-08-16*
