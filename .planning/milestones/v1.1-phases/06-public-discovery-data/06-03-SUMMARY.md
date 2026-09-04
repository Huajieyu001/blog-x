---
phase: 06-public-discovery-data
plan: "03"
subsystem: testing
tags: [docker-compose, postgresql, interruption, parallel-verification, offline-cache]
requires:
  - phase: 06-public-discovery-data
    plan: "02"
    provides: strict public discovery routes and generated PostgreSQL semantic suites
provides:
  - isolated --phase6-data verifier with strict suite selection and no Phase 5 receipt authority
  - real migration interruption recovery and two-child Phase 6 parallel verification
  - immutable v1 evidence and fixed blogxlocal non-mutation proof across the generated gate
  - fail-closed local refresh preflight when the Docker frozen-install cache is absent
affects: [07-responsive-discovery-experience, 08-reliable-local-delivery]
actuals:
  tokens: 4679
  tasks: 3
  commits: 6
tech-stack:
  added: []
  patterns: [read-only committed-source verifier mounts, generated namespace cleanup, fail-closed offline refresh]
key-files:
  created:
    - .planning/phases/06-public-discovery-data/06-03-SUMMARY.md
  modified:
    - scripts/local-verify.mjs
    - scripts/local-verify.test.mjs
    - packages/contracts/src/public-discovery.ts
key-decisions:
  - "Reuse prevalidated installed verifier dependencies with current committed API/contracts sources mounted read-only when the classic Docker install layer is unavailable."
  - "Run workspace typecheck/build once in the parent while both internal children execute the complete Phase 6 database/node/boundary/release suite under distinct authorities."
  - "Stop the fixed blogxlocal refresh before migration or recreation because its required Docker install cache is missing; Phase 8 retains cache-loss recovery authority."
patterns-established:
  - "Phase-specific internal children prove semantic isolation without acquiring receipt authority or sharing build output."
  - "PostgreSQL 18 data-only dump comparisons remove random restrict/unrestrict guards before hashing."
requirements-completed: []
coverage:
  - id: D1
    description: Isolated Phase 6 data gate with strict nonzero TAP, interruption recovery, and two real parallel children
    requirement: SRCH-01
    verification:
      - kind: integration
        ref: corepack pnpm local:verify -- --phase6-data --interruption-check --parallel-check
        status: pass
    human_judgment: false
  - id: D2
    description: Complete archived v1 evidence and fixed blogxlocal runtime/data remain unchanged across generated verification
    requirement: SRCH-03
    verification:
      - kind: manual_procedural
        ref: before/after SHA-256, container, volume, normalized pg_dump, sequence, ledger, and media comparisons
        status: pass
    human_judgment: false
  - id: D3
    description: Fixed-project refresh fails closed before runtime mutation when the required offline Docker install cache is missing
    verification:
      - kind: manual_procedural
        ref: /private/tmp/blog-x-phase6-refresh-blocked.txt
        status: pass
    human_judgment: false
duration: 1h
completed: 2026-08-15
status: complete
---

# Phase 6 Plan 03: Isolated Data Gate Summary

**The exact generated Phase 6 gate passes with interruption and parallel evidence; the fixed local refresh safely stopped before mutation because its offline install cache is missing**

## Performance

- **Duration:** approximately 1 hour
- **Completed:** 2026-08-15T19:46:40+08:00
- **Tasks:** 3 execution paths completed, including the specified fail-closed refresh branch
- **Repository files modified:** 3 implementation/test files plus this summary

## Accomplishments

- Added `--phase6-data` with exact discovery/list/visibility/taxonomy/public-boundary selection, strict TAP enforcement, schema/boundary checks, and an explicit `RELEASE BLOCKED` terminal decision without receipt authority.
- Proved the exact three-flag gate from clean revision `588e9590e4dc5107756bfea76eb91f7dfc5ebed5`: the parent performed real migration kill/retry/retention checks, and two distinct internal children ran the full Phase 6 semantic set and cleaned their namespaces.
- Preserved every archived v1 evidence byte and all fixed `blogxlocal` container, volume, normalized business-data, sequence, ledger, and media facts across the generated gate.
- Ran the fixed-project refresh preflight and stopped before migration/service recreation when the frozen dependency-install build cache proved unavailable. The existing three-service local runtime remains healthy and unchanged.

## Task Commits

