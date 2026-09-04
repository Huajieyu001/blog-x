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
requirements-completed: [CONT-06, CONT-07, CONT-08]
coverage:
  - id: D1
    description: "A required bounded DB-only command publishes exactly eligible due drafts once under deterministic, concurrent claims."
    requirement: CONT-07
    verification:
      - kind: integration
        ref: apps/api/test/article-lifecycle.test.ts#bounded due publisher
        status: pass
    human_judgment: false
  - id: D2
    description: "Scheduled and future-publication content stays absent from every public surface until the database transaction commits."
    requirement: CONT-06
    verification:
      - kind: integration
        ref: apps/api/test/phase2-public-visibility.test.ts
        status: pass
      - kind: e2e
        ref: apps/web/e2e/phase3-distribution.spec.ts
        status: pass
    human_judgment: false
  - id: D3
    description: "Invalid candidates and audit failures produce a nonzero result and roll back the complete selected batch without content disclosure."
    requirement: CONT-08
    verification:
      - kind: integration
        ref: apps/api/test/article-lifecycle.test.ts#scheduled publisher rollback and output redaction
        status: pass
    human_judgment: false
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

### Resolved Verification Handoff

The executor's canonical run reached a pre-existing Plan 10-02 `apps/web/e2e/article-lifecycle.spec.ts` fixture and stopped before Phase 3 browser execution. The orchestrator later repaired that fixture and unsaved-draft handling in quick task `260904-x27`, sealed timezone round trips in `260905-45r`, and hardened restore/schema authority in `260905-4a4`. The final canonical gate passed 57/57 and formal local delivery passed 74/74, closing this handoff without a server or production action.

## Known Stubs

None.

## Self-Check: PASSED

- `apps/api/src/content/scheduled-publisher.ts` exists and all six task commits are in `dev` history.
- The generated `apps/web/next-env.d.ts` build mutation was restored; the worktree contains only this summary before its metadata commit.

## Final Phase Gate

The deferred lifecycle fixture was repaired in quick task `260904-x27`, timezone round trips were sealed in `260905-45r`, and restore/schema authority was hardened in `260905-4a4`. The final canonical run passed 57/57 with interruption and parallel cleanup proof, independent deep review found zero issues, and the one formal local delivery passed 74/74 at reviewed revision `b0556cb37978ec5668dc51e6ecafd7c955237a8e`. Its immutable receipt is `ops/local-deliveries/b0556cb37978ec5668dc51e6ecafd7c955237a8e.json`; production remains `BLOCKED`.
