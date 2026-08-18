---
phase: 07-responsive-discovery-experience
plan: "01"
subsystem: ui
tags: [nextjs, react, playwright, search, ssr, responsive]

requires:
  - phase: 06-public-discovery-data
    provides: strict public search contracts and published-only API semantics
provides:
  - Shared labelled native GET search form in desktop and compact public navigation
  - Strict server-only public search adapter and minimum SSR search result route
  - Generated-port Chromium tracer covering same-origin, no-JavaScript and malformed-response behavior
affects: [07-02-search-states, 07-03-related-reading, 08-reliable-local-delivery]

actuals:
  tokens: 6219
  tasks: 1
  commits: 1

tech-stack:
  added: []
  patterns:
    - strict server-only adapter over the existing getPublic transport
    - isolated generated-port Next browser fixture with exact child and temporary-root cleanup

key-files:
  created:
    - apps/web/app/_components/SearchForm.tsx
    - apps/web/app/search/page.tsx
    - apps/web/e2e/public-discovery-fixture.ts
    - apps/web/e2e/public-discovery.spec.ts
    - scripts/phase7-browser-verify.mjs
  modified:
    - apps/web/app/lib/api.ts
    - apps/web/app/_components/PublicHeader.tsx
    - apps/web/app/public.module.css

key-decisions:
  - "Keep search as a native GET document navigation with no client fetch or live-search authority."
  - "Run the generated-port browser gate from an isolated temporary Web root so the fixed 3100 preview remains untouched."
  - "Treat every non-successful or malformed strict API outcome as one opaque visitor-safe recovery state."

patterns-established:
  - "Shared search form: one stateless labelled form supplies header and page search while compact tab exclusion is passed explicitly."
  - "Browser topology proof: every HTTP(S) browser request must remain on the generated Web origin; the fixture origin is server-only."

requirements-completed: [SRCH-01, SRCH-02]

coverage:
  - id: D1
    description: "Visitors can submit 中文 & React from the ordered public header and receive one strict published result through SSR."
    requirement: SRCH-01
    verification:
      - kind: automated_ui
        ref: "apps/web/e2e/public-discovery.spec.ts#desktop search tracer"
        status: pass
    human_judgment: false
  - id: D2
    description: "Search parsing fails closed for an incomplete result and browser traffic never reaches or exposes the internal fixture origin."
    requirement: SRCH-02
    verification:
      - kind: e2e
        ref: "node scripts/phase7-browser-verify.mjs --grep desktop search tracer"
        status: pass
    human_judgment: false
  - id: D3
    description: "The compact form remains usable without JavaScript, excludes closed controls from tab order, and avoids horizontal overflow."
    requirement: SRCH-01
    verification:
      - kind: automated_ui
        ref: "apps/web/e2e/public-discovery.spec.ts#desktop search tracer compact and no-JavaScript assertions"
        status: pass
    human_judgment: false

duration: 16min
completed: 2026-08-18
status: complete
---

# Phase 7 Plan 01: Real Search Tracer Summary

**A shared native GET form now reaches a strict server-rendered public result through a same-origin, responsive, no-JavaScript-capable path.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-08-18T15:48:00Z
- **Completed:** 2026-08-18T16:04:00Z
- **Tasks:** 1
- **Files modified:** 8

## Accomplishments

- Added the visible public-header search form in the required five-links, search, 管理 order while retaining compact-menu focus and tab behavior.
- Added a strict server-only search adapter and minimum `/search` SSR route for populated, empty and opaque failure outcomes.
- Added a random-loopback Chromium tracer proving native submission, no live request while typing, strict projection, same-origin isolation, compact layout and no-JavaScript use.

## Task Commits

Each task was committed atomically:

1. **Task 1: Deliver a real header-to-result search tracer** - `15b4aec` (feat)

## Files Created/Modified

