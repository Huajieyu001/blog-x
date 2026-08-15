---
phase: 04-secure-operations-and-release-gate
plan: "03"
subsystem: release, operations, security, testing
tags: [release-gate, rollback, evidence, sha256, docker, playwright, offline]
requires:
  - phase: 04-01
    provides: strict security, secret, and Web-edge-only topology evidence
  - phase: 04-02
    provides: bounded process operations, complete atomic backups, and isolated restore proof
provides:
  - strict local-only versioned release evidence schema and byte-bound validator
  - canonical locator-free BLOCKED production state that no local success can lift
  - role-based release and rollback STOP/GO runbooks with artifact-specific boundary checks
  - complete offline-preflighted Phase 1-4 local acceptance with interruption and parallel isolation
affects: [future-production-authorization, deployment, rollback, milestone-v1]
actuals:
  tokens: 13625
  tasks: 3
  commits: 6
tech-stack:
  added: []
  patterns: [byte-bound typed evidence bundle, canonical blocked state, non-deploying decision CLI, offline full-regression gate]
key-files:
  created: [scripts/release-gate/schema.mjs, scripts/release-gate/bundle.mjs, scripts/release-gate/validate.mjs, scripts/release-gate.mjs, scripts/release-gate.test.mjs, ops/release-evidence.blocked.json, docs/RELEASE-GATE.md, docs/ROLLBACK.md]
  modified: [scripts/local-verify.mjs, scripts/local-verify.test.mjs, scripts/check-boundaries.mjs, scripts/backup/restore.test.mjs, docs/OPERATIONS.md, README.md]
key-decisions:
  - "The canonical repository release document contains only pending reason codes: READY evidence locators exist solely in exact generated temporary bundles."
  - "The release validator reads and hashes local regular files only and deliberately has no networking, remote command, Git mutation, unfreeze, or deployment adapter."
  - "The final full gate preflights the prepared local dependency/image/install-layer authority and fails offline instead of attempting a registry fallback."
  - "Full acceptance resets only its exact generated media fixtures between historical browser suites and complete-backup validation; strict backup rejection of unreferenced bytes remains unchanged."
patterns-established:
  - "Release decision: malformed/unsafe evidence is INVALID/2, complete but unmet evidence is BLOCKED/1, canonical expect-blocked is BLOCKED/0, and only complete synthetic proof can be READY/0."
  - "Final local evidence: every Phase 1-4 suite, restored browser, canonical BLOCKED assertion, interrupted migration, and two parallel generated restore runs must pass together."
requirements-completed: [OPS-05, OPS-01, OPS-02, OPS-03]
coverage:
  - id: D1
    description: The real repository release state is strict-valid, locator-free, and permanently BLOCKED until future explicit user authorization and complete live evidence exist.
    requirement: OPS-05
    verification:
      - kind: unit
        ref: scripts/release-gate.test.mjs#canonical repository evidence is strict BLOCKED
        status: pass
      - kind: integration
        ref: node scripts/release-gate.mjs --evidence=ops/release-evidence.blocked.json --expect-blocked
        status: pass
    human_judgment: false
  - id: D2
    description: Strict generated evidence bundles require current authorization, two host baselines, private same-origin network, complete backup/restore, operations/TLS, immutable rollback, and post-release decisions bound to actual bytes.
    requirement: OPS-05
    verification:
      - kind: unit
        ref: scripts/release-gate.test.mjs#complete, missing, unsafe, rollback, parallel, and prohibition cases
        status: pass
    human_judgment: false
  - id: D3
    description: Release and rollback runbooks enumerate roles, evidence, preservation, owner, STOP conditions, and unresolved production decisions without executable deployment capability or invented values.
    requirement: OPS-05
    verification:
      - kind: unit
        ref: scripts/release-gate.test.mjs#release and rollback runbooks remain BLOCKED evidence workflows
        status: pass
      - kind: integration
        ref: corepack pnpm check:boundaries
        status: pass
    human_judgment: true
    rationale: Prose truthfulness—especially whether wording could be misread as live production, TLS, RPO, or RTO evidence—requires reviewer judgment in addition to automated forbidden-pattern checks.
  - id: D4
    description: The canonical Phase 1-4 local gate executes all database, API, browser, security, operations, backup, restore, and release evidence under offline, interruption, and parallel-isolation constraints.
    requirement: OPS-03
    verification:
      - kind: integration
        ref: corepack pnpm local:verify -- --phase4-full --interruption-check --parallel-check
        status: pass
      - kind: integration
        ref: corepack pnpm test:ops && corepack pnpm check:boundaries
        status: pass
    human_judgment: false
