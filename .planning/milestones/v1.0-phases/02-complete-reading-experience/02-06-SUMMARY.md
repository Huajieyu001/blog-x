---
phase: 02-complete-reading-experience
plan: "06"
subsystem: phase-acceptance
tags: [postgresql, playwright, responsive, security-boundaries, migrations, media]
requires:
  - phase: 02-complete-reading-experience
    provides: taxonomy, About/archive, ToC, media, responsive shell and recovery from Plans 02-01 through 02-05
provides:
  - canonical isolated Phase 2 verification with migration/data-preservation and bounded media cleanup gates
  - cross-boundary public confidentiality and final database-constraint regression
  - one visible administrator-to-reader journey with 375, 768 and 1280 viewport evidence
affects: [03-distribution-and-portability, 04-secure-operations-and-release-gate, local-development]
actuals:
  tasks: 2
  files: 10
tech-stack:
  added: []
  patterns: [generated exact media volume ownership, migration retry sentinel, published-only composition regression, launcher-only local failure fixture]
key-files:
  created: [apps/api/test/phase2-public-visibility.test.ts, apps/web/e2e/phase2-reading.spec.ts, .planning/phases/02-complete-reading-experience/02-VERIFICATION.md]
  modified: [scripts/local-verify.mjs, scripts/local-verify.test.mjs, scripts/check-boundaries.mjs, README.md]
key-decisions:
  - "Phase 2 acceptance owns a generated Compose/database namespace and validates the exact media volume before bounded project cleanup."
  - "A retained draft sentinel must survive two concurrent migration retries before feature suites may run."
  - "The complete browser journey mutates content through visible UI and same-origin /api only; upstream failures use a separate loopback-only process fixture."
requirements-completed: [READ-03, READ-04, READ-05, READ-06, READ-07, TAXO-01, MEDIA-01]
completed: 2026-08-09
status: complete
---

# Phase 02 Plan 06: Reproducible Complete Reading Acceptance Summary

**Phase 2 now has one local command proving taxonomy, pages, archives, durable ToC, protected media, responsive navigation/theme and honest recovery as a single experience.**

## Accomplishments

- Extended `local:verify` to inspect all eight business tables, six migration ledger entries, final checks/unique indexes, exact generated media volume identity and preservation of an existing article across concurrent migration retries.
- Added independent all-state confidentiality coverage for public article/taxonomy/archive/About responses, PostgreSQL uniqueness/FK/join enforcement, stable duplicate heading anchors and exact local media URL sanitization.
- Added one Chromium workflow that visibly creates and edits taxonomy, uploads and inserts a derivative image, publishes an associated article and About page, then visits every discovery surface, theme/mobile navigation, durable ToC and distinct invalid/empty/404 states.
- Captured supplemental screenshots at 375×812, 768×1024 and 1280×900 while semantically asserting no document-level horizontal overflow and same-origin browser/media requests.
- Wired a loopback-only unavailable-response fixture into canonical acceptance and expanded the boundary gate to reject browser filesystem/media processing, storage key leakage, cloud addresses and frozen-host commands.
- Updated local documentation with the canonical Phase 2 command and explicit zero-server/zero-CDN policy.

## Verification

- `corepack pnpm local:verify -- --phase2-full` — passed.
- Operations safety fixtures — 4/4 passed.
- Phase 2 composition regression — 2/2 passed against migrated PostgreSQL.
- Whole Phase 2 browser journey — 1/1 passed.
- Failure/retry browser journey — 2/2 passed.
- Recursive typecheck/build, schema verification, boundary scan and all included API suites — passed.

## Deviations and fixes

- The exact media-volume inspection originally ran after PostgreSQL-only startup, before Compose had created the API volume. It was moved after API/Web startup without weakening name validation or cleanup bounds.
- PostgreSQL correctly rejected associated deletes, but one assertion inspected a library-wrapped error code. The regression now asserts the direct parameterized SQL `RESTRICT` failure, keeping the database—not UI behavior—as authority.
- The first browser run found two accessible card links containing the title. The semantic locator was narrowed to the exact title link; application behavior was unchanged.

## Safety

No cloud server, CDN or external service was contacted. Failed and successful verification namespaces were removed with their generated containers, networks and test-only volumes.

## Next phase readiness

Phase 2 is complete. Phase 3 can add SEO, Sitemap/RSS and portable export on top of the now-verified published-only discovery and media contracts. Both servers remain outside the development execution path.
