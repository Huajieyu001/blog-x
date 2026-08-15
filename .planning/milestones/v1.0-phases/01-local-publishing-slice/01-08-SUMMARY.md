---
phase: 01-local-publishing-slice
plan: "08"
subsystem: infra
tags: [docker-compose, playwright, postgres, migrations, local-verification, security-boundaries]

requires:
  - phase: 01-local-publishing-slice
    provides: authenticated Markdown publishing, lifecycle, public pagination, and safe permalinks from Plans 01-01 through 01-07
provides:
  - isolated Web/API/PostgreSQL local verification with generated namespaces and secrets
  - migration concurrency, interruption recovery, schema ledger, and parallel-run proof
  - one real-browser journey covering all seven Phase 1 requirements
  - exact local startup, health, migration, seed, verification, and bounded-stop documentation
affects: [02-complete-reading-experience, 04-secure-operations-and-release-gate, local-development, continuous-verification]

actuals:
  tokens: 11403
  tasks: 2
  commits: 3

tech-stack:
  added: [Docker Compose verification topology, Playwright whole-phase acceptance]
  patterns: [validated per-run namespaces, generated env-only credentials, advisory-locked migration ledger, bounded cleanup, structural boundary gate]

key-files:
  created:
    - scripts/local-verify.mjs
    - scripts/check-boundaries.mjs
    - scripts/local-verify.test.mjs
    - apps/api/Dockerfile
    - apps/web/Dockerfile
    - apps/web/e2e/phase1-publishing.spec.ts
    - playwright.config.ts
    - .env.example
  modified:
    - compose.yaml
    - apps/api/src/app.ts
    - apps/web/tsconfig.json
    - package.json
    - README.md

key-decisions:
  - "Every canonical verification run owns a validated random Compose/database namespace and may clean up only that namespace."
  - "Migration activation uses one PostgreSQL advisory lock plus a singleton fingerprint ledger, allowing concurrent and interrupted runs to converge without resetting the volume."
  - "Browser acceptance mutates content only through visible controls and same-origin relative /api requests; database access is reserved for runner-owned retention diagnostics."

patterns-established:
  - "Canonical verification: one local:verify command owns setup, migrations, seeding, tests, log audit, and bounded cleanup."
  - "Production boundary gate: reject tracked secrets, forbidden Web ownership, server addresses, and frozen-host commands before runtime tests."

requirements-completed: [AUTH-01, CONT-01, CONT-02, CONT-03, READ-01, READ-02, OPS-04]

coverage:
  - id: D1
    description: "An isolated local Web/API/PostgreSQL topology starts, health-checks, migrates, seeds, and cleans up with interruption and parallel safety."
    requirement: OPS-04
    verification:
      - kind: integration
        ref: "corepack pnpm local:verify -- --full-phase --interruption-check --parallel-check"
        status: pass
      - kind: unit
        ref: "scripts/local-verify.test.mjs#verification namespaces, redaction, and boundary fixtures"
        status: pass
    human_judgment: false
  - id: D2
    description: "A generated administrator completes login, draft metadata, preview, publish, edit, slug confirmation, unpublish, republish, and soft deletion through visible browser controls."
    requirement: CONT-01
    verification:
      - kind: automated_ui
        ref: "apps/web/e2e/phase1-publishing.spec.ts#Phase 1 completes the local author-to-reader publishing journey through visible controls"
        status: pass
    human_judgment: false
  - id: D3
    description: "Public cards, exact pagination, safe Markdown permalinks, and indistinguishable draft/unpublished/deleted/unknown 404 responses are proven in one journey."
    requirement: READ-02
    verification:
      - kind: automated_ui
        ref: "apps/web/e2e/phase1-publishing.spec.ts#Phase 1 completes the local author-to-reader publishing journey through visible controls"
        status: pass
    human_judgment: false
  - id: D4
    description: "Repository and runtime gates keep secrets out of logs, preserve service ownership, and prevent browser or documented commands from targeting cloud-server addresses."
    requirement: OPS-04
    verification:
      - kind: other
        ref: "corepack pnpm check:boundaries"
        status: pass
      - kind: integration
        ref: "corepack pnpm local:verify -- --full-phase --interruption-check --parallel-check"
        status: pass
    human_judgment: false

duration: 1h 41m
completed: 2026-08-08
status: complete
---

# Phase 1 Plan 08: Reproducible Local Phase Acceptance Summary