1. **Task 1: Add an isolated fail-closed Phase 6 data selection** — `b6996e5`
2. **Task 2 fix: Use cached installed dependencies with read-only committed source** — `e697237`
3. **Task 2 fix: Make discovery contracts resolvable by the Web bundler** — `9483b3c`
4. **Task 2 fix: Isolate semantic fixtures from the interruption sentinel** — `5f7618d`
5. **Task 2 fix: Avoid shared Next build output in parallel children** — `bfa88b3`
6. **Task 2 fix: Emit explicit per-child Phase 6 evidence** — `588e959`

## Files Created/Modified

- `scripts/local-verify.mjs` — Phase 6 selection, offline dependency-runtime path, interruption assertions, semantic runner, parallel-child execution/cleanup, and terminal markers.
- `scripts/local-verify.test.mjs` — exact selection, no-receipt, interruption, parallel, offline-source, and archived audit-path regressions.
- `packages/contracts/src/public-discovery.ts` — extensionless internal import compatible with both TypeScript and the Next/Turbopack production build.
- `/private/tmp/blog-x-phase6-pre-refresh.txt` — untracked pre-refresh authority snapshot.
- `/private/tmp/blog-x-phase6-refresh-blocked.txt` — untracked fail-closed refresh diagnostic.

## Decisions Made

- The generated gate may reuse an existing dependency-complete verifier image only as an installed runtime; the current clean committed API and contracts sources are mounted read-only, so semantic evidence never runs stale application code.
- Parallel children skip only the already-proven parent workspace build because concurrent Next builds share `.next`; each child still runs all selected Phase 6 database suites, local verifier tests, boundary audit, schema check, and pure BLOCKED release decision.
- The fixed local refresh did not use a derived Dockerfile, network fallback, stale retag, alternate Compose project, or volume replacement. Those would exceed Phase 6 authority when the planned Dockerfile cache is missing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Classic Docker dependency layer was missing**

- **Found during:** First exact gate attempt.
- **Issue:** `RUN corepack pnpm install --frozen-lockfile` attempted the registry and failed `EAI_AGAIN` because the current classic build cache lacked the frozen-install layer.
- **Fix:** Reused prevalidated installed verifier dependencies with current clean sources mounted read-only for generated semantic suites; no pull, install, network fallback, or stale-source execution occurred.
- **Committed in:** `e697237`.

**2. [Rule 1 - Bug] Next/Turbopack could not resolve a TypeScript source-relative `.js` import**

- **Found during:** Parent workspace build in the exact gate.
- **Fix:** Changed the discovery contract's internal source import to the repository's extensionless bundler convention.
- **Verification:** Contracts 10/10, workspace typecheck, and production Web build passed.
- **Committed in:** `9483b3c`.

**3. [Rule 1 - Bug] Interruption sentinel polluted the first semantic fixture count**

- **Found during:** Discovery suite in the exact gate.
- **Fix:** Reset generated Phase 6 acceptance data after proving sentinel preservation and before running selected suites.
- **Committed in:** `5f7618d`.

**4. [Rule 3 - Blocking] Parallel children contended on the shared Next build lock**

- **Found during:** First full parallel stage.
- **Fix:** Kept workspace typecheck/build in the parent and ran the complete Phase 6 semantic/boundary/release set in both children.
- **Committed in:** `bfa88b3` and `588e959`.

**Total deviations:** 4 auto-fixed (2 bugs, 2 blocking issues). **Impact:** The final exact gate is real, isolated, offline, and reproducible from the clean committed revision; no production or fixed-runtime authority was broadened.

## Issues Encountered

- PostgreSQL 18 emits random `\\restrict`/`\\unrestrict` guard tokens in plain dumps. Before/after business-data hashing removed only those non-data lines, producing stable digest `ed2d805d9d0bb2c5e06df646a4a8873ddd682bbb0a9f4288c7921fc9a60c8ea7`.
- The fixed-project refresh preflight confirmed that revision-tagged API/Web builds cannot use the planned Dockerfiles fully offline because the classic frozen-install cache layer is absent. Per plan, refresh stopped before migration or service recreation with `LOCAL REFRESH BLOCKED: OFFLINE CACHE MISSING`.

## User Setup Required

None. Phase 8 owns durable cache-loss/offline recovery automation; no manual server or production action is requested here.

## Next Phase Readiness

