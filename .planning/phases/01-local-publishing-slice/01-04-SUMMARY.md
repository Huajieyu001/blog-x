---
phase: 01-local-publishing-slice
plan: "04"
subsystem: content-authoring
tags: [fastify, postgresql, zod, markdown, shiki, nextjs, playwright]
requires:
  - phase: 01-local-publishing-slice
    provides: Shared contracts, PostgreSQL content spine, and opaque administrator sessions from Plans 01-02 and 01-03
provides:
  - Authenticated complete Markdown draft create, reopen, and update APIs
  - Sole final-sanitized GFM/Shiki renderer shared by public reading and unsaved preview
  - Responsive desktop split and narrow edit/preview authoring UI
  - Unicode-aware manual-freeze slug suggestions with retained-row global reservation
affects: [01-05-lifecycle, 01-06-home, 01-07-reading, 01-08-local-acceptance, 03-01-seo]
actuals:
  tokens: 14726
  tasks: 2
  commits: 6
tech-stack:
  added: []
  patterns: [guard-before-lookup admin routes, raw Markdown content authority, server-only preview rendering, stale-response suppression]
key-files:
  created:
    - packages/contracts/src/admin-posts.ts
    - apps/api/src/content/admin-repository.ts
    - apps/api/src/content/article-service.ts
    - apps/api/src/content/markdown.ts
    - apps/api/src/routes/admin-posts.ts
    - apps/api/test/article-draft-preview.test.ts
    - apps/web/app/admin/_components/ArticleEditor.tsx
    - apps/web/app/admin/admin.module.css
    - apps/web/app/admin/new/page.tsx
    - apps/web/app/admin/posts/[id]/page.tsx
    - apps/web/e2e/draft-preview.spec.ts
  modified:
    - apps/api/src/app.ts
    - apps/api/src/db/schema.ts
    - apps/web/app/lib/api.ts
    - apps/web/app/admin/page.tsx
key-decisions:
  - "Keep raw Markdown as content authority and derive both public and preview HTML through one Fastify renderer."
  - "Reserve every retained slug through the existing unconditional PostgreSQL unique index, including soft-deleted rows."
  - "Allow only HTTP(S) cover URLs and only the exact Shiki-generated class/style attributes through the final sanitizer."
patterns-established:
  - "Every admin content route authenticates before validation, lookup, persistence, or rendering and returns no-store."
  - "Browser authoring calls only relative /api endpoints and discards aborted or out-of-order preview responses."
requirements-completed: [CONT-01, CONT-03]
coverage:
  - id: D1
    description: "Complete draft metadata and raw Markdown round-trip through PostgreSQL while all retained rows reserve slugs and drafts remain non-public."
    requirement: CONT-03
    verification:
      - kind: integration
        ref: "apps/api/test/article-draft-preview.test.ts#draft metadata round-trips, slugs stay reserved, and preview uses the safe public renderer"
        status: pass
    human_judgment: false
  - id: D2
    description: "Authenticated unsaved preview is non-persisting, hostile-input sanitized, syntax highlighted, and byte-identical to public rendering."
    requirement: CONT-01
    verification:
      - kind: integration
        ref: "apps/api/test/article-draft-preview.test.ts#draft metadata round-trips, slugs stay reserved, and preview uses the safe public renderer"
        status: pass
    human_judgment: false
  - id: D3
    description: "The browser saves and reopens every field, freezes manual slugs, ignores stale previews, preserves errors, and keeps narrow-view unsaved input."
    requirement: CONT-01
    verification:
      - kind: e2e
        ref: "apps/web/e2e/draft-preview.spec.ts#administrator saves, reopens, and responsively previews a complete Markdown draft"
        status: pass
    human_judgment: false
duration: 55min
completed: 2026-08-07
status: complete
---

# Phase 1 Plan 04: Draft Authoring and Safe Preview Summary

**Blog X now has authenticated complete draft persistence and a responsive Markdown editor whose unsaved preview uses the same final-sanitized GFM/Shiki renderer as public reading.**

## Performance

- **Duration:** 55 minutes
- **Tasks:** 2
- **Files modified:** 22

## Accomplishments

