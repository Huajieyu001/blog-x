---
phase: 10-controlled-scheduled-publishing
plan: "01"
subsystem: database
tags: [postgresql, drizzle, zod, audit, portable-export, scheduled-publishing]
requires:
  - phase: 09-public-article-structured-data
    provides: strict public projection boundaries and revision-bound local delivery discipline
provides:
  - strict schedule authority separate from publishedAt
  - paired draft-only PostgreSQL schedule invariants and audit vocabulary
  - portable export and restore preservation of schedule actor and UTC instant
affects: [10-02, 10-03, admin-lifecycle, due-publisher, backup-restore]
actuals:
  tokens: 67312
  tasks: 3
  commits: 3
tech-stack:
  added: []
  patterns: [paired nullable schedule authority, exact schema inventory, protected portable schedule projection]
key-files:
  created: [apps/api/drizzle/0008_scheduled-publishing.sql]
  modified: [packages/contracts/src/admin-posts.ts, apps/api/src/db/schema.ts, apps/api/src/content/export-repository.ts]
key-decisions:
  - "scheduledAt remains distinct from publishedAt; the migration does not create jobs from legacy draft publication timestamps."
  - "A schedule is valid only when both UTC instant and administrator UUID are present on an undeleted draft."
  - "Portable v1 readers accept an absent legacy pair, while all new exports emit the two fields explicitly."
patterns-established:
  - "Schedule authority crosses protected backup/export boundaries only as a complete timestamp-plus-actor pair."
  - "Schema verification checks migration count, named columns, named checks, due index, and exact audit event presence."
requirements-completed: [CONT-05, CONT-07, CONT-08]
coverage:
  - id: D1
    description: Strict administrator, audit, and portable schedule contracts reject malformed, partial, and private input.
    requirement: CONT-05
    verification:
      - kind: unit
        ref: packages/contracts/src/tracer.test.ts#schedule contracts and portable authority
        status: pass
      - kind: other
        ref: corepack pnpm -r typecheck
        status: pass
    human_judgment: false
  - id: D2
    description: PostgreSQL retains only attributed draft schedules and leaves legacy draft publishedAt values unscheduled.
    requirement: CONT-08
    verification:
      - kind: integration
        ref: apps/api/test/article-lifecycle.test.ts#scheduled publication schema preserves legacy draft publication timestamps
        status: unknown
    human_judgment: false
  - id: D3
    description: Protected portable export and backup/restore retain both the pending UTC deadline and scheduling administrator without public DTO expansion.
    requirement: CONT-07
    verification:
      - kind: integration
        ref: apps/api/test/distribution-export.test.ts#protected export reconstructs retained source state
        status: unknown
      - kind: integration
        ref: apps/api/test/backup-restore.test.ts#restored database authority
        status: unknown
    human_judgment: false
duration: 2h 8m
completed: 2026-09-04
status: complete
---

# Phase 10 Plan 01: Controlled Scheduled Publishing Summary

**Separate, attributed UTC schedule authority now survives strict contracts, PostgreSQL migration checks, portable export, and local recovery.**

## Accomplishments

- Added `scheduled_at` and `scheduled_by_administrator_id` as retained draft metadata, with pair, active-draft, and deterministic due-index invariants.
- Added strict schedule input/admin response/audit schemas and a four-event content-free audit vocabulary; public distribution schemas remain unchanged.
- Made portable exports emit explicit schedule fields, while older v1 archives with neither field remain readable and recovery checks compare an attributed pending schedule exactly.

## Task Commits

1. **Task 1: Carry one pending schedule through strict admin, audit, database, and portable contracts** — `908fe87`.
2. **Task 2: Activate retry-safe database invariants and exact audit storage** — `6f1d3a7`.
3. **Task 3: Preserve pending schedules through portable export and recovery** — `fedc6f8`.

## Verification

- Passed: `corepack pnpm --filter @blog-x/contracts test` (12 tests), contract/API/workspace typechecks, and `node --test scripts/local-verify.test.mjs` (36 tests).
- The plan's `corepack pnpm local:verify -- --…` spelling reaches the verifier with an extra literal separator; the equivalent direct local verifier entry was used instead.
- The focused `--phase3-export-api` local run was blocked before tests by Docker/Corepack DNS failure fetching the already-pinned pnpm archive (`registry.npmjs.org`, `EAI_AGAIN`). No server was contacted and no code failure was reported. The final canonical integration result must be collected by the phase orchestrator after the local image/dependency authority is available.

## Deviations from Plan

### Auto-fixed Issues

1. **[Rule 3 - verification drift] Updated exact local verifier inventory for migration 0008.**
   - Added the ninth migration, schedule checks/index, and legacy-draft preservation probe to `scripts/local-verify.mjs` plus its existing test.
   - Committed in `6f1d3a7`.

2. **[Rule 3 - compile and contract compatibility] Updated directly coupled admin/audit consumers.**
   - Added the four exhaustive audit labels and amended the existing exact admin DTO assertions for the nullable `scheduledAt` response field.
   - Committed in `6f1d3a7`.

3. **[Rule 3 - recovery evidence] Seeded one deterministic attributed pending schedule in the existing local-only restore fixture.**
   - The existing backup/restore test now proves exact UTC timestamp and actor preservation.
   - Committed in `fedc6f8`.

## Next Phase Readiness

Plan 10-02 can implement authenticated schedule/reschedule/cancel mutations using `scheduleArticleInputSchema`, retained schedule fields, and the four audit events. Plan 10-03 can consume the partial due index and durable actor for its bounded local publisher. No timer, deployment, server access, or public schedule field was introduced.

## Self-Check: PASSED

- Summary and migration file exist on disk.
- Task commits `908fe87`, `6f1d3a7`, and `fedc6f8` exist in `dev` history.
