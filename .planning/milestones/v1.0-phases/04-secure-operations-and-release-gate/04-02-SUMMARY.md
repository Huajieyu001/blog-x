---
phase: 04-secure-operations-and-release-gate
plan: "02"
subsystem: operations, backup, restore, testing
tags: [docker-compose, postgres, pg-dump, pg-restore, sha256, playwright, systemd]
requires:
  - phase: 04-01
    provides: fail-closed local security runner, Web-edge-only topology, and value-free production policy
  - phase: 03-04
    provides: strict portable Markdown export version 1 and independent authority-map comparison
provides:
  - bounded local service restart/log lifecycle and redacted operator status
  - atomic versioned PostgreSQL/export/media/config backup sets with integrity markers
  - preflight-first generated-target restore with database/media/browser equivalence proof
  - dormant daily scheduling contract and explicit unresolved production recovery decisions
affects: [04-03-release-gate, production-operations, disaster-recovery]
actuals:
  tokens: 24004
  tasks: 3
  commits: 8
tech-stack:
  added: []
  patterns: [read-only restore preflight before mutation, atomic complete-set publication, generated namespace cleanup, three-authority recovery comparison]
key-files:
  created: [scripts/ops-status.mjs, scripts/backup/create.mjs, scripts/backup/manifest.mjs, scripts/backup/restore.mjs, apps/api/test/backup-restore.test.ts, apps/web/e2e/phase4-restore.spec.ts, docs/OPERATIONS.md]
  modified: [compose.yaml, apps/api/src/app.ts, scripts/local-verify.mjs, scripts/local-verify.test.mjs]
key-decisions:
  - "Automatic recovery faults the actual API application child after Docker restart policy activation, because a daemon-level manual container stop is intentionally not restarted."
  - "A backup becomes restorable only after exact member/hash validation and a final manifest-bound COMPLETE marker followed by an atomic rename."
  - "Restore has no active-target override: all backup and target validation plus emptiness inspection completes before the first container, database, or media mutation."
  - "Recovery evidence remains local and generated; TLS, resource limits, off-host destination, retention, alerts, private links, and measured RPO/RTO stay unresolved for 04-03."
patterns-established:
  - "Complete backup authority: PostgreSQL custom dump + unchanged portable export v1 + all source/derivative bytes + sanitized config inventory."
  - "Restore proof: normalized retained content deep equality + every media SHA-256 + same-origin Playwright publication/confidentiality journey."
requirements-completed: [OPS-02, OPS-03, SEC-03, OPS-01]
coverage:
  - id: D1
    description: Generated local PostgreSQL/API/Web services have bounded logs, explicit lifecycle policy, and automatic API recovery without replacing persistent volumes.
    requirement: OPS-02
    verification:
      - kind: integration
        ref: corepack pnpm local:verify -- --phase4-operations
        status: pass
    human_judgment: false
  - id: D2
    description: Operator status fails closed on required local health/resource uncertainty, redacts sensitive authority, and labels absent TLS evidence NOT_EVALUATED.
    requirement: OPS-02
    verification:
      - kind: unit
        ref: scripts/ops-status.test.mjs
        status: pass
      - kind: integration
        ref: corepack pnpm local:verify -- --phase4-operations
        status: pass
    human_judgment: false
  - id: D3
    description: Atomic complete backup sets bind the database, portable export, all media bytes, and sanitized configuration to strict manifests and final completeness markers.
    requirement: OPS-03
    verification:
      - kind: unit
        ref: scripts/backup/backup.test.mjs
        status: pass
      - kind: integration
        ref: corepack pnpm local:verify -- --phase4-operations
        status: pass
    human_judgment: false
  - id: D4
    description: A complete backup restores only into a generated empty topology and reproduces retained database authority, media bytes, and published-only browser behavior under interruption and parallel isolation.
    requirement: OPS-03
    verification:
      - kind: unit
        ref: scripts/backup/restore.test.mjs
        status: pass
      - kind: integration
        ref: apps/api/test/backup-restore.test.ts
        status: pass
      - kind: e2e
        ref: apps/web/e2e/phase4-restore.spec.ts
        status: pass
      - kind: integration
        ref: corepack pnpm local:verify -- --phase4-restore --interruption-check --parallel-check
        status: pass
    human_judgment: false
duration: 42min
completed: 2026-08-09
status: complete
---

# Phase 04 Plan 02: Local Operations and Complete Recovery Summary

**Blog X now has bounded local process operations, atomically complete four-authority backups, and an isolated restore rehearsal proven by database, byte, and same-origin browser equivalence.**

## Performance

- **Duration:** 42 min
- **Started:** 2026-08-09T11:42:40Z
- **Completed:** 2026-08-09T12:23:50Z
- **Tasks:** 3
- **Files modified:** 26

## Accomplishments

- Added explicit init/restart/log retention policy plus a redacted fail-closed status command and a real 30-second API recovery/volume-identity tracer.
- Added restrictive atomic backup creation and verification spanning PostgreSQL dump, strict portable export v1, all media bytes, and sanitized runtime inventory, with a dormant daily scheduling contract.
- Added read-only restore preflight, generated-only target mutation, normal migration/schema verification, independent content/media equality, same-origin Playwright visibility proof, and interruption/parallel cleanup gates.

