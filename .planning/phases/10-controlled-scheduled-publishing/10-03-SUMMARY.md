---
phase: 10-controlled-scheduled-publishing
plan: "03"
subsystem: scheduled-publishing-public-boundary
tags: [postgresql, transactions, skip-locked, cli, public-visibility]
requires:
  - phase: 10-controlled-scheduled-publishing
    provides: durable draft schedule authority and readiness policy
provides:
  - bounded DB-only publish-due command with redacted JSON results
  - one-transaction ordered PostgreSQL due publication with audit attribution
  - database-time exclusion of future public rows from shared projections
affects: [admin-lifecycle, public-discovery, rss, sitemap, local-delivery]
actuals:
  tokens: 8565
  tasks: 3
  commits: 6
key-files:
  created:
    - apps/api/src/content/scheduled-publisher.ts
  modified:
    - apps/api/src/content/admin-repository.ts
    - apps/api/src/app.ts
    - apps/api/src/content/public-repository.ts
    - apps/api/test/article-lifecycle.test.ts
key-decisions:
  - "publish-due requires exactly one --limit=N argument in the inclusive range 1..100 before it opens a database pool."
  - "The claimed batch is validated in full under ordered FOR UPDATE SKIP LOCKED row locks before any row is made public."
  - "Public projections use PostgreSQL CURRENT_TIMESTAMP rather than an API-host clock."
metrics:
  duration: 1h 24m
  completed: 2026-09-04
status: complete
---

# Phase 10 Plan 03: Controlled Scheduled Publishing Summary

**A local, bounded due publisher now atomically turns eligible retained drafts into public articles while every public reader rejects future publication times at the database boundary.**

## Accomplishments

- Added the DB-only `publish-due --limit=N` command. It parses its fixed grammar before creating a pool, always closes resources, never starts Fastify, and emits only a versioned command result, UTC instant, counts, limit, and article IDs.
- Added an ordered `(scheduled_at, id)` `FOR UPDATE SKIP LOCKED` transaction. Every candidate is validated before the first update; status, first publication instant, schedule clear, monotonic version, and durable-actor audit are committed together or all roll back.
- Added direct integration coverage for exact-due/future rows, empty/retry behavior, redacted result grammar, 1/25/100 limits, deterministic ties, concurrent publishers, and injected validation/audit failure rollback.
- Strengthened the shared public predicate with `published_at <= CURRENT_TIMESTAMP`, plus future-publication sentinels across public API, discovery/related, distribution, RSS/Sitemap browser journey, and same-origin scheduling UI flow.

## Task Commits

1. **Task 1: Publish one exactly-due draft through the DB-only command** — `e459cdd`, `7debb8d`.
2. **Task 2: Seal bounds, deterministic ordering, retries, concurrency, and lifecycle races** — `95760d3`, `6bf8b1f`.
3. **Task 3: Prove non-disclosure across every public surface and hand off verified source** — `dc847df`, `d3d05e8`.

## Verification

- Passed: `corepack pnpm test` — 46/46.
- Passed: `corepack pnpm -r typecheck`.
- Passed: `PUBLIC_ORIGIN=http://127.0.0.1:3100 corepack pnpm -r build` and `node scripts/check-boundaries.mjs` (0 findings).
- Passed before browser handoff: canonical isolated PostgreSQL lifecycle (including due publisher), Phase 2 visibility, public discovery, public distribution, taxonomy, export, auth, archive, and media suites.
- Not run: `local:deliver`; this executor did not create a receipt or self-review.

## Deviations from Plan

### Auto-fixed Issues

1. **[Rule 3 - verification invocation] Used the local verifier's sealed pnpm argument form.**
   - **Found during:** Canonical integration invocation.
   - **Issue:** The PLAN's `pnpm local:verify -- --canonical-integration ...` forwards an extra literal `--`, which the verifier intentionally rejects before test work.
   - **Fix:** Ran the equivalent sealed invocation `pnpm local:verify --canonical-integration --interruption-check --parallel-check`.

### Deferred Verification

The canonical run reached the pre-existing Plan 10-02 `apps/web/e2e/article-lifecycle.spec.ts` fixture and failed before Phase 3 browser execution. It waits for the obsolete `发布时间` label after publication and cannot find the no-JS schedule form; both are outside this plan's source ownership and were already unresolved by the prior plan's browser handoff. The run completed generated cleanup and all Plan 10-03-owned API/public suites before that fixture. Independent phase review should address or classify this fixture before the formal local-delivery gate.

## Known Stubs

None.

## Self-Check: PASSED

- `apps/api/src/content/scheduled-publisher.ts` exists and all six task commits are in `dev` history.
- The generated `apps/web/next-env.d.ts` build mutation was restored; the worktree contains only this summary before its metadata commit.
