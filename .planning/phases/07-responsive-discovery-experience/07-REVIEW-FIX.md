---
phase: 07-responsive-discovery-experience
fixed_at: 2026-08-19T13:30:28Z
review_path: .planning/phases/07-responsive-discovery-experience/07-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 7: Code Review Fix Report

**Fixed at:** 2026-08-19T13:30:28Z
**Source review:** `.planning/phases/07-responsive-discovery-experience/07-REVIEW.md`
**Iteration:** 1

**Summary:**

- Findings in scope: 5
- Fixed: 5
- Skipped: 0
- Verification ran in the main checkout.

## Fixed Issues

### WR-01: Compact taxonomy targets

**Files modified:** `apps/web/app/public.module.css`, `apps/web/e2e/public-discovery.spec.ts`
**Commit:** `69fc0be`
**Applied fix:** Compact category and tag links now expose 44px minimum targets, measured at 375px, 768px and 1280px in both search and related cards.

### WR-02: Incomplete isolated-root cleanup

**Files modified:** `scripts/phase7-browser-verify.mjs`
**Commit:** `578c1bd`
**Applied fix:** Isolated Web setup now owns a local cleanup boundary and removes its exact temporary root before rethrowing any copy, tree or symlink failure.

### WR-03: Playwright descendant cleanup

**Files modified:** `scripts/phase7-browser-verify.mjs`
**Commit:** `578c1bd`
**Applied fix:** Every runner-owned process tree now receives an isolated POSIX process group with bounded group TERM/KILL handling. A controlled 1.5-second Playwright timeout exits nonzero, reports cleanup success and leaves no observed worker process.

### WR-04: Non-vacuous privacy and related de-duplication evidence

**Files modified:** `apps/web/e2e/public-discovery-fixture.ts`, `apps/web/e2e/public-discovery.spec.ts`
**Commit:** `6ffb70b`
**Applied fix:** The malformed strict DTO path now actually carries all private sentinels and proves they cannot reach rendered output. A separate related response now includes the source slug and a later duplicate, proving first-occurrence order and filtering without claiming that the Web fixture proves the database publication predicate.

### WR-05: Same-origin public URL authority

**Files modified:** `apps/web/app/lib/site-metadata.ts`, `apps/web/app/lib/site-metadata.test.ts`
**Commit:** `1336960`
**Applied fix:** Public URL resolution rejects authority-relative and backslash paths and verifies the resolved origin against `PUBLIC_ORIGIN`.

## Verification

- Site metadata unit tests: 5/5 passed.
- Focused responsive Chromium tests: 3/3 passed.
- Focused related/privacy Chromium tests: 6/6 passed.
- Forced setup failure: expected nonzero exit; no `.phase7-web-*` root remained.
- Forced Playwright timeout: expected nonzero exit; `CLEANUP PASS`; observed Playwright worker PID absent afterward.
- Normal runner path: desktop tracer 1/1 passed with `CLEANUP PASS`.
- `node --check scripts/phase7-browser-verify.mjs` and `git diff --check`: passed.

---

_Fixed: 2026-08-19T13:30:28Z_
_Fixer: Codex main orchestrator (gsd-code-fixer recovery fallback)_
_Iteration: 1_
