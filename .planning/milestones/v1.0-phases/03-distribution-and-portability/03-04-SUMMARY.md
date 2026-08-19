---
phase: 03-distribution-and-portability
plan: "04"
subsystem: api, portability, testing
tags: [fastify, postgres, zod, playwright, export, fail-closed]
requires:
  - phase: 03-03
    provides: canonical generated-origin Phase 3 verifier and topology gates
provides:
  - authenticated fixed-name version-1 logical Markdown export
  - strict retained-source reconstruction and disclosure contracts
  - visible same-origin browser download control
affects: [04-secure-operations-and-release-gate, backup, restore]
actuals:
  tokens: 12000
  tasks: 3
  commits: 8
tech-stack:
  added: []
  patterns: [strict portable manifest allowlist, read-only repeatable-read export snapshot, native same-origin POST download]
key-files:
  created: [apps/api/src/content/export-repository.ts, apps/api/src/routes/admin-export.ts, apps/api/test/distribution-export.test.ts]
  modified: [packages/contracts/src/distribution.ts, apps/api/src/app.ts, apps/api/src/routes/admin-export.ts, apps/web/app/admin/page.tsx, apps/web/e2e/phase3-distribution.spec.ts, scripts/local-verify.mjs, scripts/local-verify.test.mjs]
key-decisions:
  - "Logical export is exactly blog-x-portable-export version 1 and excludes binary media, storage keys, paths, rendered HTML, authentication, configuration, and infrastructure authority."
  - "The export selection is a dedicated read-only repeatable-read repository so retained soft-deleted source remains portable without broadening admin list semantics."
  - "A native relative POST form preserves browser-managed HttpOnly cookies and the browser Origin without SSR archive handling or URL secrets; its scoped parser accepts only an empty form body."
patterns-established:
  - "Sensitive archives authenticate before exact-Origin authorization, then access the repository."
  - "Portable reconstruction compares an independent normalized database snapshot to stringify/reparse schema-validated archive maps."
requirements-completed: [PORT-01]
coverage:
  - id: D1
    description: Authenticated administrators receive only the constant JSON export attachment after session and exact-Origin checks.
    requirement: PORT-01
    verification:
      - kind: integration
        ref: apps/api/test/distribution-export.test.ts#the protected export reconstructs every retained source state without binary or infrastructure disclosure
        status: pass
    human_judgment: false
  - id: D2
    description: The visible admin control downloads the strict archive only through the generated same-origin Web entrypoint.
    requirement: PORT-01
    verification:
      - kind: automated_ui
        ref: apps/web/e2e/phase3-distribution.spec.ts#Phase 3 metadata is a managed same-origin public journey
        status: pass
    human_judgment: false
duration: 3h 30m
completed: 2026-08-09
status: complete
---

# Phase 03 Plan 04: Portable Export Summary

**Administrators can download a strict, lossless logical Markdown manifest through a cookie-authenticated same-origin POST, with binary media deliberately deferred to Phase 4.**

## Accomplishments

- Added the exact `blog-x-portable-export` format/version-1 manifest and a read-only retained-source snapshot covering all article lifecycle states, taxonomy, About, cover intent, and safe media references.
- Added `POST /admin/export`: no-store, opaque-session authentication, exact configured Origin, then fixed-name JSON attachment.
- Added a visible native admin download form and managed browser/reconstruction contracts; the canonical Phase 3 selector now includes export semantics.

## Task Commits

1. **Task 1: Protected export tracer** — `9327ce4` (RED), `f296367` (GREEN)
2. **Task 2: Same-origin browser download** — `4de0e41` (RED), `9b50cae` (GREEN)
3. **Task 3: Retained-source reconstruction and canonical gate** — `10a1603` (RED), `2739b63` (GREEN)
4. **Browser recovery: native form parser and response assertions** — `e5c6690` (fix), `6882bc6` (test)

## Verification

- `corepack pnpm test:ops` — 10 passed, 0 failed/skipped/todo.
- `corepack pnpm check:boundaries` — `Boundary checks passed.`
- `corepack pnpm local:verify -- --phase3-export-browser` — exit 0: `[local-verify] blogxverify_8b90c180da0e passed` and `[local-verify] all requested checks passed`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Verification] Added dedicated export API/browser selector modes before the final canonical selector expansion.**
- **Found during:** Tasks 1–2
- **Issue:** The existing 03-03 runner had no task-scoped export seams, so a required generated DB/browser verification could not be selected.
- **Fix:** Added fail-closed `--phase3-export-api` and `--phase3-export-browser` modes, then added the export API suite to `--phase3-full`.
- **Files modified:** `scripts/local-verify.mjs`, `scripts/local-verify.test.mjs`
- **Verification:** operations tests, typechecks, boundary audit, generated verifier invocations.

### Auto-fixed Browser Recovery

**2. [Rule 1 - Native form compatibility] Scoped export form parsing after real-browser 415 evidence.**
- **Found during:** Post-plan focused browser verification
- **Issue:** The native empty `application/x-www-form-urlencoded` POST was rejected by Fastify's content-type parser before the route ran (`415 FST_ERR_CTP_INVALID_MEDIA_TYPE`), so no attachment/download event could occur.
- **Fix:** Registered an encapsulated URL-encoded string parser only in `adminExportRoutes`; accepts only an empty/absent body and rejects unexpected form data with 400 before repository access. Added API and Playwright response assertions for exact same-origin Origin, 200, JSON content type, and fixed disposition.
- **Files modified:** `apps/api/src/routes/admin-export.ts`, `apps/api/test/distribution-export.test.ts`, `apps/web/e2e/phase3-distribution.spec.ts`
- **Verification:** focused managed browser verifier exited 0; static operations/type/boundary checks passed.
- **Committed in:** `e5c6690`, `6882bc6`

**Total deviations:** 2 auto-fixed (Rule 1: 1, Rule 2: 1).
**Impact:** The recovery makes the previously specified native form work without accepting arbitrary form data, weakening authorization, or adding browser storage/token/internal-origin access.

## User Setup Required

None.

## Next Phase Readiness

Phase 4 can add binary-media backup/restore and recovery operations without changing the Phase 3 JSON format or adding a production import endpoint.

No cloud server, external API, registry, CDN, deployment target, or external host was contacted. Network activity was limited to local Docker/Colima and generated loopback Web/API traffic.

## Self-Check: PASSED

- Task commits exist and all task artifacts are tracked.
- The manifest excludes binary bytes, storage keys/paths, rendered HTML, auth/config data, and no import/public/GET counterpart is registered.
- The focused managed browser verifier exited 0 with the exact same-origin POST and fixed attachment contract.

---
*Phase: 03-distribution-and-portability*
*Completed: 2026-08-09*
