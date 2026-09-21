---
phase: 15
plan: "01"
subsystem: media
tags: [postgres, media, advisory-lock, content-references]
requires:
  - phase: 14-post-launch-security-and-content-recovery
    provides: same-origin administrator mutation and audit boundaries
provides:
  - fail-closed media ownership counts across content holders
  - transactionally serialized media tombstoning and content references
  - minimal bounded catalogue/deletion contracts
affects: [15-02, media-library, backup]
actuals:
  tokens: 6364
  tasks: 2
  commits: 3
tech-stack:
  added: []
  patterns: [sorted transaction-scoped media locks and content-free ownership responses]
key-files:
  created: []
  modified: [apps/api/src/content/media-reference-policy.ts, apps/api/src/content/media-service.ts, apps/api/src/content/page-repository.ts, apps/api/src/content/site-settings-repository.ts]
key-decisions:
  - "Every retained content owner contributes at most one opaque reference count per media ID."
  - "Unknown settings text conservatively retains exact lower-case root media paths."
patterns-established:
  - "Media deletion obtains the media lock before scanning all owning projections; writers validate the same retained-media authority before commit."
requirements-completed: [MEDIA-02]
coverage:
  - id: D1
    description: "Referenced media cannot be tombstoned while articles, About, or site settings retain it; unused media remains eligible for content-free cleanup."
    requirement: MEDIA-02
    verification:
      - kind: unit
        ref: node --import tsx --test apps/api/test/media.test.ts
        status: pass
      - kind: other
        ref: corepack pnpm typecheck
        status: pass
      - kind: other
        ref: node scripts/check-boundaries.mjs
        status: pass
    human_judgment: true
    rationale: "Disposable PostgreSQL URLs were not configured in this local executor, so database-backed media, lifecycle, and settings cases could only be compiled/skipped here."
duration: 15min
completed: 2026-09-22
status: complete
---

# Phase 15 Plan 01: Media Reference Authority Summary

**Media tombstoning now counts every retained content owner without exposing content or storage keys, and writers serialize reference validation with deletion.**

## Accomplishments

- Added strict bounded catalogue queries, opaque unavailable responses, deterministic media advisory locks, and reference counts for every article lifecycle state, About Markdown, and settings text.
- Kept cleanup after the committed tombstone while making retry cleanup opaque; deleted and unknown rows otherwise converge on `not_found`.
- Locked About and settings saves against the same retained-media authority. Existing article writers retain their established sorted media-ID `FOR KEY SHARE` protocol, which conflicts with the delete transaction's `FOR UPDATE` lock and preserves the same no-dangling-reference invariant.

## Task Commits

1. **Task 1: reference-aware delete slice** — `9168361`.
2. **Security correction: conservative settings parsing** — `145204f`.
3. **Task 2: content writer locks and holder coverage** — `5c72b4f`.

## Verification

- `node --import tsx --test apps/api/test/media.test.ts` — 6 passed; one database-dependent test skipped because `AUTH_TEST_DATABASE_URL` is unset.
- `node --import tsx --test apps/api/test/site-settings.test.ts` and `article-lifecycle.test.ts` — source loaded; database-dependent cases skipped because disposable DB URLs are unset.
- `corepack pnpm typecheck` — passed.
- `corepack pnpm test` — 77/77 passed.
- `node scripts/check-boundaries.mjs` — passed, 691 files checked.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] Settings reference parsing is conservative for unknown future content fields.**
- **Issue:** a whitespace-only pattern could miss an exact root media path embedded in a future rich-text-like settings value.
- **Fix:** count exact lower-case root paths while rejecting uppercase, external, and query/fragment lookalikes.
- **Committed in:** `145204f`.

## Issues Encountered

No disposable PostgreSQL URL is configured in this executor. Database-backed security regressions remain in the committed test files for the project’s integration gate; no Docker, network download, or preview refresh was attempted.

## Security Closure

- Delete scans complete minimal article/About/settings projections inside its transaction and denies on parser, database, or lock failure.
- Catalogue and error contracts expose only counts and public derivative metadata, never content or storage implementation fields.
- No schema, migration, dependency, public serving route, or mutation-policy relaxation was introduced.

## Self-Check: PASSED

- Product commits `9168361`, `145204f`, and `5c72b4f` exist.
- This summary is present; state, roadmap, requirements, main, servers, remotes, and fixed preview were not changed.