duration: 32min
completed: 2026-08-09
status: complete
---

# Phase 04 Plan 03: Frozen Release Gate and Full Acceptance Summary

**Blog X now ends its complete local v1 regression with a byte-bound, non-deploying release decision that proves local readiness while machine-enforcing that production remains BLOCKED.**

## Performance

- **Duration:** 32 min
- **Started:** 2026-08-09T12:26:00Z
- **Completed:** 2026-08-09T12:58:10Z
- **Tasks:** 3
- **Files modified:** 16

## Accomplishments

- Added a strict version-1 release evidence model whose current repository state is locator-free BLOCKED, plus a pure local validator that hashes and type-checks every generated READY artifact.
- Added role-based release and rollback STOP/GO documents and boundary checks that reject automatic release capability, tracked READY state, secret/address/data-plane leakage, and false production/TLS/RPO/RTO claims.
- Added the sole final `--phase4-full` gate covering all Phase 1-4 database/API/browser/security/operations/backup/restore/release evidence, offline prerequisites, interrupted migration, parallel isolation, redacted logs, exact cleanup, and final BLOCKED proof.

## Task Commits

1. **Task 1: Strict frozen release decision** — `2b13f93` (RED), `604846c` (GREEN)
2. **Task 2: Evidence-bound release and rollback safety** — `c282b49` (RED), `bea837f` (GREEN)
3. **Task 3: Full local regression and BLOCKED proof** — `6f50a6b` (RED), `d821224` (GREEN)

## Acceptance Evidence

- `node --test scripts/release-gate.test.mjs scripts/local-verify.test.mjs scripts/backup/restore.test.mjs scripts/backup/backup.test.mjs scripts/ops-status.test.mjs` — 44 passed, 0 failed/skipped/todo.
- `corepack pnpm -r typecheck` — all workspace packages passed.
- `corepack pnpm test:ops` — 20 passed, 0 failed/skipped/todo.
- `corepack pnpm check:boundaries` — passed.
- `corepack pnpm local:verify -- --phase4-restore --parallel-check --skip-build` — passed after proving unique cross-process fixture paths.
- `corepack pnpm local:verify -- --phase4-full --interruption-check --parallel-check` — exit 0 with `LOCAL PHASE 4 READINESS PASS; RELEASE BLOCKED` and exact generated cleanup.

## Files Created/Modified

- `scripts/release-gate/{schema,bundle,validate}.mjs` — strict evidence/reference parsing, safe regular-file resolution, hashing, typed artifact semantics, time and readiness decisions.
- `scripts/release-gate.mjs` — local decision-only CLI with exact READY/BLOCKED/INVALID outcomes and no mutation capability.
- `ops/release-evidence.blocked.json` — canonical unresolved production state without evidence locators.
- `docs/RELEASE-GATE.md` and `docs/ROLLBACK.md` — future authorization/evidence workflow and preservation-first rollback decisions.
- `scripts/check-boundaries.mjs` — release-specific automatic action, remote capability, READY, address, public-port, and false-claim checks.
- `scripts/local-verify.mjs` — offline prerequisite gate and full Phase 1-4 orchestration.
- `README.md` and `docs/OPERATIONS.md` — canonical local command and explicit distinction between local pass and production authorization.

