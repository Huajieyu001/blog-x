---
phase: 03-distribution-and-portability
plan: "02"
subsystem: web, testing
tags: [nextjs, metadata, seo, sitemap, robots, playwright, docker]
requires:
  - phase: 03-01
    provides: strict public distribution DTO, same-origin RSS, and generated local verifier topology
provides:
  - complete route-family metadata with one exact canonical pagination policy
  - publication-only Next robots.txt and sitemap.xml
  - fail-closed managed browser evidence for metadata and discovery
affects: [03-03, 03-04]
actuals:
  tasks: 3
  commits: 8
tech-stack:
  added: []
  patterns: [shared metadata composition, strict public DTO metadata, generated-origin browser verification, Docker cache-safe build arguments]
key-files:
  created: [apps/web/app/robots.ts, apps/web/app/sitemap.ts, apps/web/e2e/phase3-distribution.spec.ts]
  modified: [apps/web/app/lib/site-metadata.ts, apps/web/app/layout.tsx, apps/web/app/posts/[slug]/page.tsx, apps/web/Dockerfile, scripts/local-verify.mjs]
key-decisions:
  - "One canonical classifier makes only the query-free base, exact scalar page=1, and exact real pages 2..N indexable; every other shape is noindex,follow."
  - "Metadata, Sitemap, robots, and RSS use strict public DTO facts and validated PUBLIC_ORIGIN; internal API routing remains server-only."
  - "Playwright has a dedicated fail-closed result parser rather than being interpreted as TAP."
  - "Generated PUBLIC_ORIGIN is declared after pnpm's frozen dependency install in the Web Dockerfile so generated verifier ports preserve the dependency cache."
requirements-completed: [SEO-01, SEO-02, FEED-01]
coverage:
  - id: D1
    description: Every current public route family returns complete, unique metadata and applies exact pagination canonical/noindex policy.
    requirement: SEO-01
    verification:
      - kind: unit
        ref: apps/web/app/lib/site-metadata.test.ts
        status: pass
      - kind: integration
        ref: node scripts/local-verify.mjs --phase3-metadata
        status: pass
    human_judgment: false
  - id: D2
    description: Robots and Sitemap enumerate only indexable public routes, terms, pages, and published content.
    requirement: SEO-02
    verification:
      - kind: integration
        ref: apps/web/e2e/phase3-distribution.spec.ts
        status: pass
    human_judgment: false
  - id: D3
    description: RSS remains same-origin, discoverable through metadata, publication-only, and declares its RSS response media type.
    requirement: FEED-01
    verification:
      - kind: integration
        ref: apps/web/e2e/phase3-distribution.spec.ts
        status: pass
    human_judgment: false
duration: 1h 18m
completed: 2026-08-09
status: complete
---

# Phase 03 Plan 02: Public Metadata, Robots, and Sitemap Summary

**Every public Blog X route now has complete, strict metadata and public discovery files backed by a managed same-origin browser journey.**

## Performance

- **Duration:** 1h 18m
- **Completed:** 2026-08-09T05:39:19Z
- **Tasks:** 3
- **Files modified:** 19

## Accomplishments

- Added shared canonical/page metadata composition, root metadata defaults, and complete home, post, taxonomy, archives, and About metadata with strict not-found versus upstream-error behavior.
- Added Next-owned `robots.txt` and dynamic `sitemap.xml` derived solely from the strict publication-only distribution DTO and validated public origin.
- Expanded the generated one-worker Playwright journey to create real public fixtures through the admin UI and verify heads, canonical variants, robots, Sitemap, RSS, lifecycle secrecy, and same-origin browser traffic.
- Made the Web Docker dependency layer independent of each verifier's generated public origin and added a regression test for the cache order.

## Task Commits

1. **Task 1: Trace home and article data into rendered metadata** — `747a0f0`, `4008d57` (feature, verifier fix)
2. **Task 2: Expand exact metadata and pagination policy across taxonomy routes** — `07dc766`
3. **Task 3: Complete archives/About metadata and publication-only robots/Sitemap** — `8f203c1`, `9e5e4b0` (feature, journey coverage)
4. **Verification corrections and Docker cache repair** — `f1aeb22`, `8711575`, `e1af8d6`

## Verification

`node scripts/local-verify.mjs --phase3-metadata` exited 0 in the retained foreground session.

```text
[local-verify] blogxverify_e286c6ae4752 passed
[local-verify] all requested checks passed
```

## Deviations from Plan

### Auto-fixed Issues

1. **[Rule 2 - Required public fact]** Added `seoDescription` to the strict public post projection so article metadata can prefer the administrator-supplied SEO description without accessing private content.
2. **[Rule 1 - Verifier contract]** Added a Playwright-specific completion assertion: TAP rules apply only to Node semantic suites, while skipped or zero-test browser journeys still fail closed.
3. **[Rule 1 - Runtime normalization]** Corrected exact browser expectations for Next's normalized root Sitemap URL (`/`) and the RSS handler's `application/rss+xml; charset=utf-8` response media type.
4. **[Rule 3 - Local build reliability]** Moved generated `PUBLIC_ORIGIN` after the frozen dependency-install Docker layer and added a cache-order test. Before this correction, one local verifier Docker build invalidated that layer, contacted `registry.npmjs.org` while attempting to download the already-locked dependencies, and timed out. This was the only unintended external contact; neither cloud server nor any production host, CDN, deployment target, or Git remote was contacted during execution.

**Impact:** All changes stay within the metadata/discovery verifier boundary; no dependencies were added.

## Next Phase Readiness

03-03 can now consolidate Phase 3's full local acceptance around the already generated same-origin verifier topology.

---
*Phase: 03-distribution-and-portability*
*Completed: 2026-08-09*
