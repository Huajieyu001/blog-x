---
phase: 01-local-publishing-slice
plan: "07"
subsystem: public-reading
tags: [nextjs, fastify, markdown, shiki, rehype-sanitize, playwright]
requires:
  - phase: 01-local-publishing-slice
    provides: Published-only repository predicate, lifecycle state contract, and editorial homepage from Plans 01-05 and 01-06
provides:
  - Strict published-detail DTO and uniform unavailable-state 404 contract
  - One bounded cached server Markdown renderer shared by preview and permalink
  - Focused SSR technical-article layout with contained narrow-screen overflow
  - Browser proof for required Markdown, hostile content, visibility states, and responsive reading
affects: [01-08-local-acceptance, 02-reading-experience, 03-seo, 04-security]
actuals:
  tokens: 7349
  tasks: 2
  commits: 5
tech-stack:
  added: []
  patterns: [public detail predicates by construction, server-only sanitized HTML, bounded cached syntax highlighting, uniform public 404]
key-files:
  created:
    - apps/api/test/markdown-renderer.test.ts
    - apps/web/app/_components/ArticleBody.tsx
    - apps/web/e2e/public-reading.spec.ts
  modified:
    - packages/contracts/src/public-posts.ts
    - apps/api/src/content/public-repository.ts
    - apps/api/src/routes/public-posts.ts
    - apps/api/src/content/markdown.ts
    - apps/web/app/posts/[slug]/page.tsx
    - apps/web/app/public.module.css
key-decisions:
  - "Public detail reuses the repository-owned published/non-deleted/non-null-publication predicate and returns no Markdown or admin-only fields."
  - "Preview and permalink share one API renderer with a cached ten-language Shiki set; unknown fences remain escaped plaintext."
  - "The final sanitizer allows only HTTP(S) and root-relative link/image destinations plus the exact attributes required by Shiki output."
patterns-established:
  - "Public unavailable-state equivalence: draft, unpublished, soft-deleted, and unknown slugs all return the byte-identical not_found envelope and map to Next 404."
  - "ArticleBody is the Web package's sole sanitized-HTML insertion point; Markdown parsing and sanitization remain API-only."
requirements-completed: [CONT-02, READ-02]
coverage:
  - id: D1
    description: "Required GFM constructs render semantically through one bounded server renderer while raw executable markup and unsafe protocols are removed."
    requirement: READ-02
    verification:
      - kind: unit
        ref: "apps/api/test/markdown-renderer.test.ts#renders the supported technical Markdown surface and safely falls back for unknown fences"
        status: pass
      - kind: unit
        ref: "apps/api/test/markdown-renderer.test.ts#removes raw executable markup, event handlers, styles, and unsafe URL protocols after transforms"
        status: pass
      - kind: integration
        ref: "apps/api/test/public-visibility.test.ts#public detail exposes only published content, uses one renderer, and gives every unavailable slug the same response"
        status: pass
    human_judgment: false
  - id: D2
    description: "Published detail exposes only public metadata and sanitized HTML; draft, unpublished, deleted, and unknown slugs are indistinguishable."
    requirement: CONT-02
    verification:
      - kind: integration
        ref: "apps/api/test/public-visibility.test.ts#public detail exposes only published content, uses one renderer, and gives every unavailable slug the same response"
        status: pass
      - kind: e2e
        ref: "apps/web/e2e/public-reading.spec.ts#published permalink is a safe focused technical reading surface and every unavailable state is one 404"
        status: pass
    human_judgment: false
  - id: D3
    description: "The permalink SSR page presents title, summary, date, technical Markdown, and contained code/table overflow at desktop and 390px widths."
    requirement: READ-02
    verification:
      - kind: e2e
        ref: "apps/web/e2e/public-reading.spec.ts#published permalink is a safe focused technical reading surface and every unavailable state is one 404"
        status: pass
    human_judgment: false
duration: 20min
completed: 2026-08-08
status: complete
---

# Phase 1 Plan 07: Safe Technical Permalink Summary

**Blog X now renders published technical Markdown through one hardened server pipeline into a focused responsive permalink while every non-public state remains indistinguishable from an unknown slug.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-08-08T03:18:33Z
- **Completed:** 2026-08-08T03:38:33Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments

- Added a strict public-detail DTO and repository lookup that exposes only title, summary, slug, publication date, published status, and sanitized HTML.
- Hardened the sole preview/permalink Markdown renderer with ten preloaded languages, escaped unknown fences, final attribute/protocol sanitization, and hostile-content fixtures.
- Delivered a single-column SSR article with readable bilingual typography, semantic tables/quotes/links/images/code, internal overflow containment, and uniform Next 404 behavior.

## Task Commits

1. **Task 1 RED: Public detail and renderer acceptance** — `ebfb6b5`
2. **Task 1 GREEN: Secure public detail contract** — `a8e4001`
3. **Task 2 RED: Public reading browser acceptance** — `e92c7dd`
4. **Task 2 GREEN: Focused safe permalink reading** — `2ec6c91`
5. **Security refinement: Restrict rendered URL protocols** — `2fccbd9`

## Files Created/Modified

- `packages/contracts/src/public-posts.ts` — strict public detail and not-found schemas.
- `apps/api/src/content/public-repository.ts` — detail lookup using the same invariant public predicate as the list.
- `apps/api/src/routes/public-posts.ts` — rendered detail endpoint and uniform 404 response.
- `apps/api/src/content/markdown.ts` — cached bounded highlighter plus final sanitizer/protocol policy.
- `apps/api/src/app.ts` — removed the obsolete inline tracer detail handler.
- `apps/api/test/markdown-renderer.test.ts` — required syntax, unknown fence, and hostile-payload proof.
- `apps/api/test/public-visibility.test.ts` — public DTO, renderer parity, and unavailable-state matrix.
- `apps/api/test/article-draft-preview.test.ts` — updated parity assertion for the strict detail DTO.
- `apps/web/app/posts/[slug]/page.tsx` — dedicated SSR permalink and API-to-Next 404 mapping.
- `apps/web/app/_components/ArticleBody.tsx` — sole Web sanitized-HTML insertion point.
- `apps/web/app/public.module.css` — focused article typography and responsive overflow containment.
- `apps/web/e2e/public-reading.spec.ts` — desktop/narrow reading, hostile content, and four-state 404 journey.

## Decisions Made

- Public detail is assembled only after the public repository's invariant predicate succeeds; neither route parameters nor Web code can select draft/admin visibility.
- Shiki initialization is cached and limited to ten common technical languages with explicit aliases; unsupported fences remain normal escaped code.
- Author HTML stays disabled before transformation, then a final sanitizer permits only expected highlighter attributes and HTTP(S)/relative destinations.
- Web trusts only the strict API DTO and performs no client-side Markdown parsing or second sanitization pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Retired the obsolete inline tracer detail handler**

- **Found during:** Task 1 route registration
- **Issue:** Registering the planned dedicated detail route while retaining the old inline `/public/articles/:slug` handler would create a duplicate Fastify route and preserve the obsolete `html` contract.
- **Fix:** Removed the inline handler and updated the existing preview-parity regression to the new `renderedHtml` field.
- **Files modified:** `apps/api/src/app.ts`, `apps/api/test/article-draft-preview.test.ts`
- **Verification:** API typecheck, production build, draft-preview integration test, and all Chromium regressions pass.
- **Committed in:** `a8e4001`

---

**Total deviations:** 1 auto-fixed (1 blocking integration issue).  
**Impact on plan:** The fix completed the planned route extraction without adding dependencies or scope.

## Issues Encountered

- The first browser run navigated before the soft-delete redirect settled and aborted the following `page.goto`; waiting for the observable `/admin` destination removed the test race.
- The initial narrow layout used content-box sizing on a full-width padded article container; border-box sizing restored the asserted 390px viewport boundary.

## User Setup Required

None - no external service configuration required.

## Verification

- Workspace tests, recursive typechecks, and recursive production builds passed.
- Renderer and public-visibility database suites passed 4/4 against the disposable migrated PostgreSQL database.
- Public-reading, public-list, article-lifecycle, draft-preview, auth-session, and original walking-skeleton Chromium journeys passed sequentially, 6/6.
- Boundary scans found no supplied credentials or server IPs in changed application/planning files; Web application code retains no PostgreSQL/Drizzle/database URL ownership.

## Next Phase Readiness

- Plan 01-08 can compose the existing focused journeys into one isolated, rerunnable whole-phase verification command and document local startup.
- The shared Phase 1 requirements remain pending until Plan 01-08 completes the final whole-slice acceptance gate.
- The main-server freeze remains active; neither server was contacted.

## Self-Check: PASSED

---
*Phase: 01-local-publishing-slice*
*Completed: 2026-08-08*