## Task Commits

1. **Task 1: Bounded recovery and operator status** — `ac4c229` (RED), `21a2868` (GREEN)
2. **Task 2: Atomic complete backup sets** — `c616758` (RED), `6acc7dc` (GREEN)
3. **Task 3: Isolated authoritative restore** — `09b6faf`, `22ac593` (RED), `deb539d`, `b8b299d` (GREEN)

## Acceptance Evidence

- `node --test scripts/backup/restore.test.mjs scripts/local-verify.test.mjs` — 22 passed, 0 failed/skipped/todo.
- `corepack pnpm -r typecheck` — all workspace packages passed.
- `node scripts/check-boundaries.mjs` — passed.
- `corepack pnpm local:verify -- --phase4-operations` — passed with API automatic recovery, status, complete backup, clean logs, and exact cleanup.
- `corepack pnpm local:verify -- --phase4-restore --interruption-check --parallel-check` — exit 0 after one interrupted migration, one full source-to-restore comparison, and two simultaneous isolated restore rehearsals.

## Files Created/Modified

- `scripts/ops-status.mjs` and `compose.yaml` — bounded lifecycle/logging and minimal redacted local status.
- `scripts/backup/{policy,paths,manifest,create,verify,restore}.mjs` — strict backup/restore authority and orchestration.
- `apps/api/src/ops/portable-export.ts` — local one-shot adapter for the unchanged portable export repository.
- `apps/api/test/backup-restore.test.ts` — independent restored source-map, relation, and media-hash comparison.
- `apps/web/e2e/phase4-restore.spec.ts` — restored same-origin public/media and non-public confidentiality proof.
- `ops/systemd/blog-x-backup.{service,timer}` and `docs/OPERATIONS.md` — dormant schedule contract and recovery runbook.
- `scripts/local-verify.mjs` — canonical operations and restore modes with interruption, parallel isolation, and exact cleanup.

## Decisions Made

- Treat manual daemon-level container stop as an operator stop; fault the actual API application process after Docker's restart grace period to verify the configured automatic recovery behavior.
- Keep all backup payloads under restrictive generated temporary roots; publish only after exact verification and never replace an existing complete set.
- Permit restore only to a generated, empty, loopback-only target with no production/active override, and keep the source backup immutable until all comparison layers pass.
- Keep production resource, TLS, network, off-host, retention, encryption, alert, and recovery-objective statements explicitly unresolved instead of deriving them from local results.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Runtime semantics] Used application-process termination for the recovery tracer.**
- **Found during:** Task 1.
- **Issue:** Docker correctly does not apply restart policy after an explicit daemon-level `docker kill`, so that action could not prove process-crash recovery.
- **Fix:** Waited for restart-policy activation, resolved the exact generated API application child, terminated it, and required restart-count increase plus Web health within 30 seconds.
- **Verification:** `corepack pnpm local:verify -- --phase4-operations` passed with restart count 1 and unchanged volume creation identities.
- **Committed in:** `21a2868`.

**2. [Rule 3 - Historical-state fixture] Seeded the deterministic restore authority directly in the runner-owned source database.**
- **Found during:** Task 3.
- **Issue:** A published row with null publication time represents retained historical/corruptible state that the normal API intentionally refuses to create, but the recovery contract must still preserve and keep it non-public.
- **Fix:** Used fixed generated-database rows and validated media files for the complete retained-state matrix; all restored public behavior was exercised only through the normal Web/API boundary.
- **Verification:** Independent portable authority equality, media SHA-256 comparison, and Playwright published/non-public checks all passed.
- **Committed in:** `b8b299d`.

**Total deviations:** 2 auto-fixed (runtime semantics: 1, historical recovery fixture: 1).
**Impact:** Both changes were necessary to test the intended failure and retained-state contracts without weakening runtime APIs or adding production-only capabilities.

## Issues Encountered

- An initial diagnostic used `--skip-build`, so the cached API image predated the new authority-comparison test and could not find it. Exact `finally` cleanup ran; the canonical command rebuilt the images and passed completely.

## User Setup Required

None - all evidence was generated locally. Production backup destinations, retention, encryption, alerts, resource limits, TLS, private links, and RPO/RTO remain deliberate 04-03 inputs rather than setup performed here.

## Next Phase Readiness

Ready for 04-03 release-gate evidence and deployment-decision work. Local process recovery and complete restore evidence are available, while all cloud hosts—including the frozen main server—remain untouched.

## Self-Check: PASSED

- All eight production/test commits exist and all 26 changed artifacts are tracked.
- Both prohibition subjects behave correctly: broad/incomplete controls fail, generated/complete controls pass.
- Canonical operations and restore modes passed without skips, TODOs, external traffic, secret leakage, or leftover generated namespaces.

---
*Phase: 04-secure-operations-and-release-gate*
*Completed: 2026-08-09*
