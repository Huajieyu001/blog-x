---
phase: 16-site-identity-link-continuity-and-revision-history
plan: "01"
subsystem: site-identity
tags: [site-settings, icp, public-metadata, security]
requires:
  - phase: 15
    provides: hardened media-reference persistence and local delivery contracts
provides:
  - regression coverage for strict site identity mutation and public projection
  - browser proof for saved identity propagation at mobile and desktop widths
affects: [api-site-settings, public-layout, admin-settings]
tech-stack:
  added: []
  patterns: [strict-contract-projection, same-origin-admin-mutation, fixed-icp-literal]
key-files:
  created: []
  modified:
    - apps/api/test/site-settings.test.ts
    - apps/web/e2e/admin-analytics.spec.ts
decisions:
  - Persisted public settings must be explicitly projected into the strict public schema; database-row metadata is never spread into a response.
metrics:
  duration: "~12m"
  completed: 2026-09-22
status: complete
actuals:
  tokens: 1200
  tasks: 2
  commits: 7
---

# Phase 16 Plan 01: Site Identity Delivery Audit Summary

Audited the existing strict site-settings authority and added API/browser regressions proving an authenticated update reaches a fresh public page while the ICP footer remains immutable.

## Completed Tasks

1. Extended disposable-DB API coverage for anonymous and cross-origin rejection, non-JSON rejection, strict registration-field rejection, no-store public projection, stale writes, failed media persistence, and content-free audit metadata.
2. Extended the generated browser scenario to save a unique site identity, then verify a fresh public route's brand, title, description, public info, fixed MIIT link, and overflow behavior at 390px and 1280px.

## Audit Result

The generated database test exposed one real product defect: after the first settings save, the public service spread the complete database row into a strict response schema and returned 500 because internal row fields were present. Commit `e437975` replaced that spread with an explicit public projection; only name, description and publicInfo come from storage, while ICP values remain fixed literals.

## Verification

- Passed: `corepack pnpm --filter @blog-x/api test -- site-settings.test.ts` (package baseline tests)
- Skipped as designed: `corepack pnpm --filter @blog-x/api exec tsx --test test/site-settings.test.ts` — `AUTH_TEST_DATABASE_URL` was not supplied for a disposable migrated database.
- Passed: `corepack pnpm --filter @blog-x/api typecheck`
- Passed: `corepack pnpm --filter @blog-x/web typecheck`
- Passed: `PUBLIC_ORIGIN=http://127.0.0.1:3100 corepack pnpm --filter @blog-x/web build`
- Passed after root integration: canonical generated database/browser gate 97/97 and formal local delivery 114/114 at `231f97c6fb40ef49b4142c73d2812acda9ec0d69`.

## Deviations from Plan

Root verification corrected the public projection defect, two test-fixture authority errors, and a shared-suite request/isolation issue without relaxing rate limits or response schemas.

## Commits

- `bea3711` — `test(16-01): cover site identity public projection`
- `5508a39` — `test(16-01): cover site identity public delivery`
- `e437975` — `fix(16-01): project persisted public site identity`
- `e20f851`, `b5a3305`, `231f97c` — stabilize and isolate the generated browser proof.

## Self-Check: PASSED

Both scoped test files and the two commits exist; `git diff --check` passed after the production build's generated `next-env.d.ts` change was restored.
