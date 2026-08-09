---
phase: 04-secure-operations-and-release-gate
plan: "01"
subsystem: api, security, testing, operations
tags: [fastify, postgres, rate-limiting, csrf, input-validation, topology]
requires:
  - phase: 03-04
    provides: strict same-origin archive authorization and canonical generated local verifier
provides:
  - bounded single-process login, request, and administrator-mutation abuse controls
  - shared session-first exact-Origin authorization across every unsafe route
  - strict command-aware startup configuration before runtime resource creation
  - hostile input, upload, Markdown, secret, and data-plane topology acceptance gates
affects: [04-02-backup-and-recovery, 04-03-release-gate, production-topology]
actuals:
  tokens: 22324
  tasks: 3
  commits: 9
tech-stack:
  added: []
  patterns: [bounded injected-clock limiter, session-before-Origin mutation guard, app-owned runtime resource cleanup, name-only production policy artifacts]
key-files:
  created: [apps/api/src/security/config.ts, apps/api/src/security/rate-limiter.ts, apps/api/src/security/mutation-guard.ts, apps/api/test/security-hardening.test.ts, ops/production-config.names.json, ops/topology-policy.json, scripts/prohibitions/limiter-policy.test.mjs]
  modified: [apps/api/src/app.ts, apps/api/src/routes/auth.ts, apps/api/src/routes/admin-posts.ts, apps/api/src/routes/taxonomy.ts, apps/api/src/routes/pages.ts, apps/api/src/routes/media.ts, apps/api/src/routes/admin-export.ts, scripts/check-boundaries.mjs, scripts/local-verify.mjs, scripts/local-verify.test.mjs]
key-decisions:
  - "Rate limiting is explicitly single-process, socket-address based, trustProxy-disabled, bounded to 4096 live keys, and never claims distributed protection."
  - "Every protected mutation authenticates the opaque session before exact-Origin disclosure or rate/body/service work."
  - "Server resources are created only after command-aware configuration validation; one-shot commands close immediately, while the serving pool remains owned by the Fastify application lifecycle."
  - "Production topology/configuration evidence remains symbolic and value-free; only the Web edge may be host-published, and no live host is contacted by the security gate."
patterns-established:
  - "Unsafe route inventory: each POST/PUT/DELETE route has an explicit content type, body cap, and limiter classification."
  - "Canonical security verification: generated Compose namespace, migrated database, semantic TAP enforcement, secret-redacted logs, and exact teardown."
requirements-completed: [SEC-01, SEC-02, SEC-03, OPS-01]
coverage:
  - id: D1
    description: Every unsafe administrator route uses session-first exact-Origin authorization with deterministic bounded abuse responses.
    requirement: SEC-01
    verification:
      - kind: integration
        ref: apps/api/test/security-hardening.test.ts#unsafe route inventory, login limiter, and mutation ordering
        status: pass
      - kind: integration
        ref: corepack pnpm local:verify -- --phase4-security
        status: pass
    human_judgment: false
  - id: D2
    description: Hostile SQL-shaped, Markdown, and media inputs cannot create executable output, unexpected rows, or orphan files.
    requirement: SEC-02
    verification:
      - kind: integration
        ref: apps/api/test/security-hardening.test.ts, apps/api/test/markdown-renderer.test.ts, apps/api/test/media.test.ts
        status: pass
      - kind: integration
        ref: corepack pnpm local:verify -- --phase4-security
        status: pass
    human_judgment: false
  - id: D3
    description: Command-aware configuration fails closed before Pool, media storage, or listener creation and tracked artifacts contain no credential values.
    requirement: SEC-03
    verification:
      - kind: unit
        ref: apps/api/test/security-hardening.test.ts#runtime configuration rejects unsafe production input before resources can be created
        status: pass
      - kind: integration
        ref: corepack pnpm test:ops
        status: pass
    human_judgment: false
  - id: D4
    description: Name-only topology policy exposes only the Web edge and rejects browser-visible API/PostgreSQL authority or public data-plane ports.
    requirement: OPS-01
    verification:
      - kind: unit
        ref: scripts/local-verify.test.mjs#public data plane prohibition fixture
        status: pass
      - kind: integration
        ref: corepack pnpm local:verify -- --phase4-security
        status: pass
    human_judgment: false
duration: 1h 52m
completed: 2026-08-09
status: complete
---

# Phase 04 Plan 01: Security Hardening Summary

**Blog X now has a fail-closed, locally reproducible API security boundary with bounded abuse controls, shared mutation authority, hostile-input durability, and Web-edge-only topology evidence.**

## Performance

- **Duration:** 1h 52m
- **Started:** 2026-08-09T09:49:05Z
- **Completed:** 2026-08-09T11:40:52Z
- **Tasks:** 3
- **Files modified:** 24

## Accomplishments

