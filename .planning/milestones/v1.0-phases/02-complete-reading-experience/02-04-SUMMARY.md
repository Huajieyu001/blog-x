---
phase: 02-complete-reading-experience
plan: "04"
subsystem: media-api-storage-ui
tags: [multipart, sharp, media, accessibility, markdown, nextjs, playwright]
requires:
  - phase: 02-complete-reading-experience
    provides: administrator article editor, safe Markdown renderer, public article layout
provides:
  - Strict JPEG/PNG/WebP upload authority with protected sources and bounded derivatives
  - Same-origin immutable media URLs resolved only through database IDs
  - Accessible Markdown insertion and article-cover workflow with purposeful/decorative alt semantics
affects: [02-05, 02-06, operations, backup, deployment]
actuals:
  tokens: 0
  tasks: 5
  commits: 1
tech-stack:
  added: ["@fastify/multipart@10.1.0", "sharp@0.35.3"]
  patterns: [API-owned media authority, protected source plus public derivative, immutable UUID media URL, server-enforced cover semantics]
key-files:
  created: [apps/api/src/media/storage.ts, apps/api/src/media/processor.ts, apps/api/src/content/media-service.ts, apps/api/src/routes/media.ts, apps/web/app/admin/_components/MediaPanel.tsx, apps/web/e2e/media.spec.ts]
  modified: [apps/api/src/db/schema.ts, apps/api/src/content/markdown.ts, apps/web/app/admin/_components/ArticleEditor.tsx, apps/web/app/posts/[slug]/page.tsx, compose.yaml]
key-decisions:
  - "Only API-generated UUIDs and database lookup can resolve `/media/<id>`; filenames, storage keys, and protected sources never enter public DTOs."
  - "Uploads retain a protected source and publish a metadata-free, orientation-corrected derivative bounded to 2400px without upscaling."
  - "A non-decorative cover requires trimmed alt text in the shared server contract; decorative media is the only empty-alt cover path."
requirements-completed: [MEDIA-01]
coverage:
  - id: D-09
    description: Declared MIME, signature, decode, static-page, size, pixel, dimension, polyglot and traversal validation.
    requirement: MEDIA-01
    verification:
      - kind: integration
        ref: apps/api/test/media.test.ts
        status: pass
    human_judgment: false
  - id: D-10
    description: Protected source plus stripped, corrected and bounded no-upscale derivative.
    requirement: MEDIA-01
    verification:
      - kind: integration
        ref: apps/api/test/media.test.ts
        status: pass
      - kind: container-build
        ref: apps/api/Dockerfile
        status: pass
    human_judgment: false
  - id: D-11
    description: Immutable database-authorized same-origin derivative access with no source or path disclosure.
    requirement: MEDIA-01
    verification:
      - kind: integration
        ref: apps/api/test/media.test.ts
        status: pass
      - kind: e2e
        ref: apps/web/e2e/media.spec.ts
        status: pass
    human_judgment: false
  - id: D-12
    description: Accessible upload, insertion and cover selection without destructive media lifecycle controls.
    requirement: MEDIA-01
    verification:
      - kind: e2e
        ref: apps/web/e2e/media.spec.ts
        status: pass
    human_judgment: false
duration: 0min
completed: 2026-08-09
status: complete
---

# Phase 02 Plan 04: Safe Article Media Summary

**Administrators can now upload validated images, insert same-origin Markdown references, and publish responsive article covers without exposing source files or storage paths.**

## Accomplishments

- Added a database-backed media authority, additive article-cover migration, API-owned local storage, strict multipart limits, single-frame image decoding, bounded processing, and immutable derivative streaming.
- Restricted media to JPEG, PNG, and WebP up to 5 MiB; rejected MIME mismatches, SVG/GIF/polyglots, oversized or high-pixel inputs, malformed UUIDs, unsafe Markdown URLs, and traversal keys.
- Added an accessible editor media panel with alt/decorative semantics, preserved Markdown on failure, cursor-aware insertion, cover selection, intrinsic dimensions, and responsive public rendering.
- Added persistent container media storage and verified both API and Web images build with the pinned native image-processing dependency.

## Task Commits

1. **Tasks 1–5: Approved dependencies, media authority, migration gate, hostile-media tests, editor and public rendering** — `2b5485f`

## Decisions Made

- Source images remain API-owned and non-served; only stripped derivatives are streamed through `/media/<UUID>` after a database lookup.
- The server, not the browser, owns MIME detection, decoding limits, dimensions, storage keys, derivative metadata, and cover validity.
- Permanent media deletion and garbage collection remain intentionally absent until a later lifecycle phase can define reference safety and recovery.

## Deviations from Plan

- The generated migration is `0005_curved_magus.sql`, not the plan's anticipated `0004_phase2_media.sql`, because the repository already contained the preceding migration sequence. The migration remains additive and the ledger correctly advanced from five to six entries.
- The in-app browser had no connected instance for an additional visual screenshot. The isolated real-Chromium Playwright journey completed successfully, so this did not reduce automated browser coverage.

## Verification

- Hostile media API suite: 4/4 passed against migrated PostgreSQL and real filesystem storage.
- Existing Markdown, draft, lifecycle, public visibility/list and taxonomy regressions: passed.
- Contract tests: 4/4 passed, including server-side purposeful/decorative cover semantics.
- Isolated production-build Playwright at 3200/3201: 1/1 passed across upload failure retention and 375/768/1280 layouts.
- Workspace typecheck/build, Docker Compose image build, boundary audit, schema verification, UI safety and drift gates: passed.
- Local development database migrated in place and the current preview restarted at `http://127.0.0.1:3100` with persistent media rooted in the ignored local uploads directory.

## Issues Encountered

The Docker engine was initially stopped; starting the existing local Colima runtime allowed both images to build. No cloud server was contacted.

## Next Phase Readiness

Ready for Phase 02 Plan 05: responsive public shell, persisted theme preference, and explicit recoverable error states.

---
*Phase: 02-complete-reading-experience*
*Completed: 2026-08-09*
