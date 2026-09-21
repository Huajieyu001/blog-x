---
phase: 16
plan: "03"
subsystem: revision-recovery
tags: [revisions, retention, restore, aliases, audit]
dependency_graph:
  requires: [16-02-direct-slug-aliases]
  provides: [bounded-revision-recovery-regressions]
  affects: [admin-article-editor, private-revision-api]
tech_stack:
  added: []
  patterns: [row-lock-cas, bounded-server-history, content-free-audit]
key_files:
  created: []
  modified:
    - apps/api/test/article-revisions.test.ts
    - apps/web/e2e/article-revisions.spec.ts
decisions:
  - Existing revision authority was retained after audit; only missing recovery regressions were added.
metrics:
  tasks: 2
  commits: 1
status: complete
---

# Phase 16 Plan 03: Bounded Revision Recovery Audit Summary

Audited existing CONT-10 authority and added focused regressions for bounded retention, version-guarded recovery, direct aliases, audit rollback, and accessible client error recovery without changing runtime behavior.

## Completed Tasks

1. Added disposable PostgreSQL coverage for 21 material revisions capped at 20, content-free summary shape, cross-article rejection, concurrent stale-writer convergence, malformed snapshot rejection, failed-audit rollback, draft-only restoration, and direct old-slug resolution after an explicit republish.
2. Added generated-browser assertions that no historic Markdown appears before selection, the bounded count is visible, and stale plus generic network failures return focus to the restore trigger.

## Audit Result

The existing repository/service/route implementation already meets CONT-10: row-lock version comparison precedes snapshot/update, retention deletes older rows in the same transaction, selected revisions are article-scoped, restores snapshot displaced content then clear publication/schedule authority to draft, aliases remain identity-to-current-slug, and the audit event holds only revision id/status/changed fields. No product source changed, so no fixed-preview refresh was warranted.

## Verification

- Passed: `corepack pnpm --filter @blog-x/api typecheck`
- Passed: direct `tsx --test test/article-revisions.test.ts test/article-slug-redirects.test.ts` load; 4 static checks passed and 3 disposable-PostgreSQL cases skipped because `LIFECYCLE_TEST_DATABASE_URL` is absent.
- Passed: `corepack pnpm --filter @blog-x/web typecheck`
- Passed: `PUBLIC_ORIGIN=http://127.0.0.1:3100 corepack pnpm --filter @blog-x/web build`
- Passed: `node scripts/check-boundaries.mjs` (`702` files, `0` findings)
- Passed: Playwright list/spec-load with generated-fixture variable names.
- Passed after root integration: canonical generated database/browser gate 97/97, including five revision API tests and the revision browser scenario.
- Formal fixed-preview delivery passed 114/114 at `231f97c6fb40ef49b4142c73d2812acda9ec0d69`; it was warranted by the Phase 16 site-identity product fix.

## Deviations from Plan

The required disposable database and sealed browser runner are unavailable locally, so their tests remain ready for root's canonical generated integration rather than being simulated. This is an environment limitation, not a product deviation.

## Commits

- `77df692` — `test(16-03): cover bounded revision recovery`
- `97a0cfb` — `test(16-03): cover revision recovery errors`
- `871a012`, `24b4a49` — correct generated version-authority and rollback assertions found by the canonical gate.

## Self-Check: PASSED

The scoped API commit exists; the scoped browser spec and this summary exist, `git diff --check` passed, and the build-only `next-env.d.ts` rewrite was restored.
