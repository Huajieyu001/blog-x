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
  - Existing 16-01 authority implementation already satisfies SITE-01; add regression coverage instead of rewriting it.
metrics:
  duration: "~12m"
  completed: 2026-09-22
status: complete
actuals:
  tokens: 1200
  tasks: 2
  commits: 2
---

# Phase 16 Plan 01: Site Identity Delivery Audit Summary

Audited the existing strict site-settings authority and added API/browser regressions proving an authenticated update reaches a fresh public page while the ICP footer remains immutable.

## Completed Tasks

1. Extended disposable-DB API coverage for anonymous and cross-origin rejection, non-JSON rejection, strict registration-field rejection, no-store public projection, stale writes, failed media persistence, and content-free audit metadata.
2. Extended the generated browser scenario to save a unique site identity, then verify a fresh public route's brand, title, description, public info, fixed MIIT link, and overflow behavior at 390px and 1280px.

## Audit Result

The existing `798f367`/`f96a433` implementation already enforces the SITE-01 authority boundary: only name, description, and publicInfo are mutable; API routes require session plus same-origin JSON input; repository writes serialize and version-check updates; public and admin projections strictly preserve the fixed ICP literals; and audit metadata contains changed field names only. No product-code correction was required.

## Verification

- Passed: `corepack pnpm --filter @blog-x/api test -- site-settings.test.ts` (package baseline tests)
- Skipped as designed: `corepack pnpm --filter @blog-x/api exec tsx --test test/site-settings.test.ts` — `AUTH_TEST_DATABASE_URL` was not supplied for a disposable migrated database.
- Passed: `corepack pnpm --filter @blog-x/api typecheck`
- Passed: `corepack pnpm --filter @blog-x/web typecheck`
- Passed: `PUBLIC_ORIGIN=http://127.0.0.1:3100 corepack pnpm --filter @blog-x/web build`
- Not run: `/tmp/blog-x-auth-e2e-run.sh` is absent; no replacement server or broad harness was created.

## Deviations from Plan

None in product behavior. The environment-provided disposable database and sealed authenticated browser harness were unavailable, so their focused tests remain ready for the generated delivery fixture rather than being simulated locally.

## Commits

- `bea3711` — `test(16-01): cover site identity public projection`
- `5508a39` — `test(16-01): cover site identity public delivery`

## Self-Check: PASSED

Both scoped test files and the two commits exist; `git diff --check` passed after the production build's generated `next-env.d.ts` change was restored.
