---
phase: 10-controlled-scheduled-publishing
plan: "02"
subsystem: admin-api-ui
tags: [postgresql, fastify, react, native-forms, audit, scheduled-publishing]
requires:
  - phase: 10-controlled-scheduled-publishing
    provides: paired draft schedule columns, strict contracts, and schedule audit vocabulary
provides:
  - authenticated row-locked schedule, reschedule, and cancel lifecycle
  - database-time future validation and content-free schedule audit evidence
  - progressively enhanced same-origin schedule controls with a no-script fallback
affects: [10-03, due-publisher, admin-lifecycle, audit, archive-fixtures]
actuals:
  tokens: 38742
  tasks: 3
  commits: 4
tech-stack:
  added: []
  patterns: [transaction-scoped-database-time, strict-schedule-dto, native-form-enhancement]
key-files:
  created: []
  modified:
    - apps/api/src/content/article-service.ts
    - apps/api/src/routes/admin-posts.ts
    - apps/web/app/admin/_components/ArticleActions.tsx
    - apps/web/app/admin/audit/page.tsx
key-decisions:
  - "The JSON PUT/DELETE schedule API remains semantic, while POST form aliases provide a progressively enhanced no-script path."
  - "PostgreSQL CURRENT_TIMESTAMP from the retained-row transaction is the sole schedule and first-publication clock."
  - "scheduledByAdministratorId is retained execution authority and is excluded from strict admin DTOs."
patterns-established:
  - "Every schedule mutation authenticates before Origin, parsing, lookup, or state disclosure."
  - "First-public history is explicit after publish; draft metadata and a pending schedule cannot set it implicitly."
requirements-completed: [CONT-05, CONT-08]
coverage:
  - id: D1
    description: "An administrator can schedule, reschedule, cancel, manually publish, and delete retained drafts through one row-locked, database-time transaction boundary."
    requirement: CONT-05
    verification:
      - kind: integration
        ref: apps/api/test/article-lifecycle.test.ts#a retained draft schedule is authenticated, future-only, row-locked, and content-free audited
        status: pass
      - kind: other
        ref: corepack pnpm test && corepack pnpm -r typecheck
        status: pass
    human_judgment: false
  - id: D2
    description: "Schedule controls provide same-origin native forms, strict enhanced responses, keyboard operation, and 390/768/1280 responsive checks."
    requirement: CONT-05
    verification:
      - kind: e2e
        ref: apps/web/e2e/article-lifecycle.spec.ts
        status: unknown
    human_judgment: false
  - id: D3
    description: "Invalid or stale schedule actions stay opaque and leave retained article and audit evidence unchanged."
    requirement: CONT-08
    verification:
      - kind: integration
        ref: apps/api/test/article-lifecycle.test.ts#a retained draft schedule is authenticated, future-only, row-locked, and content-free audited
        status: pass
    human_judgment: false
duration: 1h 35m
completed: 2026-09-04
status: complete
---

# Phase 10 Plan 02: Controlled Scheduled Publishing Summary

**Draft schedules now use PostgreSQL transaction time, retained-row locks, exact audit evidence, and responsive native admin forms without treating a deadline as public history.**

## Accomplishments

- Added authenticated JSON and form-compatible schedule/reschedule/cancel mutations with session-first protection, strict syntax, bounded bodies, and stable 400/404/409 failures.
- Kept schedule authority separate from `publishedAt`; manual publish/delete clear both retained schedule fields in their locked transaction and first publication uses database time.
- Added labelled local datetime plus numeric UTC-offset controls, no-script redirects, enhanced same-origin fetch handling, dirty/recovery disabling, mobile layout, and content-free audit details.

## Task Commits

1. **Task 1: Schedule, reschedule, and cancel one saved draft through guarded row locks** — `6c551cd`.
2. **Task 2: Expose progressive native schedule controls** — `5b799e0`.
3. **Task 3: Seal responsive, recovery-safe, and auditable management behavior** — `2d8590c`.
4. **Rule 1 follow-up: seal serialization, portable authority, and archive fixture boundaries** — `2484005`.

## Verification

- Passed: `corepack pnpm test` (46/46) and `corepack pnpm -r typecheck`.
- The canonical local integration run passed draft, lifecycle, auth, export, public, taxonomy, and media suites before an existing archive browser fixture exposed the intentionally changed first-publication meaning. The fixture was corrected to use the explicit post-publication correction flow; its focused browser execution remains for phase-level verification.

## Deviations from Plan

### Auto-fixed Issues

1. **[Rule 1 - strict DTO bug] Kept scheduling actor out of administrator responses and normalized schedule dates.**
   - **Found during:** Task 1 canonical integration.
   - **Fix:** Excluded durable actor authority from `AdminPost` serialization and converted retained `Date` values to strict ISO strings.
   - **Committed in:** `2484005`.

2. **[Rule 1 - recovery validation bug] Rejected one-sided portable schedule authority after Zod optional-key normalization.**
   - **Found during:** Task 1 canonical export verification.
   - **Fix:** Validated paired schedule values by `undefined` presence and added a regression assertion.
   - **Files modified:** `packages/contracts/src/distribution.ts`, `packages/contracts/src/tracer.test.ts`.
   - **Committed in:** `2484005`.

3. **[Rule 1 - directly coupled browser fixture] Made archive-year setup use the explicit published-article correction flow.**
   - **Found during:** Task 3 canonical browser verification.
   - **Fix:** Removed reliance on a draft's prefilled `publishedAt`, which is no longer first-public history by design.
   - **Files modified:** `apps/web/e2e/about-archive.spec.ts`.
   - **Committed in:** `2484005`.

## Next Phase Readiness

Plan 10-03 can consume `publicationReadinessFields`, transaction-scoped database time, the retained schedule actor, and the partial due index to implement its bounded local due publisher. No server, deployment, timer, or browser-triggered publication was introduced.

## Self-Check: PASSED

- Task commits `6c551cd`, `5b799e0`, `2d8590c`, and `2484005` exist in `dev` history.
- Schedule service, native controls, responsive styling, audit rendering, and focused test files exist on disk.
