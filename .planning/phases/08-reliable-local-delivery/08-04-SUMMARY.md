---
phase: 08-reliable-local-delivery
plan: "04"
subsystem: local-delivery
tags: [git-sha, immutable-receipt, atomic-publication, fail-closed-verification]
requires:
  - phase: 08-03
    provides: sealed one-shot local delivery, rollback, acceptance and historical receipts
provides:
  - strict per-revision receipt, claim and failure authority derivation
  - SHA-bound zero-argument delivery and revision-addressed independent verification
  - two-successive-revision regression with immutable first-receipt proof
affects: [08-05, 08-08, 08-09, local-delivery, release-evidence]
actuals:
  tokens: 15382
  tasks: 3
  commits: 6
tech-stack:
  added: []
  patterns: [revision-addressed-authority, canonical-claim-recomputation, finite-closeout-allowlist]
key-files:
  created:
    - ops/local-deliveries/.gitkeep
  modified:
    - scripts/refresh-local.mjs
    - scripts/refresh-local-runtime-core.mjs
    - scripts/refresh-local-live.mjs
    - scripts/refresh-local-test-core.mjs
    - scripts/refresh-local.test.mjs
key-decisions:
  - "A lowercase full Git SHA is the only variable input to one fixed receipt/claim/failure authority; numbered successor slots remain immutable history only."
  - "Independent verification tolerates only the derived receipt and ten exact Phase 08 closeout documents after the delivered revision."
  - "A receipt-only worktree for the current SHA may advance only far enough to reject the already-terminal claim before adapter construction."
patterns-established:
  - "Revision authority: recompute path, authority, canonical claim bytes and digest at every trust boundary."
  - "Historical evidence: digest-pin old receipts and never expose them through the current writer or verifier."
requirements-completed: [DEVX-01, DEVX-03]
coverage:
  - id: D1
    description: Every lowercase full SHA derives one frozen fixed-root receipt, claim and failure authority while malformed paths and historical filenames fail before I/O.
    requirement: DEVX-01
    verification:
      - kind: unit
        ref: scripts/refresh-local.test.mjs#revision-addressed delivery authority is pure exact frozen and rejects every non-canonical path
        status: pass
      - kind: unit
        ref: scripts/refresh-local.test.mjs#both numbered local-delivery receipts remain immutable history
        status: pass
    human_judgment: false
  - id: D2
    description: The sealed writer, canonical claim attachment, terminal output and independent verifier bind one revision and reject authority or planning drift.
    requirement: DEVX-03
    verification:
      - kind: unit
        ref: scripts/refresh-local.test.mjs#runtime claim attachment recomputes canonical bytes digest and every revision authority field
        status: pass
      - kind: integration
        ref: scripts/refresh-local.test.mjs#later evidence verification admits only the receipt and finite Phase 08 closeout documents
        status: pass
    human_judgment: false
  - id: D3
    description: Two successive clean revisions each complete and independently verify a distinct receipt without changing the first receipt or constructing adapters for duplicate attempts.
    requirement: DEVX-01
    verification:
      - kind: integration
        ref: scripts/refresh-local.test.mjs#two successive clean revisions publish distinct verified receipts and preserve the first bytes
        status: pass
    human_judgment: false
duration: 11min
completed: 2026-08-30
status: complete
---

# Phase 08 Plan 04: Revision-Addressed Delivery Authority Summary

**Every clean full Git SHA now owns one immutable receipt and terminal claim authority, with strict independent verification and a regression proving two successive deliveries preserve the first receipt byte-for-byte.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-08-30T07:25:35Z
- **Completed:** 2026-08-30T07:36:15Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Replaced the exhausted numbered current slot with `ops/local-deliveries/<full-sha>.json`, a fixed secure claim root and canonical revision-specific authority.
- Bound the zero-argument writer, runtime claim attachment, terminal output and diagnostic verifier to the same derived SHA while permitting only ten exact closeout documents after delivery.
- Proved deliveries A and B independently, preserved A's exact bytes and digest after B, and rejected duplicate or mismatched authorities before adapter construction.
- Preserved the two committed historical receipts at their original SHA-256 digests and retained terminal production state `BLOCKED`.

## Task Commits

Each TDD task was committed as RED then GREEN:

1. **Task 1 RED: strict revision authority contract** — `48c316e` (`test`)
2. **Task 1 GREEN: SHA-derived receipt/claim authority** — `8fbef20` (`feat`)
3. **Task 2 RED: claim attachment integrity** — `03e9162` (`test`)
4. **Task 2 GREEN: canonical binding and finite closeout allowlist** — `1af7df2` (`feat`)
5. **Task 3 RED: successive revision delivery** — `d781649` (`test`)
6. **Task 3 GREEN: two-revision fixture and terminal duplicates** — `ca2edbb` (`feat`)

## Files Created/Modified

- `ops/local-deliveries/.gitkeep` — tracks the only repository-owned parent for revision receipts.
- `scripts/refresh-local-runtime-core.mjs` — derives authority, seals claim/evidence publication and enforces strict verification.
- `scripts/refresh-local-live.mjs` — resolves only a full SHA or exact revision-addressed path inside the production root.
- `scripts/refresh-local-test-core.mjs` — exposes only test-side revision advancement and adapter-construction accounting.
- `scripts/refresh-local.mjs` — keeps formal delivery zero-argument and routes an existing same-SHA receipt to terminal claim refusal.
- `scripts/refresh-local.test.mjs` — covers path grammar, historical digests, claim integrity, closeout drift and two successive deliveries.

## Decisions Made

- The full lowercase SHA is the sole variable component; branch, timestamp, sequence, environment and caller-selected directories cannot affect authority.
- Both numbered receipts and their old claim roots are explicitly named history, never compatibility aliases for the current writer/verifier.
- Later verification uses ancestry, raw committed lockfile equality and one finite exact path set; review, plan, context, config, source and arbitrary summary drift fail closed.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The first GREEN step required migrating live/test assembly together with the shared runtime contract so the full focused suite stayed green; this was already planned Task 2 work and introduced no scope change.

## User Setup Required

None. No external service, Docker runtime or server operation was performed.

## Verification

- `node --test scripts/refresh-local.test.mjs` — 65 passed, 0 failed/cancelled/skipped/TODO.
- Syntax checks passed for all four delivery modules.
- `node scripts/check-boundaries.mjs` — 419 files checked, 0 findings.
- `git diff --check` — passed.
- Historical receipt SHA-256 values remain `9a9af65b...9303cb` and `f10b124b...6049`.
- `main` remains the README-only baseline `c665030fae22553f5c10ae063c67103b8eba6572`.
- Real `corepack pnpm local:deliver` was not invoked; canonical Docker state and both cloud servers were untouched.

## Next Phase Readiness

- Revision-addressed authority is ready for the default-test normalization and generated integration inventory in Plans 08-05 through 08-07.
- Plan 08-09 remains the only authorized formal delivery step after the configured clean review gate in 08-08.
- Production remains `BLOCKED`.

## Self-Check: PASSED

All six implementation files exist, all six TDD commits are present, the full focused suite and boundary scan pass, both historical receipt digests are unchanged, and the worktree was clean before this summary was written.

---
*Phase: 08-reliable-local-delivery*
*Completed: 2026-08-30*
