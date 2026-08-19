---
phase: 06-public-discovery-data
plan: "08"
subsystem: local-delivery
tags: [docker, compose, postgres, evidence, rollback, tdd]
requires:
  - phase: 06-public-discovery-data
    provides: fixed live-refresh entry point, offline image primitives, and the audited 06-07 stop
provides:
  - shared strict collector for topology, persistence, protected history, routes, and BLOCKED state
  - target-image migration and immutable API/Web cutover/rollback state machine
  - literal-root concurrent attempt claims and sanitized atomic v3 evidence
  - read-only evidence reconstruction through the same fact and target-probe authorities
affects: [06-09, phase-08-reliable-local-delivery]
actuals:
  tokens: 23591
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns:
    - one shared raw-fact collector and explicit stage comparators own every live boundary
    - stateful commands are constructed and admitted token-for-token under fixed local authority
    - external claims and repository evidence use exclusive hard-link publication with file and directory fsync
key-files:
  created:
    - scripts/refresh-local-facts.mjs
  modified:
    - scripts/refresh-local-live.mjs
    - scripts/refresh-local.mjs
    - scripts/refresh-local.test.mjs
key-decisions:
  - "Docker Ports null is the required unpublished API/PostgreSQL form; Web alone has one exact loopback binding."
  - "Migration and schema verification execute only in one inspected target-API Compose one-off; rollback uses captured immutable image IDs."
  - "Evidence v3 stores only sanitized counts, digests, selected labels, IDs, contracts, and topology booleans."
patterns-established:
  - "Collect then compare: every preflight, migration, cutover, rollback, and verification boundary uses collectRefreshFacts."
  - "Literal authority: production claim storage has filesystem/identity seams but no path override."
requirements-completed: [SRCH-01, SRCH-02, SRCH-03, READ-08]
coverage:
  - id: D1
    description: Exact fixed runtime authority and persistence delta enforcement across migration, cutover, and rollback
    requirement: SRCH-01
    verification:
      - kind: unit
        ref: scripts/refresh-local.test.mjs#raw Docker Ports:null and exact Compose labels are the only fixed runtime authority
        status: pass
      - kind: unit
        ref: scripts/refresh-local.test.mjs#postMigration permits only phase1 timestamp advance and later stages preserve all persistence digests
        status: pass
    human_judgment: false
  - id: D2
    description: Target API one-off migration, stable seeds, immutable cutover, and immutable rollback
    requirement: SRCH-02
    verification:
      - kind: integration
        ref: scripts/refresh-local.test.mjs#complete fake live refresh uses target API one-off, immutable cutover and sanitized atomic v3 evidence
        status: pass
      - kind: integration
        ref: scripts/refresh-local.test.mjs#post-cutover fact failure rolls back API/Web by immutable IDs and suppresses evidence
        status: pass
    human_judgment: false
  - id: D3
    description: Exact public route contracts remain part of every collected and reconstructed fact set
    requirement: SRCH-03
    verification:
      - kind: unit
        ref: scripts/refresh-local.test.mjs#collector uses fake argv/database/media/history adapters and rejects partial route bodies
        status: pass
    human_judgment: false
  - id: D4
    description: Literal-root claims plus strict sanitized atomic v3 evidence and read-only reconstruction
    requirement: READ-08
    verification:
      - kind: unit
        ref: scripts/refresh-local.test.mjs#concurrent fixed-root claims have exactly one winner and retain the canonical final claim
        status: pass
      - kind: unit
        ref: scripts/refresh-local.test.mjs#evidence verification is read-only and refuses malformed or non-BLOCKED records
        status: pass
    human_judgment: false
duration: 45m
completed: 2026-08-16
status: complete
---

# Phase 6 Plan 08: Audited Live Refresh Safety Summary

**The future local refresh now has one strict fact authority, target-image migration, immutable rollback, safe claims, and reconstructable sanitized evidence without consuming a live attempt.**

## Performance

- **Duration:** 45m
- **Completed:** 2026-08-16
- **Tasks:** 2 completed
- **Files modified:** 4 implementation/test files plus this summary
- **TDD:** tests-only RED followed by one GREEN implementation commit

## Accomplishments

- Added `collectRefreshFacts`, exact raw Docker/Compose topology validation, canonical persistence/protected/route collection, sanitized projection, and explicit migration/cutover/rollback comparisons.
- Rebuilt the live adapter around exact token and environment shapes, stable seed reinspection, immutable target probes, one inspected target-API migration container, immutable API/Web rollback, and evidence suppression on failure.
- Hardened the fixed outside-repository attempt root and introduced strict no-overwrite v3 evidence plus a verifier that reconstructs current facts and target filesystem/store provenance without writing.

## Task Commits

1. **Task 1: Encode audited P0/P1 gaps as RED tests** — `d81c9e6` (`test(06-08): expose audited live refresh gaps`)
2. **Task 2: Implement the shared collector and safe state machine** — `06d6af3` (`fix(06-08): complete audited live refresh safety`)

## Files Created/Modified

- `scripts/refresh-local-facts.mjs` — canonical collector, exact authority/route validators, stage comparisons, and sanitized evidence projection.
- `scripts/refresh-local-live.mjs` — literal-root claims, exact argv/environment policy, seed/target probes, target-API migration, rollback, evidence publication, and reconstruction.
- `scripts/refresh-local.mjs` — v3 result contract plus fixed-path, fail-closed verification/claim CLI dispatch.
- `scripts/refresh-local.test.mjs` — raw inspect fixtures, fake data/history/route collectors, in-memory claim/evidence filesystems, full success flow, and failure rollback.

## Decisions Made

- Unpublished exposed ports are represented by Docker's raw `Ports` entry with a `null` value; an empty ports object is not equivalent authority.
- The migration container is revision-named and inspected before both database commands. Its API image tag is revision-bound, while cutover and rollback select immutable inspected IDs.
- Raw database rows, ledger timestamps/fingerprints, media paths, volume mountpoints, commands, environments, and host paths never enter persisted evidence.

## Deviations from Plan

None — the implementation remained within the four planned files, and the summary is the only additional artifact.

## Issues Encountered

- The former claim tests depended on a path override that the audited contract forbids. They were replaced with a fixed-literal-path in-memory filesystem/identity seam.
- Review caught the real Compose media mount (`/var/lib/blog-x/media`) and the need to include stopped one-offs in Compose membership checks; both were corrected before the GREEN commit.

## User Setup Required

None.

## Validation Results

- `node --test scripts/refresh-local.test.mjs` — 21 passed.
- `node --test scripts/local-verify.test.mjs` — 27 passed.
- `corepack pnpm -r typecheck` — contracts, API, and Web passed.
- `node scripts/check-boundaries.mjs` — 345 files checked, 0 findings.
- `node scripts/release-gate.mjs --evidence=ops/release-evidence.blocked.json --expect-blocked` — canonical `RELEASE BLOCKED` passed.
- `git diff --check` — passed.
- Protected runtime evidence, milestone archive, Phase 5 receipt, and `06-VERIFICATION.md` diff — clean.

## Next Phase Readiness

- 06-09 remains the sole owner of any live refresh attempt and is not eligible until a fresh independent GSD plan checker reports no blockers.
- No Docker/Compose command, offline probe, no-option refresh, real claim/evidence write, server/network contact, deployment, or push occurred in 06-08.
- Production remains frozen and release state remains `BLOCKED`.

## Self-Check: PASSED

- RED and GREEN commits are ordered and present.
- The implementation commit contains exactly the four planned files.
- Protected history and runtime evidence remain unchanged.

---
*Phase: 06-public-discovery-data*
*Completed: 2026-08-16*
