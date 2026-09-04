---
phase: quick
plan: "260904-szr"
subsystem: local-delivery-preflight
tags: [git-authority, evidence-integrity, regression]
requires: []
provides:
  - Git-authoritative protected planning evidence collection across active and archived Phase 6 layouts
  - Exact child-process authority for the protected planning discovery command
affects: [local-delivery-preflight, future-local-delivery-reverification]
tech-stack:
  added: []
  patterns: [memory-filesystem regression seam, exact argv allowlist, deterministic protected-fact hashing]
key-files:
  created: []
  modified:
    - scripts/refresh-local.test.mjs
    - scripts/refresh-local-runtime-core.mjs
decisions:
  - Optional Phase 6 evidence is selected exclusively by one exact tracked-Git query, not by an archive-version path or filesystem fallback.
  - The fixed Phase 5 full-gate receipt remains an independent protected digest input.
metrics:
  duration: "~4 minutes"
  completed: 2026-09-04
status: complete
actuals:
  tokens: 2113
  tasks: 2
  commits: 2
---

# Quick Task 260904-szr: Phase 6 Preflight Collection Repair Summary

The local-delivery preflight now follows Git-tracked planning evidence whether Phase 6 is still active or has been archived, while retaining fail-closed digest protection for every selected planning file and the fixed Phase 5 gate receipt.

## Completed Tasks

1. Added tests-first coverage for archived and active tracked planning layouts, digest drift, omitted-path safety, and exact Git command authority.
2. Replaced the stale unconditional Phase 6 path read with one exact `git ls-files` query that returns both milestone files and the optional active verification candidate.

## Verification

- RED: the focused regression initially failed because the new Git argv was rejected and the absent former Phase 6 path was read.
- GREEN: `node --test --test-name-pattern="protected planning evidence follows tracked archival state|live command policy permits only fixed local argv" scripts/refresh-local.test.mjs` — 2/2 passed.
- Default local suite: `corepack pnpm test` — 44/44 passed; release state remained `BLOCKED`.
- `git diff --check -- scripts/refresh-local.test.mjs scripts/refresh-local-runtime-core.mjs` — passed.
- Independent review found one warning: the fixture did not reproduce the nested `v1.1-phases/.../06-VERIFICATION.md` archive path. The fixture now covers that exact layout and verifies its digest contribution; focused and default suites passed again.

## Commits

- `da67c64` — `test(quick-260904-szr): expose archived protected-path failure`
- `c7347ba` — `fix(quick-260904-szr): follow tracked protected evidence`
- Follow-up — reproduce the real nested Phase 6 archive layout in the regression fixture

## Deviations from Plan

None — plan executed exactly as written.

## Security Review

The protected path set remains bounded by an exact read-only Git argv, with no glob, archive-version destination, filesystem traversal, fallback-on-error, or user-controlled path input. Files Git selects remain fail-closed: an unreadable selected path rejects fact collection.

## Known Stubs

None.

## Self-Check: PASSED

- Both task commits exist and modify only their assigned source file.
- The focused test and default offline test coordinator passed.
