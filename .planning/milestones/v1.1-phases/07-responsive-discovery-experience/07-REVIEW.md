---
phase: 07-responsive-discovery-experience
reviewed: 2026-08-19T12:35:42Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - apps/web/app/_components/Pagination.tsx
  - apps/web/app/_components/PostCard.tsx
  - apps/web/app/_components/PublicHeader.tsx
  - apps/web/app/_components/SearchForm.tsx
  - apps/web/app/lib/api.ts
  - apps/web/app/lib/search-discovery.test.ts
  - apps/web/app/lib/search-discovery.ts
  - apps/web/app/lib/site-metadata.test.ts
  - apps/web/app/lib/site-metadata.ts
  - apps/web/app/posts/[slug]/page.tsx
  - apps/web/app/public.module.css
  - apps/web/app/search/page.tsx
  - apps/web/e2e/public-discovery-fixture.ts
  - apps/web/e2e/public-discovery.spec.ts
  - apps/web/lib/search-encoding.test.ts
  - apps/web/lib/search-encoding.ts
  - apps/web/proxy.ts
  - scripts/phase7-browser-verify.mjs
findings:
  critical: 0
  warning: 5
  info: 0
  total: 5
status: issues_found
---

# Phase 7: Code Review Report

**Reviewed:** 2026-08-19T12:35:42Z
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues_found

## Summary

The search request/outcome authority, metadata/body reuse, strict DTO parsing, related-reading failure isolation, and mobile menu semantics were reviewed adversarially across all 18 submitted files. No Critical issue was found, but five reproducible robustness, accessibility, same-origin, and acceptance-reliability gaps should be fixed before the phase ships.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Compact-card taxonomy links miss the phase's 44px target contract

**File:** `apps/web/app/public.module.css:175`

**Classification:** WARNING

**Issue:** `.taxonomy a` has padding and a `min-height` of only `28px`, and the compact-card overrides at lines 218-223 increase only `.readLink`. Search and related-reading cards therefore expose category and tag links whose computed target height can remain 28px. This is a direct regression against the Phase 7 requirement that all newly exposed actionable controls be at least 44px; the browser suite does not measure these links, so its current 44px assertions still pass.

**Fix:** Add a compact-card-specific rule that makes taxonomy links inline-flex controls with `min-height: 44px` and vertical centering, then extend the 375/768/1280 Playwright target loop to measure category and tag links as well as search and pagination controls.

### WR-02: A setup failure can leak the generated isolated Web root

**File:** `scripts/phase7-browser-verify.mjs:12-21`

**Classification:** WARNING

**Issue:** `createIsolatedWebRoot()` creates `apps/.phase7-web-*` before copying five files, two trees, and a symlink, but has no local cleanup on failure. The caller does not enter its `try/finally` until line 203, after this function has already returned. Removing or making one copied input unreadable reproduces the problem: `copyFile`/`cp` rejects after `mkdtemp`, `main` exits through `.catch`, and the partial temporary root remains on disk. That contradicts the runner's exact temporary-root cleanup claim.

**Fix:** Wrap all post-`mkdtemp` setup in a `try/catch` inside `createIsolatedWebRoot()` and `await rm(isolated, { recursive: true, force: true })` before rethrowing. Alternatively, allocate the root in an outer `try/finally` that begins before any copy operation.

### WR-03: Timeout cleanup signals only the wrapper process, not its Playwright/Chromium descendants

**File:** `scripts/phase7-browser-verify.mjs:116-155`

**Classification:** WARNING

**Issue:** `runPlaywright()` starts `corepack`, which in turn runs pnpm, Playwright, and Chromium, but the timeout path calls `child.kill()` only on the direct `corepack` PID. POSIX signals are not automatically delivered to descendant processes. Once the wrapper closes, `stopExactChild()` considers that handle complete, while `expectHttpClosed()` checks only the fixture and Web origins. A hung test or output-limit termination can therefore leave Playwright/browser descendants alive while the runner reports cleanup success.

**Fix:** Launch this runner-owned tree in its own process group and terminate that exact group with bounded TERM/KILL handling, or invoke Playwright through an API that gives the runner explicit browser/process ownership. Add a controlled timeout fixture and assert the owned process group has no survivors before printing `CLEANUP PASS`.

### WR-04: The privacy and source-exclusion acceptance assertions are vacuous against the fixture

**File:** `apps/web/e2e/public-discovery.spec.ts:35-49`

**Classification:** WARNING

**Issue:** The suite repeatedly asserts that five private sentinels are absent, but none of those values exists in `public-discovery-fixture.ts`; a frontend or API regression exposing those records would not be exercised by this matrix. The same gap affects related source/duplicate filtering: `populatedRelated` at `apps/web/e2e/public-discovery-fixture.ts:80-82` contains four unique non-source slugs, so the assertion at `apps/web/e2e/public-discovery.spec.ts:178` still passes if the defensive filter in the article page is deleted. This makes the reported draft/downline/deleted privacy and source-exclusion evidence materially weaker than the test names and Phase 7 browser contract claim.

**Fix:** Add an acceptance path backed by seeded API data containing published plus draft/downline/deleted records, and assert only published DTOs reach the page. Add a strict related fixture response containing the source slug and a duplicate slug, then assert the page preserves first-occurrence API order while removing both. If a mock must stay frontend-only, label it as strict-parser coverage rather than publication-filter evidence.

### WR-05: `publicUrl` accepts protocol-relative paths and can leave the configured public origin

**File:** `apps/web/app/lib/site-metadata.ts:24-26`

**Classification:** WARNING

**Issue:** The only guard is `path.startsWith("/")`. WHATWG URL resolution treats both `//evil.example/x` and `/\\evil.example/x` as authority-relative URLs, so `publicUrl("//evil.example/x", publicOrigin("https://blog.example"))` returns `https://evil.example/x`. Current Phase 7 callers produce safe paths, but the exported URL authority does not enforce the same-origin invariant it is used to centralize; a future caller passing an externally derived canonical path could create off-site canonical/Open Graph/RSS URLs.

**Fix:** Resolve the URL first and reject it unless `resolved.origin === origin.origin`; also reject backslashes or normalize and validate a single-leading-slash pathname. Add unit cases for `//host/path` and `/\\host/path` alongside the existing relative-path rejection.

---

_Reviewed: 2026-08-19T12:35:42Z_
_Reviewer: the agent (gsd-code-reviewer, generic-agent workaround)_
_Depth: standard_
