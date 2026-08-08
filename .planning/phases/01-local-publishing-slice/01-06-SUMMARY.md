---
phase: 01-local-publishing-slice
plan: "06"
subsystem: public-reading
tags: [nextjs, fastify, postgresql, ssr, pagination, playwright]
requires:
  - phase: 01-local-publishing-slice
    provides: Recoverable publication lifecycle and stable published-only state contract from Plan 01-05
provides:
  - Fixed publication-only list/count API with deterministic 10-item pages
  - Restrained editorial SSR homepage with accessible explicit pagination
  - Immediate public-list visibility after publish, unpublish, republish, and soft delete
  - Dedicated permalink route baseline preserved for Plan 01-07
affects: [01-07-reading, 01-08-local-acceptance, 02-01-taxonomy, 03-01-seo]
actuals:
  tokens: 9972
  tasks: 2
  commits: 6
tech-stack:
  added: []
  patterns: [public predicates by construction, repeatable-read count/list snapshots, server-only internal API fetching, bounded link pagination]
key-files:
  created:
    - packages/contracts/src/public-posts.ts
    - apps/api/src/content/public-repository.ts
    - apps/api/src/routes/public-posts.ts
    - apps/api/test/public-list.test.ts
    - apps/api/test/public-visibility.test.ts
    - apps/web/app/page.tsx
    - apps/web/app/_components/PostCard.tsx
    - apps/web/app/_components/Pagination.tsx
    - apps/web/app/public.module.css
    - apps/web/e2e/public-list.spec.ts
  modified:
    - apps/api/src/app.ts
    - apps/web/app/lib/api.ts
    - apps/web/app/posts/[slug]/page.tsx
key-decisions:
  - "Own the published/non-deleted/non-null-publication predicate inside one public repository and reuse it for count and items in a repeatable-read transaction."
  - "Use one-based pages of ten ordered by publishedAt DESC then UUID DESC, returning truthful empty pages beyond the end."
  - "Render the homepage through a Next Server Component and internal API origin; the browser receives HTML and never fetches the public list or secondary-server address."
patterns-established:
  - "Public list DTOs expose only title, summary, slug, publication time, and the literal published state."
  - "Pagination is ordinary bounded links with previous/next, aria-current, stable URLs, and no client state or infinite scroll."
requirements-completed: [CONT-02, READ-01]
coverage:
  - id: D1
    description: "The list and count share publication-only predicates, a consistent snapshot, deterministic tie ordering, fixed page size, and explicit invalid/beyond-end behavior."
    requirement: CONT-02
    verification:
      - kind: integration
        ref: "apps/api/test/public-list.test.ts#public list is publication-only, deterministic, and explicitly paginated"
        status: pass
      - kind: integration
        ref: "apps/api/test/public-visibility.test.ts#lifecycle changes are reflected by the next public list request"
        status: pass
    human_judgment: false
  - id: D2
    description: "The SSR homepage displays title, summary, publication date, published state, permalink, and keyboard-accessible explicit pagination without a browser list fetch."
    requirement: READ-01
    verification:
      - kind: e2e
        ref: "apps/web/e2e/public-list.spec.ts#public SSR home exposes editorial cards, stable pagination, and fresh lifecycle visibility"
        status: pass
    human_judgment: false
  - id: D3
    description: "Fresh navigation reflects publish, unpublish, republish, and soft-delete visibility immediately without a rebuild."
    requirement: CONT-02
    verification:
      - kind: e2e
        ref: "apps/web/e2e/public-list.spec.ts#public SSR home exposes editorial cards, stable pagination, and fresh lifecycle visibility"
        status: pass
    human_judgment: false
duration: 9h 28m
completed: 2026-08-08
status: complete
---

# Phase 1 Plan 06: Published Editorial Home Summary

**Blog X now serves a deterministic publication-only API and a responsive editorial SSR homepage with stable, accessible pagination and immediate lifecycle visibility.**

## Performance

- **Duration:** 9h 28m elapsed (included unattended permission wait)
- **Started:** 2026-08-07T17:47:55Z
- **Completed:** 2026-08-08T03:16:32Z
- **Tasks:** 2
- **Files modified:** 17

## Accomplishments

- Extracted a strict public list contract and repository whose item and total queries share the same published/non-deleted/non-null-date predicate inside one repeatable-read snapshot.
- Fixed pages at ten items, ordered by publication time descending and UUID descending, with deterministic ties, truthful totals, strict page validation, and non-destructive beyond-end results.
- Replaced the tracer homepage with a restrained editorial Server Component containing publication metadata, summaries, permalinks, clear empty/error states, and responsive typography.
- Added bounded previous/next and numbered links with current-page semantics, visible keyboard focus, and stable `?page=N` URLs.
- Proved that draft, unpublished, and soft-deleted articles affect neither cards nor totals and that lifecycle changes appear on the next navigation without rebuilding.

## Task Commits

1. **Task 1 RED: Public-list and visibility acceptance** — `a70450f`
2. **Task 1 GREEN: Deterministic public contract** — `926b7aa`
3. **Task 2 RED: Editorial-home browser journey** — `2178c9f`
4. **Task 2 GREEN: Editorial SSR home and pagination** — `a43c9e1`
5. **Route-boundary fix: Retire conflicting tracer catch-all** — `e2736ef`
6. **Acceptance isolation: Cleanup fixtures and preserve tracer selectors** — `55a70e3`

