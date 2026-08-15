---
phase: 03-distribution-and-portability
plan: "03"
subsystem: testing, infra, web
tags: [docker, playwright, postgres, nextjs, fail-closed]
requires:
  - phase: 03-02
    provides: managed generated-origin metadata and discovery browser journey
provides:
  - canonical Phase 3 full acceptance over completed Phase 1/2 and current distribution semantics
  - generated-origin and bounded-cleanup verifier guards
  - deterministic rejection fixtures for forbidden Web ownership and outbound topology
affects: [03-04, export, phase-verification]
actuals:
  tokens: 5367
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns: [canonical phase selection without future-suite coupling, generated-origin recursive verification, namespace-bound cleanup, deterministic static negative fixtures]
key-files:
  created: []
  modified: [scripts/local-verify.mjs, scripts/local-verify.test.mjs, scripts/check-boundaries.mjs, apps/api/test/public-visibility.test.ts, apps/web/e2e/public-errors.spec.ts, apps/web/e2e/public-error-fixture.ts]
key-decisions:
  - "`--phase3-full` runs all completed Phase 1/2 compatibility before current API, metadata, and browser semantics, while leaving export selection for 03-04."
  - "Every cleanup database, volume, media root, and Compose namespace must be derived from and revalidated against one generated namespace before teardown."
  - "Recovery-fixture state is runner/test controlled on loopback so Next's repeated server renders cannot bypass visible retry evidence."
patterns-established:
  - "Semantic Node suites retain TAP-only skip/zero enforcement; Playwright retains its dedicated pass/skip parser."
  - "Web static boundaries reject embedded internal origins, literal external fetches, the production hostname, and public test-only diagnostic routes."
requirements-completed: [SEO-01, SEO-02, FEED-01]
coverage:
  - id: D1
    description: Canonical generated local verification runs recursive build/typecheck, Phase 1/2 compatibility, current Phase 3 API/metadata/browser semantics, log auditing, and exact teardown without export suites.
    requirement: SEO-01
    verification:
      - kind: integration
        ref: corepack pnpm local:verify -- --phase3-full
        status: pass
      - kind: unit
        ref: scripts/local-verify.test.mjs#Phase 3 full is the extensible canonical gate for completed Phase 1/2 and current distribution semantics
        status: pass
    human_judgment: false
  - id: D2
    description: Generated origins and strict static boundaries block internal/cloud/external targets, hardcoded production hosts, public diagnostic routes, and forbidden Web ownership.
    requirement: SEO-02
    verification:
      - kind: unit
        ref: scripts/local-verify.test.mjs#boundary audit rejects database/media ownership, forbidden public origins, test routes, server addresses, frozen-host commands, and tracked secrets
        status: pass
      - kind: other
        ref: corepack pnpm check:boundaries
        status: pass
    human_judgment: false
  - id: D3
    description: RSS and all Phase 3 public discovery evidence remain same-origin and fail closed on skipped or zero semantic tests.
    requirement: FEED-01
    verification:
      - kind: automated_ui
        ref: apps/web/e2e/phase3-distribution.spec.ts#Phase 3 metadata is a managed same-origin public journey
        status: pass
      - kind: integration
        ref: corepack pnpm local:verify -- --phase3-full
        status: pass
    human_judgment: false
duration: 1h 8m
completed: 2026-08-09
status: complete
---

# Phase 03 Plan 03: Canonical Distribution Acceptance Summary

**One generated local command now proves all completed publishing, reading, metadata, crawler, and RSS behavior while rejecting topology disclosure, false test evidence, and broad cleanup.**

## Performance

- **Duration:** 1h 8m
- **Started:** 2026-08-09T05:39:20Z
- **Completed:** 2026-08-09T06:47:21Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Promoted `--phase3-full` to the canonical acceptance branch: completed Phase 1/2 compatibility runs first, followed by the migrated public-distribution suite and the managed Phase 3 metadata/discovery journey.
- Removed premature export selections so 03-04 can extend the same selector with its real export suites instead of 03-03 attempting nonexistent files.
- Added deterministic negative fixtures for embedded internal origins, literal external browser fetches, the production hostname, public diagnostic routes, and unsafe generated database targets.
- Preserved generated credentials/log redaction, exact Compose/database/media cleanup, and same-origin browser evidence; the final run completed with no skips, TODOs, or zero semantic tests.

