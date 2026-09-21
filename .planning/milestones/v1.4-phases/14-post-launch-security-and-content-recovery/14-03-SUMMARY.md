---
phase: 14-post-launch-security-and-content-recovery
plan: "03"
subsystem: content-recovery
tags: [postgres, soft-delete, audit, nextjs, playwright]
requires:
  - phase: 14-post-launch-security-and-content-recovery
    provides: hardened administrator session and audit boundaries
provides:
  - strict content-free deleted-article listing
  - atomic deleted-to-draft restoration with slug retention
  - protected responsive trash workspace and recovery audit label
affects: [content-lifecycle, audit, local-delivery]
actuals:
  tokens: 11810
  tasks: 3
  commits: 6
tech-stack:
  added: []
  patterns: [locked soft-delete recovery with audit in the same transaction]
key-files:
  created: [apps/web/app/admin/trash/page.tsx, apps/web/app/admin/_components/DeletedPostList.tsx]
  modified: [apps/api/src/content/admin-repository.ts, apps/api/src/content/article-service.ts, apps/api/src/routes/admin-posts.ts, apps/web/e2e/article-lifecycle.spec.ts]
key-decisions:
  - "Restore updates the retained row to a non-public draft instead of copying, deleting, or releasing its slug."
  - "The deleted-list contract permits metadata only and fails closed on content-bearing upstream responses."
patterns-established:
  - "Lifecycle recovery uses locked minimal projections, one transaction, and content-free audit metadata."
requirements-completed: [CONT-09]
coverage:
  - id: D1
    description: "Authenticated administrators can confirm restoration of a deleted article as a private draft while preserving its identity and slug."
    requirement: CONT-09
    verification:
      - kind: unit
        ref: corepack pnpm test
        status: pass
      - kind: other
        ref: corepack pnpm typecheck
        status: pass
      - kind: other
        ref: PUBLIC_ORIGIN=http://127.0.0.1:3100 corepack pnpm --filter @blog-x/web build
        status: pass
    human_judgment: false
duration: 1d
completed: 2026-09-21
status: complete
---

# Phase 14 Plan 03: Deleted Article Recovery Summary

**The protected recycle bin lists only safe deletion metadata and restores the original row atomically to a non-public draft without releasing its slug or exposing content.**

## Accomplishments

- Added minimal deleted-list/restore contracts, row-lock recovery authority, same-origin restore route, and transaction-scoped deleted-to-draft audit evidence.
- Preserved original ID, markdown, and slug for administrator recovery while public URLs remain `not_found` both before and after restoration.
- Added responsive two-step confirmation, focus recovery, error retry, audit wording, and browser lifecycle coverage.

## Task Commits

1. **Task 1: minimal deleted projection and atomic restore** — `74fef82`.
2. **Task 2: protected trash workspace** — `93924b4`.
3. **Task 3: lifecycle UI and focused corrections** — `b40b8a8`, `7fc2458`, `7cd0836`.
4. **Historic fixed-local delivery evidence** — `d898da1` for revision `ec02ef7592a995eac4bd1b5a713f530f9b276366`.

## Verification

- `corepack pnpm --filter @blog-x/contracts typecheck` and API typecheck — passed.
- `corepack pnpm test` — 77/77 passed.
- `corepack pnpm typecheck` — passed.
- `node scripts/check-boundaries.mjs` — passed, 685 files checked.
- Web typecheck and `PUBLIC_ORIGIN=http://127.0.0.1:3100 corepack pnpm --filter @blog-x/web build` — passed.

## Issues Encountered

The disposable Phase 4 container gate was not repeated: its one current-run attempt during the same recovery session was blocked before tests by Docker Corepack DNS resolution for `registry.npmjs.org` (`EAI_AGAIN`). The historical fixed-local receipt remains available above.

## Deviations from Plan

The plan's migration-ledger count of 10 was the Phase 14 baseline. Current code legitimately has 16 migrations after later Phase 15–16 schema additions; 14-03 itself added no migration or schema/index change. No recovery-code gap was found.

## Self-Check: PASSED

- Existing 14-03 implementation commits and this recovery summary are present.
- No product code, state, roadmap, local preview, remote, server, main branch, or destructive operation was changed.
