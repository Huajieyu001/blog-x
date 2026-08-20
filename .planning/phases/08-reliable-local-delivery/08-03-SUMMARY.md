---
phase: 08-reliable-local-delivery
plan: "03"
subsystem: local-delivery
tags: [docker-compose, offline-build, playwright, receipt, sha256]
requires:
  - phase: 08-01
    provides: sealed local delivery authority, provenance and pre-mutation safety
  - phase: 08-02
    provides: complete Phase 6/7 acceptance record
provides:
  - mandatory pre-cutover complete acceptance barrier
  - representative fixed-route and reading facts
  - verified current-revision v1.1 local delivery receipt
affects: [local-runtime, release-evidence, phase-08-verification]
actuals:
  tokens: 20000
  tasks: 3
  commits: 5
tech-stack:
  added: []
  patterns: [one-claim-per-revision, idempotent-neutral-store, verify-before-receipt-commit]
key-files:
  created:
    - ops/v1.1-local-delivery-evidence.json
  modified:
    - scripts/refresh-local.mjs
    - scripts/refresh-local-runtime-core.mjs
    - scripts/refresh-local-facts.mjs
    - scripts/refresh-local-test-core.mjs
    - scripts/refresh-local.test.mjs
    - scripts/refresh-seed-store.mjs
key-decisions:
  - "A relocated seed store is reusable only when the exact versioned neutral directory is nonempty; missing or empty neutral authority still fails closed."
  - "Every failed claimed revision remains terminal; offline fixes were committed as new SHAs before another delivery attempt."
  - "The successful local receipt binds revision 4414710b605ecd8a770a1c3a60afef479c9b4eb7 and 1,353 pass-only acceptance tests while production remains BLOCKED."
patterns-established:
  - "Probe the exact currently running seed references before claiming a repaired delivery revision."
  - "Publish the receipt only after fixed runtime facts pass and independently verify its unchanged bytes before commit."
requirements-completed: [DEVX-01, DEVX-02, DEVX-03]
coverage:
  - id: D1
    description: Full generated acceptance is a mandatory pre-migration barrier with exact stage-safe recovery.
    requirement: DEVX-03
    verification:
      - kind: unit
        ref: node --test scripts/local-delivery-acceptance.test.mjs scripts/refresh-local.test.mjs
        status: pass
    human_judgment: false
  - id: D2
    description: Offline delivery safely reuses an already-relocated nonempty pnpm store without retrieval fallback.
    requirement: DEVX-02
    verification:
      - kind: integration
        ref: BLOG_X_API_SEED_IMAGE=blog-x-api-local:fd5ef1ba4b3c BLOG_X_WEB_SEED_IMAGE=blog-x-web-local:fd5ef1ba4b3c node scripts/refresh-local.mjs --probe-offline-builds
        status: pass
    human_judgment: false
  - id: D3
    description: The fixed canonical runtime and non-overwriting receipt prove the exact implementation revision, retained data authority, routes, reading fact and BLOCKED release state.
    requirement: DEVX-01
    verification:
      - kind: integration
        ref: corepack pnpm local:deliver
        status: pass
      - kind: integration
        ref: node scripts/refresh-local.mjs --verify-evidence=ops/v1.1-local-delivery-evidence.json
        status: pass
    human_judgment: false
---

# Phase 08 Plan 03: Reliable Local Delivery Summary

**The clean committed discovery implementation is now the healthy canonical `blogxlocal` runtime at fixed port 3100, backed by a verified v1.1 receipt and an explicit `BLOCKED` production decision.**

## Performance

- **Duration:** 6h57m
- **Started:** 2026-08-20T07:22:41Z
- **Completed:** 2026-08-20T14:19:52Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Inserted the sealed full Phase 6/7 acceptance result before migration and cutover; incomplete, malformed or failed acceptance cannot mutate the canonical runtime.
- Added `/search` and representative reading facts, exhaustive stage/recovery output, acceptance digests and an independently reconstructable non-overwriting receipt.
- Made offline seed preparation idempotent for both an already-neutral path and a safely relocated missing-source path, without network retrieval or store deletion.
- Delivered revision `4414710b605ecd8a770a1c3a60afef479c9b4eb7` to the exact three-service `blogxlocal` topology while retaining PostgreSQL and media volumes.
- Verified 1,338 Phase 6 tests and 15 Phase 7 browser tests with zero failure/cancel/skip/TODO; fixed routes returned 200 and the empty public article set was recorded honestly.