**Generated-secret Docker topology with interruption-safe migrations, strict deployment boundaries, and one Chromium journey proving the complete Phase 1 publishing loop**

## Performance

- **Duration:** 1h 41m
- **Started:** 2026-08-08T03:50:07Z
- **Completed:** 2026-08-08T05:31:27Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments

- Added a canonical, rerunnable local verification command with validated random namespaces, health checks, concurrent migrations, interruption recovery, schema inspection, random seeding, parallel isolation, log-secret checks, and bounded cleanup.
- Added a structural repository boundary gate that rejects tracked secrets, forbidden Web ownership, browser-visible cloud-server addresses, and commands against the frozen production node.
- Proved administrator authentication, the complete content lifecycle, metadata preservation, public pagination, safe Markdown rendering, unified unavailable-state 404s, and retained soft-deleted source in one real-browser run.
- Replaced the placeholder README with exact local prerequisites, startup, health, migration, seed, full verification, stop, and troubleshooting instructions.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Define local verification safety gates** - `848121d` (test)
2. **Task 1 GREEN: Build isolated interruption-safe runtime and boundary gate** - `f3d3f98` (feat)
3. **Task 2: Prove the complete publishing journey and document commands** - `8767a00` (test)

## Files Created/Modified

- `scripts/local-verify.mjs` - Owns isolated lifecycle, migration race/interruption checks, API/browser suites, secret audit, parallel proof, and cleanup.
- `scripts/check-boundaries.mjs` - Scans tracked source and operational surfaces for architecture, address, command, and secret violations.
- `scripts/local-verify.test.mjs` - Proves cleanup-name validation, output redaction, and known-bad boundary fixtures.
- `compose.yaml` - Runs PostgreSQL privately with healthy API and loopback-only Web access.
- `apps/api/src/app.ts` - Records the migration fingerprint/count under an advisory lock and exposes deterministic schema verification.
- `apps/api/Dockerfile` and `apps/web/Dockerfile` - Build resource-conscious local service images with the correct internal API rewrite.
- `apps/web/e2e/phase1-publishing.spec.ts` - Runs the independent author-to-reader Phase 1 acceptance journey.
- `README.md` - Documents canonical and manual local workflows without remote deployment commands.

## Decisions Made

- Verification resources use generated, regex-validated names so failure cleanup cannot expand to another project or persistent environment.
- The runner generates administrator credentials in memory, redacts captured output, and fails if raw credentials, session material, or database URLs reach service logs.
- One Fastify-owned renderer and lifecycle remain authoritative; Playwright uses UI controls for behavior and the runner performs only the final soft-delete retention diagnostic directly in PostgreSQL.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Excluded browser tests from the Next production compilation boundary**

- **Found during:** Task 1 container build verification.
- **Issue:** The Web TypeScript config included `e2e/`, so the isolated production build tried to resolve an old test-only API fixture that was intentionally absent from the Web image.
- **Fix:** Excluded `e2e` from the Next application TypeScript project; Playwright still loads and transpiles its tests independently.
- **Files modified:** `apps/web/tsconfig.json`
- **Verification:** Web image build, workspace typecheck, and the canonical full verification all passed.
- **Committed in:** `f3d3f98`

**2. [Rule 3 - Blocking] Bound the Next rewrite to the Compose API during image build**

- **Found during:** Task 2 same-origin request-chain audit.
- **Issue:** Next evaluates rewrites during image build; a runtime-only environment value would leave browser `/api` requests targeting the Web container loopback.
- **Fix:** Added a build argument and environment value using the Compose-internal API service origin.
- **Files modified:** `apps/web/Dockerfile`
- **Verification:** The full Chromium journey performed real same-origin `/api` login and content mutations successfully.
- **Committed in:** `8767a00`

---

**Total deviations:** 2 auto-fixed (2 blocking correctness fixes). **Impact on plan:** Both fixes were required to preserve the intended isolated deployment boundary; no feature scope was added.

## Issues Encountered

- The local Colima VM had a dangling resolver symlink, which prevented registry/package resolution. A static resolver was restored inside the local VM, then the same build and verification commands succeeded. No repository or remote-server state was used as a fallback.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 1 is reproducibly complete and all seven mapped requirements have automated end-to-end proof.
- Phase 2 can build taxonomy, media, responsive/theme, and error experiences on the verified local publishing base.
- The production-node freeze remains active; neither cloud server was contacted during this plan.

## Self-Check: PASSED

---
*Phase: 01-local-publishing-slice*
*Completed: 2026-08-08*
