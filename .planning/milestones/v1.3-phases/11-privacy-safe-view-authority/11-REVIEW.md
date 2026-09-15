---
phase: 11-privacy-safe-view-authority
reviewed: 2026-09-05T08:03:32Z
depth: deep
files_reviewed: 36
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
  - apps/api/src/routes/auth.ts
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
  - ops/production-config.names.json
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
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
---

# Phase 11: Code Review Report

**Reviewed:** 2026-09-05T08:03:32Z
**Depth:** deep
**Files Reviewed:** 36
**Status:** clean

## Summary

Re-reviewed the complete implementation diff from `3d2cb1b` through the current Phase 11 fixes. The prior ingress identity defect is fixed end-to-end: the Web runtime strips all externally supplied forwarding and private handshake headers, requires an authenticated single canonical address in production, and forwards only that address to an API which trusts only its exact private Web CIDR. The API remains unpublished, public-view traffic is route-silent, and neither the aggregate schema nor the request path persists raw identity data.

The React beacon now deliberately survives development Strict Mode effect replay while its ref-backed set keeps one send per mounted slug; the retained-route browser journey asserts one beacon per slug and no failed request. The Phase 11 gate now typechecks/builds the current Web source before startup, snapshots `.next` and `server.mjs`, mounts both read-only in production mode, and binds the strict SHA-256 runtime authority into its machine result. Tests reject missing, malformed, or cached runtime authority.

Migration/schema authorities, public-only atomic aggregation, Shanghai 400-day bounded cleanup, full-backup restore equality, portable-export exclusion, test inventory ownership, ephemeral secret redaction, and the 2C4G-friendly single-process resource model were also traced across their callers and verification seams. No ship-blocking correctness, security, or maintainability defect was found.

## Narrative Findings (AI reviewer)

No Critical Issues, Warnings, or Info findings.

## Residual Operational Verification

The reviewer ran the focused Web runtime and Phase 11 verifier unit suites (44 pass), the complete default suite (60 pass), and workspace typechecks. A full disposable-Docker Phase 11 gate was not rerun in this review pass; this is not a code finding because its current-source authority, ingress fixture, read-only mounts, result digest, and fail-closed test coverage were directly inspected and are internally consistent. Production deployment remains explicitly `BLOCKED`.

---

_Reviewed: 2026-09-05T08:03:32Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