## Task Commits

1. **Task 1: Make full isolated acceptance a pre-cutover refresh barrier** — `49dddc5` (`feat`)
2. **Task 2: Seal representative reading facts, final receipt and stage-safe operator output** — `cd47520` (`feat`)
3. **Task 3 recovery: Reuse an already-neutral seed store** — `7fce3a0` (`fix`)
4. **Task 3 recovery: Detect a relocated neutral seed after its original source was removed** — `4414710` (`fix`)
5. **Task 3: Record fixed local delivery** — `6a5347a` (`chore`)

## Files Created/Modified

- `scripts/refresh-local.mjs` — orders complete acceptance before migration and emits exact phase progress.
- `scripts/refresh-local-runtime-core.mjs` — binds acceptance, exhaustive failure recovery, receipt verification and terminal output.
- `scripts/refresh-local-facts.mjs` — collects `/search` and representative reading facts without canonical writes.
- `scripts/refresh-local-test-core.mjs` — keeps injected refresh boundaries test-only.
- `scripts/refresh-local.test.mjs` — covers phase order, evidence, stage faults, rollback, reading facts and neutral-store reuse.
- `scripts/refresh-seed-store.mjs` — safely reuses exact nonempty relocated pnpm stores.
- `ops/v1.1-local-delivery-evidence.json` — immutable current-revision local delivery receipt.

## Decisions Made

- A claim makes a revision terminal even when failure occurs before migration; remediation always creates a new committed SHA.
- The offline probe must use the current running image references, not only mutable `latest` tags, before a repaired formal attempt.
- An empty public article set is an explicit valid reading outcome; the workflow never seeds or invents a representative article.

## Deviations from Plan

### Auto-fixed Issues

**1. Existing port 3100 owner was an old Next development process**
- **Found during:** Task 3 precondition check
- **Issue:** The canonical Web container was stopped and a stale project-local `next dev` process owned port 3100.
- **Fix:** After explicit user authorization, stopped only the verified Next process and restarted the existing canonical `blogxlocal-web-1` container from its immutable image.
- **Files modified:** None
- **Verification:** Exactly three canonical services healthy; only `blogxlocal-web-1` published `127.0.0.1:3100`.

**2. Repeated offline seed preparation was not idempotent**
- **Found during:** Task 3 `build-api`
- **Issue:** Previously delivered images had already moved pnpm content into `/pnpm-store/v11`; the default original source was absent on the next refresh.
- **Fix:** Accept only an exact nonempty versioned neutral store when the original source is the same path or is already absent; all unsafe, empty and unversioned paths still fail.
- **Files modified:** `scripts/refresh-seed-store.mjs`, `scripts/refresh-local.test.mjs`
- **Verification:** 56 refresh tests passed and the exact current-seed API/Web offline probe passed with `--network=none`.

## Issues Encountered

- Revisions `cd47520` and `7fce3a0` each failed safely at `build-api`. Their claims and bound failure reports were preserved, neither revision was retried, and no migration or cutover occurred.
- Tool-side long waits delayed read-only diagnostic output but did not create additional delivery attempts or broaden authority.

## User Setup Required

None. The canonical local site is available at `http://127.0.0.1:3100`.

## Next Phase Readiness

- All three Phase 8 plans are implemented; phase-level code review and verification can now run against the committed receipt and live fixed runtime.
- Production remains `BLOCKED`; neither cloud server was contacted or modified.

## Self-Check: PASSED

All five listed commits and the receipt exist. The exact-current-seed offline API/Web probe passed, 56 focused refresh tests passed with zero fail/cancel/skip/TODO, full delivery acceptance passed 1,353/1,353 tests, the read-only evidence verifier passed, all three canonical services are healthy, fixed home/search/health routes return 200, the boundary scan reported 403 files with zero findings, and `git diff --check` passed.

---
*Phase: 08-reliable-local-delivery*
*Completed: 2026-08-20*
