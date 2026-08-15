---
phase: 02-complete-reading-experience
plan: "03"
subsystem: api-contracts-ui
tags: [markdown, hast, toc, accessibility, nextjs, playwright]
requires:
  - phase: 01-local-publishing-slice
    provides: one safe server Markdown renderer and published article detail
provides:
  - Deterministic Unicode h2/h3 anchors and strict ToC detail DTO
  - Responsive SSR article ToC with no-JavaScript hash navigation
affects: [02-04, 02-05, reading-experience, external-links]
actuals:
  tokens: 0
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns: [server-owned heading anchors, collision-safe Unicode slugger, CSS-switched progressive ToC]
key-files:
  created: [apps/web/app/_components/ArticleToc.tsx, apps/web/e2e/article-toc.spec.ts]
  modified: [apps/api/src/content/markdown.ts, packages/contracts/src/public-posts.ts, apps/web/app/posts/[slug]/page.tsx, apps/web/app/public.module.css]
key-decisions:
  - "Only API-rendered h2/h3 nodes receive durable NFKC Unicode IDs and ToC entries."
  - "One SSR ToC DTO is presented as desktop nav or narrow native details without client parsing."
requirements-completed: [READ-03]
coverage:
  - id: D-06
    description: Deterministic multilingual h2/h3 IDs, duplicate suffixes, punctuation fallback, and hostile-heading safety.
    requirement: READ-03
    verification:
      - kind: unit
        ref: apps/api/test/markdown-renderer.test.ts
        status: pass
      - kind: integration
        ref: apps/api/test/public-visibility.test.ts
        status: pass
    human_judgment: false
  - id: D-07
    description: Sticky desktop ToC, native narrow details, and zero layout residue without qualifying headings.
    requirement: READ-03
    verification:
      - kind: e2e
        ref: apps/web/e2e/article-toc.spec.ts
        status: pass
    human_judgment: false
  - id: D-08
    description: Ordinary hash links and labelled heading permalinks continue to work with JavaScript disabled.
    requirement: READ-03
    verification:
      - kind: e2e
        ref: apps/web/e2e/article-toc.spec.ts
        status: pass
    human_judgment: false
duration: 0min
completed: 2026-08-08
status: complete
---

# Phase 02 Plan 03: Article Table of Contents Summary

**Published articles now expose durable multilingual heading links and an accessible server-rendered table of contents at every supported viewport.**

## Accomplishments

- Extended the only Markdown trust boundary with deterministic NFKC h2/h3 IDs, collision-safe suffixes, punctuation fallbacks, labelled permalinks, and matching strict ToC metadata.
- Kept raw HTML and unsafe protocols blocked while preserving preview/public renderer parity and excluding h1/h4 from the ToC.
- Added a sticky desktop directory, closed native details at 375/768, no empty sidebar for heading-free articles, and ordinary hash links verified with JavaScript disabled.

## Task Commits

1. **Task 1: Stable server heading anchors and ToC DTO** — `e5a60a9`
2. **Task 2: Responsive progressive article ToC** — `4e5f09d`

## Files Created/Modified

- `apps/api/src/content/markdown.ts` — heading text extraction, stable ID allocation, permalink HAST, and safe HTML/ToC result.
- `packages/contracts/src/public-posts.ts` and `apps/api/src/routes/public-posts.ts` — strict public ToC wire contract.
- `apps/web/app/_components/ArticleToc.tsx` and `posts/[slug]/page.tsx` — SSR directory presentation around the existing HTML boundary.
- `apps/web/app/public.module.css` — responsive grid, sticky/native directory states, scroll margin, and focus-visible permalink styling.
- `apps/api/test/markdown-renderer.test.ts`, `public-visibility.test.ts`, and `apps/web/e2e/article-toc.spec.ts` — safety, DTO, viewport, keyboard, empty-state, and no-JavaScript proof.

## Decisions Made

- Anchor IDs are an API-owned publishing contract: NFKC normalization, Unicode letters/numbers, punctuation collapse, `section` fallback, and document-global collision avoidance are fixed before browser rendering.
- The browser receives one ordered ToC DTO and never parses Markdown or HTML to reconstruct headings; CSS selects the semantic desktop nav or native narrow details.

## Deviations from Plan

None. The first isolated browser attempt used a Next build with the default API rewrite; rebuilding the disposable preview with its 3201 origin corrected the environment without changing product behavior.

## Verification

- Markdown renderer: 4/4 passed, including repeated multilingual, collision, punctuation, nested-inline, and hostile headings.
- Public article PostgreSQL integration: 2/2 passed; preview and About/archive renderer regressions: 2/2 passed.
- Isolated production-build Playwright at 3200/3201: 1/1 passed across 375, 768, 1280, keyboard and JavaScript-disabled states.
- Workspace typecheck/build, contracts tests, UI safety gate, and schema drift gate: passed.

## Issues Encountered

No product blocker. No cloud server was contacted, and the existing 3100 preview was not stopped.

## Next Phase Readiness

Ready for Phase 02 Plan 04: validated same-origin media upload and Markdown insertion.

---
*Phase: 02-complete-reading-experience*
*Completed: 2026-08-08*