- Added strict shared DTOs and guarded Fastify routes for draft creation, reopen, update, deterministic Unicode slug suggestion, validation errors, and conflicts.
- Persisted title, summary, HTTP(S) cover URL, globally reserved slug, raw Markdown, optional publication time, and SEO description through PostgreSQL.
- Extracted one Markdown renderer, corrected its final sanitizer execution, retained only controlled Shiki presentation attributes, and proved dangerous HTML/protocols are removed.
- Delivered a desktop source/preview split and state-preserving narrow toggle with debounced, abortable, sequence-checked preview calls.
- Kept the original login/publish/public-reading tracer green and exposed an admin link to the complete draft editor.

## Task Commits

1. **Task 1 RED: Draft and preview API acceptance** — `ee74feb`
2. **Task 1 GREEN: Guarded persistence and sole renderer** — `6f42c8f`
3. **Task 2 RED: Real browser editor journey** — `0f44366`
4. **Task 2 GREEN: Responsive complete draft editor** — `e0f3305`
5. **Security/content boundary hardening** — `603d93d`
6. **Sanitizer schema typing correction** — `e04a039`

## Files Created/Modified

- `packages/contracts/src/admin-posts.ts` — complete draft DTOs, stable error envelopes, HTTP(S) cover validation, and Unicode slug suggestion.
- `apps/api/src/content/admin-repository.ts` — parameterized draft persistence and retained-row reads.
- `apps/api/src/content/article-service.ts` — persistence-to-wire normalization.
- `apps/api/src/content/markdown.ts` — sole GFM/Shiki/final-sanitize rendering pipeline.
- `apps/api/src/routes/admin-posts.ts` — guard-first create/read/update/suggestion/preview endpoints.
- `apps/api/test/article-draft-preview.test.ts` — PostgreSQL security, round-trip, reservation, visibility, and renderer parity proof.
- `apps/web/app/admin/_components/ArticleEditor.tsx` — stateful metadata/Markdown editor with safe preview orchestration.
- `apps/web/app/admin/admin.module.css` — minimalist editorial desktop and narrow layouts.
- `apps/web/e2e/draft-preview.spec.ts` — save/reopen, responsive, validation-preservation, and stale-response browser acceptance.
- `apps/api/drizzle/0001_vengeful_trish_tilby.sql` — additive article metadata migration.

## Decisions & Deviations

### Auto-fixed issues

1. The active article schema lacked the three metadata columns assumed by the plan. An additive Drizzle migration and schema snapshot were generated and verified on a fresh local database.
2. The existing migration command only read migration `0000` and failed on repeat constraint creation. It now executes ordered SQL migrations under the same advisory lock and tolerates only known duplicate-object codes; full interruption journaling remains Plan 01-08.
3. Drizzle Kit could not resolve its strict-pnpm peer from the root command. The already-used `drizzle-orm` version was exposed as a root development dependency; no new package/version was introduced.
4. The inherited renderer registered `rehype-sanitize` but stringified without running its transform, leaving dangerous protocols intact. The renderer now explicitly runs the sanitizer and the hostile test proves removal.
5. Final sanitization initially removed Shiki presentation attributes. The allowlist was narrowed to exact generated classes plus generated style/tabindex fields, preserving highlighting without enabling raw HTML.
6. The new route needed a discoverable entry from `/admin`, so the existing tracer admin page gained a link while preserving prior browser expectations.

No lifecycle transitions, media upload, public-list redesign, SEO emission, or server deployment was added.

## Verification

- Frozen-lockfile installation passed.
- Drizzle schema generation reported no uncommitted schema changes.
- Recursive contract/API/Web typechecks passed.
- API and Next production builds passed.
- Workspace tests passed; environment-dependent database suites skip only when their explicit disposable DB variables are absent.
- Disposable PostgreSQL draft/preview integration suite passed 1/1.
- Draft editor Chromium journey passed 1/1.
- Authentication Chromium lifecycle passed 1/1.
- Original publish-to-public-reading Chromium tracer passed 1/1 when run alone; an initial parallel run was discarded because both suites intentionally share ports 3001/3100.
- The optional in-app visual browser had no available runtime instance; automated Chromium layout and control acceptance remained green.

## User Setup Required

None. Browser credentials were generated at runtime and were not committed.

## Next Phase Readiness

- Plan 01-05 can build publish, unpublish, republish, soft-delete, and published-slug confirmation on the complete draft service and editor.
- The main-server freeze remains active; neither server was contacted.

## Self-Check: PASSED

---
*Phase: 01-local-publishing-slice*
*Completed: 2026-08-07*
