---
phase: 16
plan: "02"
subsystem: public-content-continuity
tags: [slug, redirect, canonical, browser]
dependency_graph:
  requires: [published-slug-alias-authority]
  provides: [public-route-redirect-evidence]
  affects: [public-article-pages, search-engine-continuity]
tech_stack:
  added: []
  patterns: [strict-upstream-location-parser, next-permanent-redirect]
key_files:
  created: []
  modified: [apps/web/e2e/article-lifecycle.spec.ts]
decisions:
  - "Keep existing direct persisted alias authority; add browser-route evidence instead of duplicating the redirect implementation."
metrics:
  tasks: 2
  commits: 1
status: complete
---

# Phase 16 Plan 02: Public Slug Continuity Audit Summary

Existing persisted aliases now have explicit lifecycle-browser proof that an old public URL emits one root-relative 308 to the current canonical article page.

## Completed Tasks

1. Audited API lifecycle authority: published-only alias lookup, identity-to-current-slug lookup, reservation, and strict internal redirect location parsing were already correct; no repository or schema change was needed.
2. Extended the lifecycle browser journey to assert the public `/posts/<old>` 308 location, current article heading, and final canonical link. Commit: `2a7332f`.

## Verification

- `corepack pnpm --filter @blog-x/api test -- article-slug-redirects.test.ts article-lifecycle.test.ts` — passed (the package script ran its configured focused API suite; disposable lifecycle database tests remain environment-gated).
- `corepack pnpm --filter @blog-x/api typecheck` — passed.
- `corepack pnpm --filter @blog-x/web typecheck` — passed.
- `node scripts/check-boundaries.mjs` — passed (`700` files, `0` findings).

## Unrun Browser Gate

`/tmp/blog-x-lifecycle-e2e-run.sh` was absent. No directly applicable sealed generated harness was available, so the new browser assertion was typechecked but not executed; no broad server, refresh, or formal delivery gate was started.

## Deviations from Plan

None — the audit found no product defect. The only change is the planned focused browser evidence for the public-route boundary.

## Self-Check: PASSED

- `apps/web/e2e/article-lifecycle.spec.ts` exists and is committed in `2a7332f`.