- The Phase 6 implementation and exact generated evidence are ready for an independent verifier.
- The current `blogxlocal` runtime remains healthy but still runs its prior image IDs; the new discovery APIs are implemented and gate-verified but are not yet served at `127.0.0.1:3100` because refresh failed closed.
- Phase 7 can build the responsive search/related UI against the strict contracts, while Phase 8 must restore a reproducible offline image-build path before the next fixed-project refresh.
- Production remains `BLOCKED`; neither cloud server was contacted.

## Self-Check: PASSED WITH SAFE REFRESH BLOCK

- Exact command exited 0 with one parent and two child Phase 6 pass/BLOCKED markers.
- No `blogxverify_*` container or volume remains.
- Archived v1 manifest digest remains `5eff3f994a503b4d844f97cc92d1aba01c867942b8f96f40226872da097889b1`.
- Fixed `blogxlocal` service/container/volume/data facts remain unchanged and healthy.
- Refresh made no runtime, migration, service, or volume mutation after the cache preflight failed.

---
*Phase: 06-public-discovery-data*
*Completed: 2026-08-15*

## Closure Addendum — 2026-08-16

This addendum closes the stale fixed-runtime observation recorded above without rewriting it. The original offline-cache safe stop, its conclusions, and every later audit/failed-attempt stop remain part of the permanent history.

### Preserved safe-stop and terminal-attempt history

- The original 06-03 bare refresh failed closed at `LOCAL REFRESH BLOCKED: OFFLINE CACHE MISSING`; it made no migration, service, volume, database, media, server, or release mutation.
- `b7fa05c5b41859e037ce6c5d361fc9ee7fc8d44b` consumed one bare invocation and safely stopped before Docker/Compose/database/volume/runtime/evidence/server/deploy mutation because the refresh still had no live adapter.
- `3221f99b6617180536f558583e2d84585113813c` stopped in pre-execution audit before invocation, claim, evidence, or mutation because adapter authority, persistence/provenance, rollback, argv/filesystem, and evidence reconstruction were not yet sufficient.
- `df4aa3b702409754cc52e6f761d2218114c9b2bc` stopped in an independent read-only audit before invocation, claim, evidence, or mutation. It identified incomplete v3 reconstruction, terminal-failure reporting gaps, ambient authority gaps, injectable production seams, and non-atomic claim/evidence invariants.
- `5cd4ec6b8342a7f086173d03d48e37a6793a2b4a` consumed its sole attempt and stopped terminally at Compose v5 NDJSON authority parsing. Its revision was not retried.
- `eb6ea25b6fc15d9f1c77a21f82eb3fd5722a912c` consumed its sole attempt and stopped terminally because the sealed route set used `/archive` instead of the canonical `/archives`. Its revision was not retried.
- `b6a72d43dca668cd0208226c2813c848e11e7921` consumed its sole attempt and stopped terminally because stale preflight search/related routes were incorrectly held to final strict contracts. Its revision was not retried.

### Successful fixed refresh

- Implementation revision `fd5ef1ba4b3c54f3c169d9fcfb931dba324ddbc5` consumed exactly one no-option refresh attempt and succeeded. Its claim digest is `66ce23a6dd32307143e88e7e8da5e88a9a467e5428637a879d879f7b4212344a`; the canonical failure-report check is absent.
- Evidence-only commit `719062d799a93b048ed0d6c83c79f531cdbf26ed` contains strict v4 evidence with SHA-256 `16704ea439990dd31797620555b46ac202fc6468e4716175246b874f41f596f6`.
- The fixed `blogxlocal` runtime now uses target API image `sha256:4d50e57382e1d47565d25aeabb1282f4610311735c37c13b43e3861094a10509` and Web image `sha256:1459d87bbad8e2b8f2e5a500f83bea4d85ee04356fef8f7e1c638f946269002b`; PostgreSQL identity, two named volumes, 38 business rows, normalized ledger state, zero media bytes, and protected history are preserved by the recorded stage digests.
- Final same-origin visibility at `http://127.0.0.1:3100` includes `/archives` 200, empty-query search 200, and the unknown-article related endpoint 404 under its strict final contract. Phase 7 search/related UI is not present yet.
- Release remains canonically `BLOCKED`. No cloud server, registry, deployment, push, production-unfreeze, or release transition was part of this closure.

This addendum and 06-11-SUMMARY are an executor handoff, not Phase 6 completion authority. A fresh independent verifier alone decides Phase 6 closure; `06-VERIFICATION.md`, REQUIREMENTS, ROADMAP, STATE completion, milestone/archive records, and the Phase 5 receipt remain untouched here.