## Decisions Made

- Allow the repository root only for the exact canonical BLOCKED manifest; synthetic candidate evidence must live under a validated generated temporary prefix.
- Evaluate pending sections before artifact enumeration so missing prerequisites are BLOCKED rather than malformed, while every all-ready bundle rejects links, extras, missing files, byte mismatch, stale/future time and unsafe scalar authority as INVALID.
- Use cached verifier-image history as the local dependency-install cache record because this environment has no separate buildx command; missing history or exact image IDs fails with `OFFLINE PREREQUISITE MISSING`.
- Reuse two parallel complete restore rehearsals for full-gate concurrency evidence instead of duplicating every historical browser suite in both children.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Cross-suite data hygiene] Removed stale generated media fixtures before complete-backup validation.**
- **Found during:** Task 3 canonical full acceptance.
- **Issue:** Historical browser suites correctly removed their database rows but retained media bytes in the generated volume, so strict backup verification rejected unreferenced extra objects.
- **Fix:** Added an exact generated namespace/media-volume guard and reset only source/derivative acceptance fixtures before operations backup; no database volume or non-generated state is touched.
- **Verification:** Full gate produced a complete atomic backup and passed restore equivalence.
- **Committed in:** `d821224`.

**2. [Rule 1 - Parallel isolation] Replaced millisecond fixture naming with random cross-process authority.**
- **Found during:** Task 3 two-process restore check.
- **Issue:** Both Node processes could choose the same millisecond and fixed suffix for a pure restore-test symlink root, producing `EEXIST` despite isolated Compose namespaces.
- **Fix:** Generate the restore-test root with an eight-byte random token and retain exact prefix cleanup validation.
- **Verification:** Focused parallel restore and final full parallel gate both passed.
- **Committed in:** `d821224`.

**3. [Rule 3 - Diagnostics] Preserved redacted child output for parallel failure.**
- **Found during:** Task 3 first full parallel run.
- **Issue:** The parent reported only that Node exited nonzero, hiding the safe failing subtest needed to distinguish a fixture collision from infrastructure contamination.
- **Fix:** Aggregate settled child results and surface only `redactText`-processed output.
- **Verification:** The collision was identified, repaired, and both parallel modes passed without secret output.
- **Committed in:** `d821224`.

**Total deviations:** 3 auto-fixed (cross-suite correctness: 1, parallel isolation: 1, diagnostics: 1).
**Impact:** The fixes strengthened strict backup and concurrency guarantees; no release authority, production capability, external dependency, or cloud scope was added.

## Issues Encountered

- The first full run exposed stale unreferenced media and correctly stopped at backup verification.
- The second full run reached parallel restore and exposed the millisecond path collision; improved redacted diagnostics identified the exact failing fixture.
- After both fixes, focused parallel restore and the complete canonical command passed.

## User Setup Required

None for local development. Production remains blocked pending future explicit unfreeze plus external host, network, backup destination/retention/encryption/alert, resource, TLS, RPO/RTO, owner, window, rollback, and post-release evidence.

## Next Phase Readiness

All 21 planned v1 implementation plans are complete locally. The next legitimate production-related step is not deployment: it is a future user decision to lift the freeze for a named scope/window, followed by separately approved read-only evidence collection. Until then the machine decision remains BLOCKED.

Main server, secondary server, cloud services, registries, CDN, ACME, and external monitoring were not contacted.

## Self-Check: PASSED

- All six 04-03 test/production commits exist and all 16 changed artifacts are tracked.
- Both prohibition subjects fail while the canonical BLOCKED control passes.
- Canonical full acceptance passed with no skip/TODO, outbound fallback, secret leakage, unsafe cleanup, tracked READY state, or remaining generated namespace.

---
*Phase: 04-secure-operations-and-release-gate*
*Completed: 2026-08-09*
