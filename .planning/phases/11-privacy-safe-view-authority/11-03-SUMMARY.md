---
phase: 11-privacy-safe-view-authority
plan: "03"
subsystem: analytics-lifecycle
tags: [privacy, analytics, backup, recovery, browser]
requires:
  - 11-01
  - 11-02
provides:
  - bounded 400-day aggregate-view retention
  - backup/restore aggregate authority check
  - credential-free same-origin view beacon
affects: [analytics, backup, public-reading, local-delivery]
tech-stack:
  added: []
  patterns: [database-derived retention cutoff, opaque same-origin beacon, exact aggregate recovery assertion]
key-files:
  created:
    - apps/api/src/content/view-retention.ts
    - apps/web/app/posts/[slug]/ViewBeacon.tsx
  modified:
    - apps/api/src/content/view-aggregation-repository.ts
    - scripts/local-verify.mjs
    - apps/api/test/backup-restore.test.ts
    - apps/web/app/posts/[slug]/page.tsx
    - apps/web/e2e/public-reading.spec.ts
decisions:
  - Retention cleanup uses the database Shanghai date and a bounded 1..10000 batch limit.
  - Portable Markdown v1 remains content-only; restored daily aggregates are verified separately from its manifest.
  - Reading pages send a nonvisual, credential-free POST to the existing same-origin view endpoint after rendering.
metrics:
  duration: local executor session
  completed: 2026-09-05
status: complete
actuals:
  tokens: 12636
  tasks: 3
  commits: 7
---

# Phase 11 Plan 03: Privacy-Safe View Authority Summary

Bounded aggregate-view lifecycle handling, recovery verification, and a nonvisual same-origin reader beacon without persisting visitor identifiers or raw events.

## Completed Tasks

1. **Retention cleanup** — Added strict cleanup contracts and CLI handling, with a database-timezone 400-day cutoff, deterministic bounded batches, and focused coverage.
   - Commits: `af290dd`, `884b336`
2. **Recovery and export authority** — Seeded deterministic daily aggregates into the generated local fixture, asserted exact restored values, and proved portable Markdown v1 excludes analytics fields.
   - Commits: `a007a8f`, `22d87e6`
3. **Public reader beacon** — Mounted a client-only invisible beacon on published article pages and verified its opaque POST, no credential headers, no visual output, and no beacon for unavailable routes.
   - Commits: `98fa031`, `06ad0fe`

## Verification

- `corepack pnpm db:generate:check` — passed.
- `corepack pnpm local:verify -- --phase11-data` — passed 47/47; release state remained `BLOCKED`.
- Canonical local integration with interruption and parallel probes — passed 60/60; generated cleanup acknowledged.
- `corepack pnpm test` — passed 56/56.
- `corepack pnpm test:integration` — passed 77/77.
- `corepack pnpm local:deliver` — completed at `http://127.0.0.1:3100`, health and root-route probes passed; generated delivery evidence was intentionally removed after verification.

## Decisions Made

- Retention is aggregate-only and derives its cutoff in PostgreSQL using the configured Shanghai business day.
- Restore comparison asserts the exact ordered aggregate rows independent of portable v1 export contents.
- The browser beacon uses `credentials: "omit"`, an empty JSON body, and no rendered DOM placeholder.

## Deviations from Plan

### Auto-fixed Issues

1. **[Rule 1 - Bug] Made test fixture UUID values explicitly typed in the aggregate union query.**
   - **Found during:** Task 2 generated PostgreSQL verification.
   - **Fix:** Added explicit UUID casts so PostgreSQL can type the empty-union case deterministically.
   - **Files modified:** `apps/api/test/public-visibility.test.ts`
   - **Commit:** `22d87e6`

2. **[Rule 1 - Bug] Kept old portable v1 archives valid while asserting aggregate recovery independently.**
   - **Found during:** Task 2 backup restoration verification.
   - **Fix:** Treated optional scheduling fields as absent when a legacy portable artifact omits them, while preserving strict aggregate equality checks.
   - **Files modified:** `apps/api/test/backup-restore.test.ts`
   - **Commit:** `22d87e6`

3. **[Rule 1 - Bug] Used Playwright's full request headers and opaque-response header assertion.**
   - **Found during:** Task 3 browser verification.
   - **Fix:** Asserted browser-added origin through `allHeaders()` and verified the 204 body through its absent content-length rather than attempting to read an unavailable opaque body.
   - **Files modified:** `apps/web/e2e/public-reading.spec.ts`
   - **Commit:** `06ad0fe`

## Production Safety

Production release remains `BLOCKED`. All verification used disposable local PostgreSQL/Docker and the fixed local origin only. No server connection, credential use, deployment, or `main` mutation occurred.

## Self-Check: PASSED

- All six task commits are present on `dev` and pushed to `origin/dev`.
- The retention, recovery, verifier, article page, beacon, and E2E files named above exist.
- No Known Stubs or new threat flags were found in plan-created/modified files.