- Added strict command-aware startup configuration plus bounded, injected-clock login/general/admin rate limiting with honest single-process scope and no forwarded-address trust.
- Migrated every unsafe route, including logout and legacy publish, to an enumerated session-first, exact-Origin, no-store, body/content, and mutation-rate policy.
- Added hostile SQL-shaped, Markdown, upload-failure, secret, and topology fixtures and a non-skippable generated `--phase4-security` verifier.
- Preserved local container reachability and administrator taxonomy deletion while making the API database pool follow application lifetime instead of closing immediately after listen.

## Task Commits

1. **Task 1: Bounded startup and login security tracer** — `cf38b80` (RED), `b3e6465` (GREEN)
2. **Task 2: Unified unsafe route policy** — `9505b41` (RED), `0faf8cd` (GREEN)
3. **Task 3: Hostile input and canonical security gate** — `4ad386c` (RED), `43aba22` (GREEN)
4. **Integration recovery** — `c05a023`, `bd1f95c`, `6eba74f` (fixes)

## Verification

- `corepack pnpm --filter @blog-x/api typecheck` — passed.
- `corepack pnpm --filter @blog-x/api exec tsx --test test/security-hardening.test.ts` — 9 passed, 0 failed/skipped/todo.
- `corepack pnpm local:verify -- --phase4-security` — exit 0: `[local-verify] blogxverify_252ebbd1674c passed` and `[local-verify] all requested checks passed`.
- Canonical verifier covered workspace typecheck/build, operations prohibitions, 11 generated-database API suites, security/Markdown suites, clean logs, and exact namespace teardown.

## Decisions Made

- Keep the limiter deliberately single-process and socket-authoritative; Phase 4 policy rejects distributed or forwarded-header claims.
- Treat authentication as the first protected-mutation authority, then exact Origin, then the administrator rate bucket, before parsing or service work.
- Close migration/seed/schema pools when their one-shot command ends, but close serving resources only through Fastify application shutdown.
- Model production configuration and topology using strict name-only/value-free JSON rather than deployable environment examples or live host evidence.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Preserved internal API container reachability.**
- **Found during:** Final generated Compose acceptance.
- **Issue:** The strict serve configuration defaulted to loopback, which is not reachable from the Web container when an explicit bind is absent.
- **Fix:** Made the development serve default `0.0.0.0` while keeping Compose API host ports unpublished and production topology policy Web-edge-only.
- **Files modified:** `apps/api/src/security/config.ts`, `apps/api/test/security-hardening.test.ts`
- **Verification:** Isolated API/Web Compose health and canonical Phase 4 verifier passed.
- **Committed in:** `c05a023`

**2. [Rule 1 - Bug] Retained the serving database pool for the application lifetime.**
- **Found during:** Final generated Compose acceptance after Web reported public content unavailable.
- **Issue:** `app.listen()` resolved after binding and the enclosing `finally` immediately called `pool.end()`, leaving a live API process whose database routes returned 500.
- **Fix:** Separated one-shot resource cleanup from serving cleanup, registered idempotent Fastify `onClose` ownership, and added a lifecycle regression test.
- **Files modified:** `apps/api/src/app.ts`, `apps/api/test/security-hardening.test.ts`
- **Verification:** Container-internal public API returned 200, Web became healthy, focused tests and canonical verifier passed.
- **Committed in:** `bd1f95c`

**3. [Rule 1 - Compatibility] Aligned taxonomy deletion with the empty-body security policy.**
- **Found during:** Canonical generated-database taxonomy regression.
- **Issue:** The Web client and legacy test sent `{}` to a route whose named policy intentionally allows no request body, producing 413 before deletion.
- **Fix:** Removed the unnecessary JSON body/content type from the real Web request and updated both successful and associated-delete integration cases.
- **Files modified:** `apps/web/app/admin/_components/TaxonomyManager.tsx`, `apps/api/test/taxonomy.test.ts`
- **Verification:** API/Web typechecks and the full canonical Phase 4 security verifier passed.
- **Committed in:** `6eba74f`

**Total deviations:** 3 auto-fixed (Rule 1: 2, Rule 3: 1).
**Impact:** All fixes were required to preserve existing local behavior under the stricter security boundary; no external service, dependency, or deployment scope was added.

## Issues Encountered

- The first final verifier exposed the prematurely closed Pool; an isolated local Compose namespace reproduced the exact 500 and was removed with its generated volumes after verification.
- The second final verifier exposed the taxonomy empty-body mismatch; the third canonical run passed completely.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 04-02 backup, restore rehearsal, process/log, and health operations work. The security runner and Web-edge-only policy are stable prerequisites.

Main server `47.99.80.8`, secondary server, cloud services, registries, CDN, and ACME were not contacted. All evidence came from the local workspace, Docker/Colima, generated containers, and loopback traffic.

## Self-Check: PASSED

- All nine `04-01` production/test commits exist and all 24 changed artifacts are tracked.
- All four requirement deliverables have passing automated coverage.
- `corepack pnpm local:verify -- --phase4-security` passed with no skips, TODOs, secret leakage, external contact, or leftover generated namespace.

---
*Phase: 04-secure-operations-and-release-gate*
*Completed: 2026-08-09*
