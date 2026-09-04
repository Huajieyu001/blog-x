---
phase: 09-public-article-structured-data
plan: "01"
subsystem: web-seo
tags: [nextjs, json-ld, schema-org, playwright, security]
requires:
  - phase: 08-reliable-local-delivery
    provides: fixed local delivery contract and generated browser verification harness
provides:
  - Strict seven-field Schema.org BlogPosting builder and raw-script serializer
  - Article-only SSR JSON-LD emission from four explicit validated public values
  - Executable parity, privacy, injection, malformed-response, and lifecycle coverage
affects: [public-reading, local-delivery, scheduled-publishing]
actuals:
  tokens: 3882
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns:
    - Narrow public DTO projection before crawler serialization
    - Native server-rendered JSON-LD with raw-text escaping
key-files:
  created: []
  modified:
    - apps/web/app/lib/site-metadata.ts
    - apps/web/app/posts/[slug]/page.tsx
    - apps/web/e2e/public-discovery.spec.ts
    - apps/web/e2e/public-reading.spec.ts
key-decisions:
  - "BlogPosting accepts only title, summary, slug, and publishedAt; optional schema data remains absent without an approved source."
  - "Both crawler URL properties share publicUrl over the encoded canonical post path."
patterns-established:
  - "Serialize JSON-LD exactly once, then escape raw <, U+2028, and U+2029 before native script embedding."
requirements-completed: [SEO-03, SEO-04, SEO-05]
coverage:
  - id: D1
    description: Strict public BlogPosting output matches reader-visible facts and the canonical URL.
    requirement: SEO-03
    verification:
      - kind: unit
        ref: apps/web/app/lib/site-metadata.test.ts#BlogPosting uses only four public facts and the exact canonical seven-key shape
        status: pass
      - kind: e2e
        ref: apps/web/e2e/public-discovery.spec.ts#published article emits strict BlogPosting
        status: pass
    human_judgment: false
  - id: D2
    description: JSON-LD has a four-field input boundary and never serializes non-approved public-detail fields.
    requirement: SEO-04
    verification:
      - kind: unit
        ref: apps/web/app/lib/site-metadata.test.ts#BlogPosting uses only four public facts and the exact canonical seven-key shape
        status: pass
      - kind: e2e
        ref: apps/web/e2e/public-discovery.spec.ts#hostile and non-article JSON-LD boundaries
        status: pass
    human_judgment: false
  - id: D3
    description: Hostile values stay inert and non-public, malformed, and non-article routes emit no BlogPosting.
    requirement: SEO-05
    verification:
      - kind: unit
        ref: apps/web/app/lib/site-metadata.test.ts#BlogPosting serialization is inert raw script text and round-trips all public values
        status: pass
      - kind: e2e
        ref: apps/web/e2e/public-discovery.spec.ts#hostile and non-article JSON-LD boundaries
        status: pass
      - kind: integration
        ref: apps/web/e2e/public-reading.spec.ts#published permalink is a safe focused technical reading surface and every unavailable state is one 404
        status: unknown
    human_judgment: true
    rationale: Final fixed local-delivery integration is intentionally owned by the orchestrator and has not run in this executor.
duration: 6min
completed: 2026-09-04
status: complete
---

# Phase 09 Plan 01: Public Article Structured Data Summary

**Published articles now expose one exact, safe seven-field BlogPosting record that is built from reader-visible public facts and stays absent outside a validated article route.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-09-04T12:39:08Z
- **Completed:** 2026-09-04T12:44:46Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added a four-field BlogPosting builder and one-pass raw-text serializer that shares the existing encoded same-origin canonical path authority.
- Rendered one native JSON-LD script only after the public article `ok` guard, with unit and generated-browser proof of exact shape and reader parity.
- Added hostile, malformed, non-article, and real lifecycle regression coverage for script injection, private-field exclusion, and zero-output reachability.

## Task Commits

1. **Task 1: Emit one strict public BlogPosting through the real article SSR path** — `a970993` (feat)
2. **Task 2: Prove hostile serialization and zero output on every non-public route class** — `07427ec` (test)

## Files Created/Modified

- `apps/web/app/lib/site-metadata.ts` — Narrow public BlogPosting builder and inert JSON-LD raw-text serializer.
- `apps/web/app/lib/site-metadata.test.ts` — Exact key, URL, privacy, escape, and parse-round-trip tests.
- `apps/web/app/posts/[slug]/page.tsx` — Valid-result-only native JSON-LD emission and stable visible summary hook.
- `apps/web/e2e/public-discovery-fixture.ts` — Strict hostile and deliberately malformed finite article responses.
- `apps/web/e2e/public-discovery.spec.ts` — Generated SSR parity and hostile/non-article boundary tests.
- `apps/web/e2e/public-reading.spec.ts` — Real lifecycle positive parity and unavailable-route zero-script assertions.

## Decisions Made

- Kept the crawler contract deliberately minimal: no author, publisher, image, cover, taxonomy, SEO-only description, Markdown, HTML, or administrative fields are inferred or serialized.
- Used the full isolated Phase 7 suite because its current fixed runner intentionally rejects obsolete `--grep` arguments; the complete 17-test suite contains both named focused cases.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test selector] Added an explicit stable summary class and selected the primary article time.**
- **Found during:** Task 1 browser verification.
- **Issue:** CSS module hashing hid the planned `.articleSummary` selector, and related-card times made `article time` non-unique.
- **Fix:** Preserved the CSS module class while adding the explicit summary hook and asserted the first primary article `time[datetime]`.
- **Files modified:** `apps/web/app/posts/[slug]/page.tsx`, `apps/web/e2e/public-discovery.spec.ts`.
- **Verification:** Full generated Phase 7 browser suite passed 16/16 before Task 2 expansion.
- **Committed in:** `a970993`.

---

**Total deviations:** 1 auto-fixed (1 Rule 1 test selector correction).
**Impact on plan:** The change preserves the visible interface while making the required parity proof deterministic.

## Issues Encountered

- The plan's historical focused `--grep` runner invocation is no longer supported by the sealed Phase 7 runner. Running the complete generated suite is stricter and verified both new focused tests without changing runner ownership.
- The pre-existing state document used an unparseable `Plan: 0 of TBD` value for `state.advance-plan`; the minimal state fields were reconciled to show the completed implementation tasks and the remaining local-delivery gate.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The implementation tasks and isolated checks are complete.
- The orchestrator must run the one final fixed `corepack pnpm local:deliver` gate, which executes the real publication-lifecycle integration test, refreshes `3100`, records revision-bound evidence, and must remain `RELEASE BLOCKED`.

## Self-Check: PASSED

- Required implementation and test files exist in the committed task history.
- Task commits `a970993` and `07427ec` are present on `dev`.

---
*Phase: 09-public-article-structured-data*
*Completed: 2026-09-04*
