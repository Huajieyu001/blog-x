---
phase: 02-complete-reading-experience
plan: "05"
subsystem: public-shell-theme-errors
tags: [nextjs, responsive, theme, accessibility, error-boundary, playwright]
requires:
  - phase: 02-complete-reading-experience
    provides: public article, taxonomy, archive, About and media surfaces
provides:
  - Shared responsive public navigation across all visitor pages
  - Allowlisted pre-paint light, dark and system theme preference
  - Strict absence versus upstream failure classification with safe retry UI
affects: [02-06, public-reading, release-verification]
actuals:
  tokens: 0
  tasks: 2
  commits: 1
tech-stack:
  added: []
  patterns: [discriminated public fetch outcomes, root pre-paint theme bootstrap, progressive mobile navigation, opaque recoverable error boundary]
key-files:
  created: [apps/web/app/_components/PublicHeader.tsx, apps/web/app/_components/ThemeControl.tsx, apps/web/app/_components/ServiceUnavailable.tsx, apps/web/app/error.tsx, apps/web/e2e/public-shell.spec.ts, apps/web/e2e/public-errors.spec.ts]
  modified: [apps/web/app/layout.tsx, apps/web/app/lib/api.ts, apps/web/app/public.module.css, apps/web/app/page.tsx, apps/web/app/posts/[slug]/page.tsx]
key-decisions:
  - "Public fetches return explicit ok/not_found/upstream_error outcomes; only a strict `{error:'not_found'}` 404 may invoke Next notFound()."
  - "Theme storage accepts only light, dark or system and resolves synchronously before paint; CSS OS fallback and public links remain usable without JavaScript."
  - "One client-aware public header owns active-route semantics and progressive compact navigation while remaining absent from login/admin surfaces."
requirements-completed: [READ-06, READ-07]
coverage:
  - id: D-13
    description: Allowlisted persisted pre-paint themes with OS, no-JavaScript and storage-failure fallback.
    requirement: READ-06
    verification:
      - kind: e2e
        ref: apps/web/e2e/public-shell.spec.ts
        status: pass
    human_judgment: false
  - id: D-14
    description: Ordered shared editorial navigation with active state, compact keyboard menu, Escape and focus return.
    requirement: READ-06
    verification:
      - kind: e2e
        ref: apps/web/e2e/public-shell.spec.ts
        status: pass
    human_judgment: false
  - id: D-15
    description: Valid API absence maps to true 404 while 500, refusal, malformed 2xx and malformed 404 use opaque recovery.
    requirement: READ-07
    verification:
      - kind: e2e
        ref: apps/web/e2e/public-errors.spec.ts
        status: pass
    human_judgment: false
  - id: D-16
    description: Public discovery, archive and recovery actions remain usable without page overflow at 375, 768 and 1280px.
    requirement: READ-06
    verification:
      - kind: e2e
        ref: apps/web/e2e/public-shell.spec.ts
        status: pass
    human_judgment: false
duration: 0min
completed: 2026-08-09
status: complete
---

# Phase 02 Plan 05: Responsive Public Shell and Recovery Summary

**Every public surface now shares an adaptive editorial navigation and pre-paint theme, while temporary upstream failures can no longer masquerade as missing content.**

## Accomplishments

- Added one ordered public header for articles, categories, tags, archive and About, with secondary management access, active-page semantics, a compact mobile menu, Escape/focus return and no-JavaScript navigation fallback.
- Added light, dark and system themes using semantic tokens, a synchronous allowlisted bootstrap, local preference persistence, live OS updates and safe behavior when storage or JavaScript is unavailable.
- Replaced nullable public fetches with strict result unions across every visitor page; only a validated API 404 reaches `notFound()`, while network/5xx/schema failures throw to a safe retry/home boundary.
- Normalized public pages and internal links, added responsive taxonomy/archive/recovery layouts, local code/table overflow and reduced-motion/focus behavior.

## Task Commits

1. **Tasks 1–2: Honest public outcomes, error recovery, theme and responsive shared navigation** — `17afea4`

## Decisions Made

- A 404 status alone is insufficient evidence of absence; its strict public error DTO must also parse before Next receives a not-found interrupt.
- Invalid stored theme text is replaced with `system` and is never interpolated into HTML, selectors or class names.
- Mobile navigation is progressively enhanced: JavaScript enables the closed-by-default menu, while no-JavaScript visitors retain visible public links.

## Deviations from Plan

- The local failure fixture must be available before its dedicated Web build and affected public index routes are explicitly force-dynamic. This keeps injected failures runtime-only and prevents build-time data capture.
- The in-app browser had no connected instance. Real Chromium Playwright checks supplied the required semantic, viewport and screenshot evidence instead.

## Verification

- Public shell journey: 1/1 passed, including 375×812, 768×1024 and 1280×900, long mixed CJK/Latin text, all actions, active links, no page overflow, mobile keyboard behavior, theme reload/system/storage failure and no-JavaScript fallback.
- Failure fixture journey: 2/2 passed for true route/API 404, 500, connection abort, malformed 200, malformed 404, opaque copy and successful retry recovery.
- Existing About/archive/taxonomy public regressions: 3/3 passed; administrator-only cases correctly skipped without disposable credentials.
- Workspace typecheck/build, contract tests, boundary audit, UI safety and drift gates: passed.
- Local `http://127.0.0.1:3100` returns 200 for home/categories and 404 for a confirmed missing article.

## Issues Encountered

The long-title viewport backstop initially detected horizontal overflow at 375px. Adding controlled anywhere wrapping to the display title resolved it and all three viewport checks passed. No cloud server was contacted.

## Next Phase Readiness

Ready for Phase 02 Plan 06: canonical local acceptance, security/UAT reconciliation and high-cost decision rollback gates.

---
*Phase: 02-complete-reading-experience*
*Completed: 2026-08-09*