- `apps/web/app/_components/SearchForm.tsx` - Shared visible-label native GET search form.
- `apps/web/app/_components/PublicHeader.tsx` - Places search between the five public links and 管理 with compact tab exclusion.
- `apps/web/app/lib/api.ts` - Strict `getPublicSearch` adapter using the existing server-only transport.
- `apps/web/app/search/page.tsx` - Minimal SSR search route with strict result and recovery rendering.
- `apps/web/app/public.module.css` - Existing-token responsive form, state and compact-card styling.
- `apps/web/e2e/public-discovery-fixture.ts` - Finite loopback public discovery fixture.
- `apps/web/e2e/public-discovery.spec.ts` - Focused real-browser discovery tracer.
- `scripts/phase7-browser-verify.mjs` - Generated-port isolated Web/fixture/Playwright runner with exact cleanup.

## Decisions Made

- Kept the browser interaction as a native document navigation; no Client Component fetch, autocomplete or second collection authority was introduced.
- Isolated verification in a generated temporary Web root so the user-visible 3100 dev server keeps running and its `.next/dev/lock` is never disturbed.
- Reused strict public DTO parsing before rendering any card, mapping malformed data to approved opaque recovery copy.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Isolated the browser runner from the active fixed preview**

- **Found during:** Task 1 RED verification
- **Issue:** The inherited RED runner started a second `next dev` in `apps/web`, which collided with the active 3100 preview's `.next/dev/lock` and produced an infrastructure failure instead of a behavioral RED.
- **Fix:** Created a generated temporary Web root containing copied application sources and linked installed dependencies, then cleaned that exact root in `finally`.
- **Files modified:** `scripts/phase7-browser-verify.mjs`
- **Verification:** Focused RED reached the missing-form assertion; GREEN and `--force-failure` runs left no Phase 7 children or temporary roots.
- **Committed in:** `15b4aec`

**2. [Rule 3 - Blocking] Added the strict homepage response required by the tracer journey**

- **Found during:** Task 1 RED verification
- **Issue:** The discovery fixture handled search only, while the journey intentionally starts at `/`; homepage strict parsing therefore failed before the missing search seam could be exercised.
- **Fix:** Added a finite valid empty `/public/articles?page=1` response to the same loopback fixture.
- **Files modified:** `apps/web/e2e/public-discovery-fixture.ts`
- **Verification:** RED failed only at the absent header form; GREEN completed the full Chromium journey.
- **Committed in:** `15b4aec`

---

**Total deviations:** 2 auto-fixed (2 blocking test-harness corrections). **Impact on plan:** Both changes were required to obtain honest RED/GREEN evidence without stopping or mutating the user's fixed local preview; feature scope and topology boundaries were unchanged.

## Issues Encountered

- The first sandboxed RED attempt could not bind loopback ports (`EPERM`); the repository-scoped Phase 7 runner permission was then used.
- The two inherited RED harness gaps above were corrected before product implementation, after which the intended missing-form RED was observed.

## User Setup Required

None - no external service configuration required.

## Verification

- `node scripts/phase7-browser-verify.mjs --grep "desktop search tracer"` — PASS, 1/1 Chromium test.
- `corepack pnpm --filter @blog-x/web typecheck` — PASS.
- `node scripts/phase7-browser-verify.mjs --force-failure` — expected exit 1 after healthy children; exact cleanup verified.
- `git diff --check` — PASS.

## Self-Check: PASSED

- All eight planned production/test artifacts exist in commit `15b4aec`.
- The named tracer, typecheck, acceptance assertions, forced-failure cleanup and boundary scans passed.
- No Docker, server, deployment, credential, dependency, database, API route or fixed-port change was introduced.

## Next Phase Readiness

- The vertical search acceptance spine is ready for Plan 07-02 to become the complete request/state/SEO/pagination authority.
- No blocker remains; the production release gate and both cloud servers were untouched.

---
*Phase: 07-responsive-discovery-experience*
*Completed: 2026-08-18*