## Task Commits

1. **Task 1: Trace canonical acceptance through generated DB/API/Web and real Chromium** - `095c303` (feat)
2. **Task 2: Add negative origin, outbound, ownership, and cleanup gates** - `64ce55c` (feat)

## Files Created/Modified

- `scripts/local-verify.mjs` - Runs the completed compatibility stack before Phase 3 and validates generated database cleanup ownership.
- `scripts/local-verify.test.mjs` - Locks full-selection, generated-origin, semantic-result, cleanup, and negative-boundary contracts.
- `scripts/check-boundaries.mjs` - Rejects public topology leakage and test-only Web routes.
- `apps/api/test/public-visibility.test.ts` - Keeps the strict public detail allowlist current with the intentional SEO description field.
- `apps/web/e2e/public-errors.spec.ts` and `public-error-fixture.ts` - Make the loopback-only recovery journey deterministic without browser access to the fixture.

## Decisions Made

- Keep `--phase3-full` limited to completed work; 03-04 owns export selection and can append it without replacing the runner.
- Treat generated database names as cleanup targets with the same exact namespace discipline as Compose volumes and temporary media roots.
- Use only runner/test control of the isolated loopback error fixture; visible browser requests remain on the generated Web origin.

## Verification

```text
corepack pnpm test:ops                 # 10 passed, 0 failed/skipped/todo
corepack pnpm check:boundaries         # Boundary checks passed.
corepack pnpm local:verify -- --phase3-full
[local-verify] blogxverify_72d51f04dbf6 passed
[local-verify] all requested checks passed
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Compatibility] Recursive builds and the recovery Web process lacked their generated `PUBLIC_ORIGIN`.**
- **Found during:** Task 1
- **Issue:** The new canonical full path exposed production-build and recovery-start failures before semantic evidence could run.
- **Fix:** Passed the generated loopback public origin to recursive builds and the isolated recovery Web process, with regression fixtures.
- **Files modified:** `scripts/local-verify.mjs`, `scripts/local-verify.test.mjs`
- **Verification:** `corepack pnpm local:verify -- --phase3-full`
- **Committed in:** `095c303`

**2. [Rule 1 - Compatibility] The Phase 2 strict public detail fixture omitted the intentional public `seoDescription`.**
- **Found during:** Task 1
- **Issue:** Full compatibility rejected the Phase 3 public metadata addition despite its strict allowlisted contract.
- **Fix:** Kept the exact key assertion and added a concrete allowed-value assertion rather than weakening disclosure coverage.
- **Files modified:** `apps/api/test/public-visibility.test.ts`
- **Verification:** `corepack pnpm local:verify -- --phase3-full`
- **Committed in:** `095c303`

**3. [Rule 1 - Determinism] Next repeated server rendering could consume the error fixture's count-based recovery state before the retry boundary appeared.**
- **Found during:** Task 1
- **Issue:** The legacy count fixture could render success before visible retry evidence.
- **Fix:** Added runner/test-only loopback state controls; the browser continues to navigate only through the generated Web origin.
- **Files modified:** `apps/web/e2e/public-errors.spec.ts`, `apps/web/e2e/public-error-fixture.ts`, `scripts/local-verify.mjs`
- **Verification:** `corepack pnpm local:verify -- --phase3-full`
- **Committed in:** `095c303`

**Total deviations:** 3 auto-fixed (Rule 1: 3).
**Impact on plan:** All corrections were necessary to make the promised full compatibility evidence reproducible; no dependency, API, or cloud scope was added.

## Issues Encountered

The initial canonical runs revealed the compatibility gaps above; each was corrected through local tests and a final clean generated run. No verification was skipped.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

03-04 can extend the existing `phase3Selection` with authenticated export API/browser suites while retaining this exact full compatibility and safety baseline.

No cloud server, remote API, registry, CDN, deployment target, or external host was contacted. The only network traffic was local Docker/Colima and generated loopback Web/error-fixture traffic.

## Self-Check: PASSED

- Task commits `095c303` and `64ce55c` exist.
- Required modified files exist and the final local full verifier exited 0.

---
*Phase: 03-distribution-and-portability*
*Completed: 2026-08-09*
