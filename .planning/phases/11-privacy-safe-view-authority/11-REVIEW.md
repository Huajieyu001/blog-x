---
phase: 11-privacy-safe-view-authority
reviewed: 2026-09-05T04:48:42Z
depth: deep
files_reviewed: 28
files_reviewed_list:
  - apps/api/drizzle/0009_article_daily_views.sql
  - apps/api/drizzle/meta/0009_snapshot.json
  - apps/api/drizzle/meta/_journal.json
  - apps/api/package.json
  - apps/api/src/analytics/view-request-policy.ts
  - apps/api/src/app.ts
  - apps/api/src/content/view-aggregation-repository.ts
  - apps/api/src/content/view-retention.ts
  - apps/api/src/db/schema.ts
  - apps/api/src/routes/public-views.ts
  - apps/api/src/security/config.ts
  - apps/api/test/backup-restore.test.ts
  - apps/api/test/distribution-export.test.ts
  - apps/api/test/public-view-security.test.ts
  - apps/api/test/public-visibility.test.ts
  - apps/web/app/posts/[slug]/ViewBeacon.tsx
  - apps/web/app/posts/[slug]/page.tsx
  - apps/web/e2e/public-reading.spec.ts
  - package.json
  - packages/contracts/src/analytics.ts
  - packages/contracts/src/index.ts
  - packages/contracts/src/tracer.test.ts
  - scripts/default-test.mjs
  - scripts/default-test.test.mjs
  - scripts/local-verify.mjs
  - scripts/local-verify.test.mjs
  - scripts/test-inventory.mjs
  - scripts/test-inventory.test.mjs
findings:
  critical: 1
  warning: 2
  info: 0
  total: 3
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-09-05T04:48:42Z
**Depth:** deep
**Files Reviewed:** 28
**Status:** issues_found

## Summary

The SQL aggregate and its Drizzle metadata are mutually consistent, the upsert is atomic, the public predicate matches the existing public-read predicate, and the portable export correctly excludes the analytics table. The request path, however, does not preserve a client identity across the required same-origin Next rewrite, so its per-IP limiter becomes a site-wide limiter. The browser beacon also has a state-lifetime edge case, and the Phase 11 verification record does not execute the changed browser-beacon journey.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: The anonymous-view limiter is global behind the required Web-to-API rewrite

**File:** `/Users/xanadu/Desktop/ai-coding/blog-x/apps/api/src/routes/public-views.ts:42` (affected setup: `/Users/xanadu/Desktop/ai-coding/blog-x/apps/api/src/app.ts:132-133`)

**Severity:** BLOCKER

**Issue:** The view route keys its limiter with `request.ip`, while the API explicitly sets `trustProxy: false`. Browser requests are sent to the Web service's `/api/...` rewrite, so the API receives the Web/Next proxy as its socket peer rather than the visitor. Consequently all visitors share one `anonymous-view` key and the hard-coded 120/minute limit. Any visitor (or normal traffic spike) can exhaust it and silently discard every other visitor's view for that minute; the endpoint's intentional 204 opacity makes this data loss invisible. The unit test supplies separate `remoteAddress` values directly to Fastify and therefore does not exercise the deployed topology.

**Fix:** Establish a trustworthy client-address boundary at the controlled edge: strip untrusted forwarding headers there, forward one canonical client address through the Web proxy, and configure Fastify to trust only that proxy/network before deriving the key. Alternatively perform this bounded rate limiting at the trusted edge. Wire the view route to the same configured store/capacity and add an end-to-end test proving two browser clients do not consume one another's quota.

## Warnings

### WR-01: A preserved ViewBeacon instance never records a subsequent slug

**File:** `/Users/xanadu/Desktop/ai-coding/blog-x/apps/web/app/posts/[slug]/ViewBeacon.tsx:10-14`

**Severity:** WARNING

**Issue:** `sent.current` is a component-lifetime boolean, but the effect depends on `slug`. If Next/React retains this client component while navigating between two values of the same dynamic route, the effect runs for the new slug and returns at line 13. The second article is therefore never counted. The current browser test uses full `page.goto` navigations, which remount the page and hides this transition path.

**Fix:** Make the guard slug-aware (for example, store the last sent slug and send when it changes), or key the beacon by article slug in `page.tsx`:

```tsx
<ViewBeacon key={article.slug} slug={article.slug} />
```

Add a client-side link navigation test from one published article to another and assert one beacon per slug.

### WR-02: The sealed Phase 11 gate does not run the changed browser-beacon journey

**File:** `/Users/xanadu/Desktop/ai-coding/blog-x/scripts/local-verify.mjs:1425-1441`

**Severity:** WARNING

**Issue:** `phase11Selection()` selects only two database suites, backup/restore, and the verifier self-test. `runPhase11DataChecks()` consequently never invokes `apps/web/e2e/public-reading.spec.ts`, although that changed spec is the only end-to-end assertion of the browser beacon's origin, credential omission, 204 response, and repeat-navigation behavior. The restore call runs `phase4-restore.spec.ts`, not the public-reading journey. This allows the Phase 11 machine record to pass while the newly added client beacon is absent or no longer reaches the API.

**Fix:** Add `apps/web/e2e/public-reading.spec.ts` to the Phase 11 sealed selection and execute it against the current mounted API and freshly built Web runtime, recording its Playwright counts in `createPhase11DataResult`. Update the selection tests to reject its omission or owner drift.

---

_Reviewed: 2026-09-05T04:48:42Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
