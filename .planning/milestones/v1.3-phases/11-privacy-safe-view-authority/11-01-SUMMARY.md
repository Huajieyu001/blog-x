---
phase: 11-privacy-safe-view-authority
plan: "01"
subsystem: anonymous-view-aggregation
tags: [postgresql, drizzle, fastify, privacy, analytics]
requires: [phase-10-scheduled-publishing]
provides: [opaque-anonymous-view-post, shanghai-day-aggregate, atomic-source-buckets]
affects: [api-schema, public-api, local-verification]
tech-stack:
  added: []
  patterns: [shared-public-predicate, postgres-time-authority, atomic-upsert, opaque-response]
key-files:
  created:
    - packages/contracts/src/analytics.ts
    - apps/api/src/content/view-aggregation-repository.ts
    - apps/api/src/routes/public-views.ts
    - apps/api/drizzle/0009_article_daily_views.sql
  modified:
    - apps/api/src/db/schema.ts
    - apps/api/src/app.ts
    - apps/api/test/public-visibility.test.ts
    - packages/contracts/src/tracer.test.ts
decisions:
  - "Anonymous article views always return the same empty 204/no-store result, including ignored and database-failure outcomes."
  - "Only PostgreSQL derives the Shanghai calendar day and performs the total-plus-one-bucket increment."
  - "The Phase 11 migration inventory is verified as ten application tables and ten ordered migrations."
metrics:
  duration: "~25 minutes"
  completed: "2026-09-05"
status: complete
actuals:
  tokens: 13998
  tasks: 3
  commits: 2
---

# Phase 11 Plan 01: Privacy-Safe View Authority Summary

An opaque same-origin article-open route now writes only atomic, Shanghai-day anonymous PV aggregates for currently public articles.

## Completed Tasks

1. Added strict contracts for the fixed `direct`, `internal`, `search`, `social`, and `external` source tuple, a 180-character lowercase public-slug path, and an exact empty JSON body.
2. Added `article_daily_views` with a composite `(article_id, day)` primary key, aggregate-only counters, nonnegative/source-sum checks, a cleanup index, and generated migration `0009_article_daily_views`.
3. Added the public `POST /public/articles/:slug/view` tracer. It reuses `publicPredicate` inside one PostgreSQL `INSERT … SELECT … ON CONFLICT` statement, derives its day from `Asia/Shanghai`, and gives public, hidden, invalid, and failed requests the same empty `204` plus `cache-control: no-store` response.
4. Extended schema inventory verification to assert ten tables, ten migrations, the aggregate primary key/index/foreign key, and both counter constraints.
5. Added focused integration coverage for hidden lifecycle states, malformed/origin-rejected calls, no audit event, Shanghai-day authority, database failure opacity, and concurrent exact arithmetic.

## Verification

- Passed: `node --import tsx --test packages/contracts/src/tracer.test.ts` — 7/7 tests.
- Passed: `corepack pnpm --filter @blog-x/contracts exec tsc --project tsconfig.json --noEmit`.
- Passed: `corepack pnpm --filter @blog-x/api exec tsc --project tsconfig.json --noEmit`.
- Passed: `corepack pnpm db:generate:check` — no additional migration, snapshot, or journal drift.
- Static privacy scan found no session, audit, cookie, IP, User-Agent, Referer, fingerprint, or raw-event persistence in the new route/repository/contracts.

## Deviations from Plan

### Auto-fixed Issues

1. [Rule 2 - Critical migration verification] Added Phase 11 aggregate schema inventory checks while wiring the tracer.
   - **Found during:** Task 1.
   - **Issue:** The existing runtime schema verifier would have accepted only nine application tables and nine migrations after adding the aggregate table.
   - **Fix:** Updated `databaseSchema` and `schemaVerify` with the exact table, migration, index, foreign-key, primary-key, and check-constraint inventory.
   - **Files modified:** `apps/api/src/app.ts`.
   - **Commit:** `6ff2f31`.

### Local-only Verification Blockers

1. The disposable PostgreSQL/local verifier could not build its local image because Docker's in-container Corepack could not resolve the pinned pnpm archive (`registry.npmjs.org`, DNS `EAI_AGAIN`). The error was local-only and redacted; no cloud host, server credential, or production environment was contacted.
2. Task 3's fixed local refresh was not started because its explicit precondition requires a clean worktree while the orchestrator-owned Phase 11 `STATE.md` start marker remained uncommitted. Production release remains `BLOCKED`.

Both unrun verification items are recorded as open entries in `.planning/WINDOWS.md` for a later local-only retry.

### Requirement Progress

`STAT-01`, `STAT-02`, and `STAT-03` remain pending after this tracer plan. Plans `11-02` and `11-03` explicitly complete their request-boundary, browser, retention, and recovery portions, so marking them complete from this plan alone would overstate delivered behavior.

## Security Notes

- The route does not invoke administrator mutation, session, or audit behavior.
- No identity-bearing fields or raw events are persisted; the only durable data is article UUID, Shanghai date, total PV, and five source counters.
- The public eligibility test is embedded in the writing statement, so unknown, draft, unpublished, deleted, null-publication, and future-publication slugs do not create or update a row.

## Commits

- `28302dd` — `test(11-01): add failing anonymous view contract coverage`
- `6ff2f31` — `feat(11-01): add private daily view aggregation tracer`

## Self-Check: PASSED

- Required contracts, migration bundle, repository, route, schema inventory, and focused test file exist.
- Both implementation commits are present on `dev` and pushed to `origin/dev`.
