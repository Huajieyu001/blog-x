---
phase: 11-privacy-safe-view-authority
reviewed: 2026-09-05T06:31:41Z
depth: deep
files_reviewed: 34
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
  - apps/api/test/security-hardening.test.ts
  - apps/web/Dockerfile
  - apps/web/app/posts/[slug]/ViewBeacon.tsx
  - apps/web/app/posts/[slug]/page.tsx
  - apps/web/e2e/public-reading.spec.ts
  - apps/web/package.json
  - apps/web/server.mjs
  - apps/web/server.test.mjs
  - compose.yaml
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

**Reviewed:** 2026-09-05T06:31:41Z
**Depth:** deep
**Files Reviewed:** 34
**Status:** issues_found

## Summary

The aggregate migration, atomic public-only upsert, retention operation, contract boundaries, export exclusion, and opaque endpoint handling are internally consistent. The previous retained-route beacon issue is fixed in the production component and its client-side navigation assertion is present. However, the proposed proxy boundary still reduces all public visitors to the Docker/host proxy address, and the sealed Phase 11 browser run does not bind the Web container to the current build. Development Strict Mode also aborts the only beacon before its second effect is suppressed.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: The trusted Web proxy still turns every public visitor into one limiter key

**File:** `/Users/xanadu/Desktop/ai-coding/blog-x/apps/web/server.mjs:20`

**Issue:** The code discards the ingress-provided address and forwards the Web container's socket peer instead. The only published Web port is host-loopback-bound in `/Users/xanadu/Desktop/ai-coding/blog-x/compose.yaml:75`; traffic reaching the container through that host/Docker hop has the host bridge/reverse-proxy address as `request.socket.remoteAddress`, not the browser address. Fastify trusts the Web container at `compose.yaml:46`, so it then uses this same rewritten `X-Forwarded-For` value as `request.ip` for the anonymous limiter in `/Users/xanadu/Desktop/ai-coding/blog-x/apps/api/src/routes/public-views.ts:42`. All visitors therefore share the 120/minute key, allowing one visitor or normal traffic to silently discard everyone else's views. The unit test models a direct caller with distinct `remoteAddress` values and never exercises the required host-to-Web-to-API topology.

**Fix:** Put client-address canonicalization at a controlled ingress that can actually observe the browser address (for example, the host reverse proxy), strip externally supplied forwarding headers there, and pass exactly one canonical address over a separately trusted hop. Make the Web/API trust configuration accept that canonical value only from the known ingress path, or move the bounded anonymous-view limiter to that ingress. Add an end-to-end topology test that reaches the published Web port through the real proxy path and proves two browser clients have independent quotas.

## Warnings

### WR-01: Development Strict Mode aborts the sole beacon and suppresses its replacement

**File:** `/Users/xanadu/Desktop/ai-coding/blog-x/apps/web/app/posts/[slug]/ViewBeacon.tsx:13`

**Issue:** The slug is added to `sentSlugs` before the request completes. React development Strict Mode runs the effect's cleanup and setup sequence while preserving hook state: cleanup at line 25 aborts the pending request, then the next setup returns at line 13 because the slug remains in the set. Thus local development visits record no view. The Playwright journey uses the production runtime, so it cannot expose this lifecycle path.

**Fix:** Do not abort this intentionally fire-and-forget event, or remove the slug from the set when an aborted request is cleaned up so the replacement Strict Mode effect can send it. Add a client/component test that exercises the Strict Mode effect replay and asserts exactly one completed request.

### WR-02: The Phase 11 browser selection runs against an arbitrary cached Web image, not the built source

**File:** `/Users/xanadu/Desktop/ai-coding/blog-x/scripts/local-verify.mjs:1762`

**Issue:** `--phase11-data` preflights cached `apiImage`/`webImage` and explicitly skips the image-build branch at line 1780. Although `runPhase11DataChecks()` executes `public-reading.spec.ts` (line 1449), starting/recreating `web` at line 1788/918 uses that cached image. Unlike the canonical path, Phase 11 never calls `createCanonicalRuntimeAuthority()` to mount the just-built `.next` output; the only source mounts are API/contracts for database checks at lines 991-994. A previously built image can therefore make the selected Playwright test pass while omitting the current beacon, rewrite, or proxy code.

**Fix:** Bind the browser fixture to the current Web artifact: either build/tag the Phase 11 API/Web images from the reviewed source before startup, or invoke a verified runtime override that mounts the newly built `.next` output (and current server source) for the Web service. Record/verify the image or artifact digest in the Phase 11 result, and add a verifier test that fails when Phase 11 has no current-Web authority.

---

_Reviewed: 2026-09-05T06:31:41Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