## Files Created/Modified

- `packages/contracts/src/public-posts.ts` — strict page query, public item, paginated response, and invalid-page schemas.
- `apps/api/src/content/public-repository.ts` — fixed public predicate plus repeatable-read count/list transaction.
- `apps/api/src/routes/public-posts.ts` — strict one-based page validation and list endpoint.
- `apps/api/test/public-list.test.ts` — ordering, tie, boundary, leak, metadata, and invalid-query proof.
- `apps/api/test/public-visibility.test.ts` — next-request lifecycle visibility proof.
- `apps/web/app/page.tsx` — dedicated publication-only SSR homepage and empty/error states.
- `apps/web/app/_components/PostCard.tsx` — editorial title, summary, status, date, and permalink card.
- `apps/web/app/_components/Pagination.tsx` — bounded accessible ordinary links.
- `apps/web/app/public.module.css` — restrained editorial desktop/mobile visual system.
- `apps/web/e2e/public-list.spec.ts` — SSR/API parity, keyboard pagination, hidden-state, and lifecycle journey.
- `apps/web/app/posts/[slug]/page.tsx` — preserved permalink baseline after retiring the optional catch-all route.

## Decisions Made

- The database owns stable ordering through `publishedAt DESC, id DESC`; display code never reorders results.
- Public count and items run within one read-only repeatable-read transaction so pagination metadata cannot describe a different visibility snapshot.
- The root page is dynamic SSR with `cache: no-store`, keeping successful lifecycle transitions visible on the next request without client fetching or a rebuild.
- The Sites skill's existing-project and accessibility guidance was applied, but Sites hosting and social-card generation were intentionally omitted because this repository is self-hosted, production is frozen, and SEO imagery belongs to Phase 3.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Replaced the optional catch-all route with the planned permalink route**

- **Found during:** Task 2 production build
- **Issue:** Next.js rejects a dedicated `/` route when `/[[...path]]` has equal specificity.
- **Fix:** Preserved the tracer permalink behavior at `/posts/[slug]` and removed the obsolete optional catch-all.
- **Files modified:** `apps/web/app/[[...path]]/page.tsx`, `apps/web/app/posts/[slug]/page.tsx`
- **Verification:** Next production build and all permalink browser regressions pass.
- **Committed in:** `e2736ef`

**2. [Rule 3 - Blocking] Kept PostgreSQL E2E fixture ownership in the API package**

- **Found during:** Task 2 RED browser run
- **Issue:** Importing `pg` from a Web E2E file failed and would blur the package boundary.
- **Fix:** Moved disposable database fixture setup to an API-owned TypeScript helper invoked by the test runner.
- **Files modified:** `apps/api/test/public-list-e2e-fixture.ts`, `apps/web/e2e/public-list.spec.ts`
- **Verification:** The browser journey starts with deterministic public/non-public fixtures while Web production code remains database-free.
- **Committed in:** `2178c9f`

**3. [Rule 1 - Bug] Isolated the shared lifecycle acceptance database**

- **Found during:** Browser regression suite
- **Issue:** The public-list runner left a differently named administrator in the shared disposable database, blocking the following lifecycle seed.
- **Fix:** Added API-owned setup/cleanup and an EXIT trap so the public-list suite restores an empty disposable database even on failure.
- **Files modified:** `apps/api/test/public-list-e2e-fixture.ts`
- **Verification:** Public-list and lifecycle browser suites pass consecutively.
- **Committed in:** `55a70e3`

**4. [Rule 1 - Bug] Disambiguated the original tracer's title-link selector**

- **Found during:** Original walking-skeleton regression
- **Issue:** The accessible “read article” link intentionally includes the title, so the previous substring selector matched two links.
- **Fix:** Required the exact title-link accessible name in the existing test.
- **Files modified:** `apps/web/e2e/walking-skeleton.spec.ts`
- **Verification:** Original publish-to-permalink journey passes.
- **Committed in:** `55a70e3`

---

**Total deviations:** 4 auto-fixed (2 blocking, 2 bugs).  
**Impact on plan:** All fixes preserved the intended architecture and acceptance behavior; no new dependency, deployment, SEO, media, or production scope was introduced.

## Issues Encountered

- The managed environment required explicit local-network permission before PostgreSQL and browser runners could connect to loopback services; execution resumed automatically after approval.

## User Setup Required

None - no external service configuration required.

## Verification

- Frozen-lockfile installation passed.
- Drizzle generation reported no schema changes or missing migration.
- Recursive contract/API/Web typechecks and production builds passed.
- Workspace unit tests passed; database suites skip only without their explicit disposable database variables.
- Disposable PostgreSQL public-list and lifecycle-visibility tests passed 2/2.
- Editorial homepage Chromium journey passed 1/1.
- Article lifecycle, draft preview, authentication lifecycle, and original publish-to-public-reading Chromium regressions each passed 1/1 when run sequentially on shared local ports.
- Boundary scan found no supplied credentials or server public IPs in application code; Web production code contains no PostgreSQL, Drizzle, or `DATABASE_URL` import.

## Next Phase Readiness

- Plan 01-07 can now focus on the dedicated `/posts/[slug]` route, safe technical-content presentation, and uniform public 404 behavior.
- The main-server freeze remains active; neither server was contacted.

## Self-Check: PASSED

---
*Phase: 01-local-publishing-slice*
*Completed: 2026-08-08*
