---
phase: quick
plan: "260816-pzr-support-docker-compose-v5-ndjson-ps-outp"
subsystem: local-refresh
tags: [docker-compose-v5, ndjson, strict-parser, runtime-authority, tdd]
requires:
  - phase: quick-260816-mtt
    provides: sealed raw-boundary local refresh runtime and fixed Compose service authority
provides:
  - Strict Compose-ps decoder for nonempty JSON object arrays and Compose v5 NDJSON object records
  - Exact api/postgres/web service-authority preservation across both encodings
  - Sanitized realistic v5 fixture and malformed-input rejection matrix
affects: [local-refresh, compose-authority, phase6-verification]
actuals:
  tokens: 2770
  tasks: 2
  commits: 3
tech-stack:
  added: []
  patterns: [source-specific-parser, bounded-ndjson, exact-service-authority]
key-files:
  created: []
  modified:
    - scripts/refresh-local-runtime-core.mjs
    - scripts/refresh-local.test.mjs
key-decisions:
  - "Kept generic parseJson strict and unchanged; only Compose ps stdout uses the new source-specific decoder."
  - "Retained every decoded record without filtering or deduplication so existing exact service authority remains decisive."
patterns-established:
  - "Multi-encoding CLI sources preserve raw line boundaries until source-specific syntax validation completes."
requirements-completed: []
coverage:
  - id: D1
    description: Compose ps accepts legacy JSON arrays plus sanitized LF and CRLF Compose v5 NDJSON object records.
    verification:
      - kind: unit
        ref: scripts/refresh-local.test.mjs#Compose ps authority accepts legacy JSON arrays and sanitized v5 NDJSON records
        status: pass
    human_judgment: false
  - id: D2
    description: Empty, blank, mixed, malformed, trailing-garbage and non-object Compose ps encodings are rejected.
    verification:
      - kind: unit
        ref: scripts/refresh-local.test.mjs#Compose ps authority rejects malformed mixed blank and non-object encodings
        status: pass
    human_judgment: false
  - id: D3
    description: Service identities remain nonempty strings and exactly api, postgres and web without filtering or deduplication.
    verification:
      - kind: unit
        ref: scripts/refresh-local.test.mjs#Compose ps records require nonempty string services and retain exact fixed service authority
        status: pass
    human_judgment: false
duration: 5min
completed: 2026-08-16
status: complete
---

# Quick Task: Support Docker Compose v5 NDJSON ps Output Summary

**The fixed Compose ps authority now accepts bounded v5 NDJSON without weakening JSON parsing or exact service identity.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-08-16T18:47:00+08:00
- **Completed:** 2026-08-16T18:51:50+08:00
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added a private Compose-ps parser accepting only nonempty object arrays or strict one-object-per-line NDJSON with one ordinary terminal newline.
- Preserved exact `api`, `postgres`, `web` authority, including rejection of missing, extra, duplicate and non-string services.
- Covered realistic Compose v5 `Publishers` output, CRLF, blank records, mixed encodings, malformed JSON, trailing garbage and non-object shapes through fake raw process boundaries.

## Task Commits

1. **Task 1: Commit RED Compose v5 array/NDJSON boundary tests** - `caec974` (test)
2. **Task 2: Implement the narrow Compose-ps decoder and restore GREEN** - `1487e81` (fix)
3. **Execution summary** - documented in the commit containing this file

## Files Created/Modified

- `scripts/refresh-local-runtime-core.mjs` - Private bounded Compose-ps array/NDJSON decoder wired only to `composeAuthority()`.
- `scripts/refresh-local.test.mjs` - Sanitized v5 fixture, compatibility cases and strict rejection/service-authority matrices.

## Decisions Made

- A conventional JSON array may be formatted across lines, while NDJSON requires each physical line to parse completely as one object.
- Only one terminal LF or CRLF is removed; leading, internal and repeated terminal blank records remain errors.
- `Service` validation occurs before sorting, and records are never deduplicated or filtered.

## Deviations from Plan

None - plan executed as specified.

## Issues Encountered

- The initial narrow implementation accepted a pretty-printed standalone object as whole JSON. Tightening the non-array branch to parse each physical line restored the required strict NDJSON boundary while retaining formatted array compatibility.

## User Setup Required

None - no external service configuration required.

## Validation Results

- `node --test scripts/refresh-local.test.mjs` — 38/38 pass.
- `node --test scripts/local-verify.test.mjs` — 27/27 pass.
- `corepack pnpm -r typecheck` — pass.
- `node scripts/check-boundaries.mjs` — 356 files checked, 0 findings.
- `node scripts/release-gate.mjs --evidence=ops/release-evidence.blocked.json --expect-blocked` — release remains `BLOCKED`.
- `git diff --check` — pass.
- Protected planning, milestone, receipt, runtime-evidence, verification and release-evidence paths remained unchanged from `5cd4ec6`.

## Next Phase Readiness

- A future separately authorized live attempt can use the new committed parser revision.
- The historical `5cd4ec6` claim and failure report remain untouched and unretried.

## Self-Check: PASSED

- RED and GREEN commits exist: `caec974`, `1487e81`.
- Focused tests, regressions, typecheck, boundary audit, canonical release-state gate and diff check passed.
- Only the declared runtime-core, test and summary files changed; the worktree was clean before summary creation.
- Protected repository artifacts remained unchanged.
- No Docker/Compose, bare refresh/probe, claim/report/evidence, network, server, deployment or push action was performed.

---
*Phase: quick*
*Completed: 2026-08-16*
