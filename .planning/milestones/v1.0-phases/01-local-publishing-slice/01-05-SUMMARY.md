---
phase: 01-local-publishing-slice
plan: "05"
subsystem: content-lifecycle
tags: [fastify, postgresql, transactions, nextjs, playwright, soft-delete]
requires:
  - phase: 01-local-publishing-slice
    provides: Complete draft persistence, shared Markdown rendering, and authenticated authoring from Plan 01-04
provides:
  - Explicit transactional publish, unpublish, republish, edit, and soft-delete lifecycle
  - Publication-time preservation and version-bound published-slug confirmation
  - State-aware article management UI with no permanent purge action
  - Complete API and browser lifecycle acceptance coverage
affects: [01-06-home, 01-07-reading, 01-08-local-acceptance, 03-01-seo]
actuals:
  tasks: 2
  commits: 5
tech-stack:
  added: []
  patterns: [explicit lifecycle action endpoints, row-lock transactions, monotonic version tokens, retained-slug soft deletion]
key-files:
  created:
    - apps/api/src/content/article-state.ts
    - apps/api/test/article-lifecycle.test.ts
    - apps/web/app/admin/_components/ArticleActions.tsx
    - apps/web/e2e/article-lifecycle.spec.ts
  modified:
    - packages/contracts/src/admin-posts.ts
    - apps/api/src/content/admin-repository.ts
    - apps/api/src/content/article-service.ts
    - apps/api/src/routes/admin-posts.ts
    - apps/web/app/admin/_components/ArticleEditor.tsx
    - apps/web/app/admin/page.tsx
key-decisions:
  - "Change lifecycle status only through explicit action endpoints executed under a retained-row lock."
  - "Bind published-slug confirmation to article identity, current slug, and a monotonic persisted version."
  - "Soft delete retains Markdown, metadata, publication time, and slug while removing the article from ordinary admin and public reads."
patterns-established:
  - "Clients submit intent-specific actions and never status or deletedAt values."
  - "Ordinary edits and republish preserve first publication time unless a deliberate correction flag is submitted."
requirements-completed: [CONT-01, CONT-02, CONT-03]
coverage:
  - id: D1
    description: "Every draft, published, unpublished, and deleted state/action pair is explicit, transactional, authenticated, and origin-checked."
    requirement: CONT-01
    verification:
      - kind: integration
        ref: "apps/api/test/article-lifecycle.test.ts#the complete article state/action table allows only explicit lifecycle transitions"
        status: pass
    human_judgment: false
  - id: D2
    description: "First publication time, deliberate correction, confirmed slug changes, retained slug reservation, and recoverable soft deletion hold under PostgreSQL persistence."
    requirement: CONT-02
    verification:
      - kind: integration
        ref: "apps/api/test/article-lifecycle.test.ts#publish, edit, slug confirmation, unpublish, republish, and soft delete are atomic and recoverable"
        status: pass
    human_judgment: false
  - id: D3
    description: "Visible controls complete draft through soft-delete while publication time is preserved and costly slug changes require confirmation."
    requirement: CONT-03
    verification:
      - kind: e2e
        ref: "apps/web/e2e/article-lifecycle.spec.ts#draft completes publish, edit, slug confirmation, unpublish, republish, and soft-delete through visible controls"
        status: pass
    human_judgment: false
duration: 70min
completed: 2026-08-07
status: complete
---

# Phase 1 Plan 05: Recoverable Article Lifecycle Summary

**Blog X now gives the administrator explicit, transactional control over publication while protecting first-publication time, public slugs, and retained source content.**

## Performance

- **Duration:** 70 minutes
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments

- Added a complete four-state lifecycle table and intent-specific publish, unpublish, republish, edit, and soft-delete API paths.
- Serialized every retained mutation under a PostgreSQL row lock and prohibited client-controlled `status` or `deletedAt` writes.
- Preserved first publication time across ordinary edits, unpublish, and republish while supporting an explicit metadata correction.
- Required article-, slug-, and version-bound confirmation before changing a published public URL.
- Retained Markdown, metadata, publication time, and slug after soft deletion; ordinary admin/public reads hide deleted rows and no purge control exists.
- Replaced the leftover simple publish form with the real article-management list and migrated the original walking skeleton onto the formal draft lifecycle.

## Task Commits

1. **Task 1 RED: Article lifecycle acceptance** — `0b0dc8d`
2. **Task 1 GREEN: Recoverable lifecycle service and routes** — `38ab107`
3. **Task 2 RED: Full lifecycle browser journey** — `004707b`
4. **Task 2 GREEN: State-aware management controls** — `9c9fae3`
5. **Lifecycle/version and admin-path hardening** — `55db3a7`

## Files Created/Modified

- `packages/contracts/src/admin-posts.ts` — lifecycle actions, statuses, version-bound slug confirmation, and typed responses.
- `apps/api/src/content/article-state.ts` — complete allowed/rejected state/action table.
- `apps/api/src/content/admin-repository.ts` — retained-row listing and transactional `FOR UPDATE` mutation primitive.
- `apps/api/src/content/article-service.ts` — atomic validation, transitions, time preservation, slug confirmation, and soft deletion.
- `apps/api/src/routes/admin-posts.ts` — guarded list, update, publish, unpublish, republish, and delete endpoints.
- `apps/api/test/article-lifecycle.test.ts` — state-table, tampering, atomicity, timestamp, slug, visibility, and retention proof.
- `apps/web/app/admin/_components/ArticleActions.tsx` — state-appropriate actions and explicit soft-delete confirmation.
- `apps/web/app/admin/_components/ArticleEditor.tsx` — published-slug confirmation and deliberate publication-time correction.
- `apps/web/app/admin/page.tsx` — authenticated article-management list and formal draft entry point.
- `apps/web/e2e/article-lifecycle.spec.ts` — complete visible-control lifecycle journey.

## Decisions & Deviations

### Auto-fixed issues

1. Timestamp resolution could reuse the same `updatedAt` during rapid edits, weakening slug-confirmation freshness. Lifecycle mutations now advance the persisted version by at least one millisecond.
2. The plan needed management-list data but the prior web API helper only loaded one draft. A strict authenticated list helper and response schema were added.
3. The inherited `/admin` page still exposed the old one-field tracer form alongside the complete editor. It now opens the article-management list directly, and authentication/walking-skeleton tests use the formal create-save-publish path.
4. Existing draft-preview assertions and selectors were updated for the additive version field and state-aware action UI.

No hard-delete path, slug release, restore UI, redirects, public-home redesign, media upload, SEO work, or server deployment was added. The database schema already contained every required lifecycle column, so no migration was necessary.

## Verification

- Frozen-lockfile installation passed.
- Drizzle schema generation reported no uncommitted schema changes.
- Recursive contract/API/Web typechecks and production builds passed.
- Workspace tests passed; database suites skip only when their explicit disposable database variables are absent.
- Disposable PostgreSQL lifecycle suite passed 2/2.
- Full lifecycle Chromium journey passed 1/1.
- Authentication, draft-preview, and original publish-to-public-reading Chromium regressions each passed 1/1 when run sequentially on their shared ports.
- Secret scan found no supplied credentials; documented server IPs remain only in infrastructure/freeze policy files.

## User Setup Required

None. Disposable local databases and generated browser credentials were used; no server was contacted.

## Next Phase Readiness

- Plan 01-06 can build the public editorial homepage and pagination on the now-stable published-only content contract.
- The main-server freeze remains active; neither server was contacted.

## Self-Check: PASSED

---
*Phase: 01-local-publishing-slice*
*Completed: 2026-08-07*
