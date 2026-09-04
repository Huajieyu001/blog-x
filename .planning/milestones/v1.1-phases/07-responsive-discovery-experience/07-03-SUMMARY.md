---
phase: 07-responsive-discovery-experience
plan: "03"
subsystem: ui
tags: [nextjs, react, playwright, responsive, accessibility, related-reading]

requires:
  - phase: 07-responsive-discovery-experience
    plan: "02"
    provides: strict search outcomes, compact public cards, stable pagination and generated-port browser runner
provides:
  - Strict source-excluding related reading with hidden zero and article-retaining recovery states
  - One responsive discovery information order across 375px, 768px and 1280px
  - Focused Chromium proof for 44px targets, keyboard menus, themes, no-JavaScript and same-origin behavior
affects: [07-04-browser-gate, 08-reliable-local-delivery]

actuals:
  tokens: 6459
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - secondary related data is resolved only after primary article success and never owns the article outcome
    - one compact PublicPostListItem renderer preserves API order across search and related layouts
    - focused responsive browser tests execute from generated loopback origins with exact-child cleanup

key-files:
  created: []
  modified:
    - apps/web/app/lib/api.ts
    - apps/web/app/posts/[slug]/page.tsx
    - apps/web/app/public.module.css
    - apps/web/e2e/public-discovery-fixture.ts
    - apps/web/e2e/public-discovery.spec.ts

key-decisions:
  - "Filter source and duplicate related slugs while preserving the first occurrence and exact API order."
  - "Keep related failure local after primary article success so strict empty and failed outcomes remain distinct."
  - "Use only the existing 700px and 1023px responsive authorities while retaining one DOM and information order."

patterns-established:
  - "Related isolation: primary success is authoritative; secondary HTTP or schema failure renders subordinate recovery."
  - "Responsive proof: exact viewport geometry, target size, focus, theme and no-JavaScript behavior ship with implementation."

requirements-completed: [SRCH-01, SRCH-02, READ-08, READ-09]

coverage:
  - id: D1
    description: "Strict one-to-four related cards preserve API order, exclude the source and duplicates, follow the article body, and expose only the shared public projection."
    requirement: READ-08
    verification:
      - kind: automated_ui
        ref: "apps/web/e2e/public-discovery.spec.ts#related populated zero and failure"
        status: pass
      - kind: integration
        ref: "corepack pnpm --filter @blog-x/web typecheck and node scripts/check-boundaries.mjs"
        status: pass
    human_judgment: false
  - id: D2
    description: "True zero hides the entire related region while HTTP and malformed responses preserve the article, permalink and a distinct local recovery path."
    requirement: READ-09
    verification:
      - kind: automated_ui
        ref: "node scripts/phase7-browser-verify.mjs --grep related populated zero and failure (4/4)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Search and related discovery retain one field order with zero horizontal overflow and one, natural tablet, or two related columns at 375px, 768px and 1280px."
    requirement: READ-09
    verification:
      - kind: automated_ui
        ref: "apps/web/e2e/public-discovery.spec.ts#responsive discovery implementation viewport geometry"
        status: pass
    human_judgment: false
  - id: D4
    description: "Compact menu tab exclusion, Enter and click submission, Escape focus restoration, 44px controls, visible focus, themes, no-JavaScript navigation and same-origin requests are executable browser assertions."
    requirement: SRCH-02
    verification:
      - kind: automated_ui
        ref: "node scripts/phase7-browser-verify.mjs --grep responsive discovery implementation (3/3)"
        status: pass
      - kind: integration
        ref: "node scripts/check-boundaries.mjs (384 files, 0 findings)"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-08-19
status: complete
---

# Phase 7 Plan 03: Related Reading and Responsive Discovery Summary

**Strict related reading now follows complete articles with honest zero/failure states, while one responsive discovery surface is proven across mobile, tablet and desktop interaction modes.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-08-19T11:57:45Z
- **Completed:** 2026-08-19T12:05:32Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added a strict server-only related adapter and article-local composition that preserves API order, filters the source and duplicates, caps through the shared contract, hides true zero, and retains the full article across HTTP or malformed failures.
- Added a responsive related grid using the existing 700px/1023px authorities and kept the same compact public-card information order across search and article layouts.
- Added focused real-Chromium evidence for 375/768/1280 geometry, long-text wrapping, 44px controls, keyboard menu behavior, visible focus, light/dark/system themes, no-JavaScript submission and same-origin requests.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add related cards with RED/GREEN proof for populated, zero and failure** - `cd8ece5` (feat)
2. **Task 2: Complete responsive discovery with focused 375/768/1280 interaction proof** - `f269b53` (feat)

## Files Created/Modified

- `apps/web/app/lib/api.ts` - exports the strict `getPublicRelatedPosts` server adapter.
- `apps/web/app/posts/[slug]/page.tsx` - composes source-excluding ordered related cards and article-retaining local recovery.
- `apps/web/app/public.module.css` - adds related grid/recovery surfaces and exact 2px/4px visible focus using existing theme and breakpoint authorities.
- `apps/web/e2e/public-discovery-fixture.ts` - provides finite strict related and responsive long-content/pagination scenarios.
- `apps/web/e2e/public-discovery.spec.ts` - proves related states and focused responsive interaction in real Chromium.

## Decisions Made

- Filter the source and duplicate slugs defensively in Web presentation while preserving the first occurrence and exact API order.
- Treat a strict empty related response as absent UI, but every HTTP or malformed outcome as local recovery after the primary article remains authoritative.
- Keep one DOM/information order and express device differences only with existing CSS variables and 700px/1023px layout authorities.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Automated Evidence

- `node scripts/phase7-browser-verify.mjs --grep "related populated zero and failure"` — PASS, 4/4 Chromium tests.
- `node scripts/phase7-browser-verify.mjs --grep "responsive discovery implementation"` — PASS, 3/3 Chromium tests.
- `corepack pnpm --filter @blog-x/web typecheck` — PASS.
- `node scripts/check-boundaries.mjs` — PASS, 384 tracked files and zero findings.
- `git diff --check` — PASS.

## Self-Check: PASSED

- All five key modified files exist, both task commits are present, and the worktree was clean before metadata close-out.
- Related order/source/privacy/empty/recovery assertions and responsive viewport/target/focus/theme/no-JavaScript/same-origin assertions passed independently.
- No dependency, API route, database/schema, Docker, server, deployment, fixed-3100 process, public IP or credential changed.

## Next Phase Readiness

- Plan 07-04 can extend the retained strict fixture/spec/runner into the independent full edge and privacy matrix.
- Plan 07-04 is ready to proceed; production and both cloud servers were untouched.

---
*Phase: 07-responsive-discovery-experience*
*Completed: 2026-08-19*
