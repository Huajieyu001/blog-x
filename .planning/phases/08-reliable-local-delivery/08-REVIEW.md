---
phase: 08-reliable-local-delivery
reviewed: 2026-08-20T14:30:01Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - apps/api/Dockerfile.refresh
  - apps/web/Dockerfile.refresh
  - ops/v1.1-local-delivery-evidence.json
  - package.json
  - scripts/local-delivery-acceptance-test-core.mjs
  - scripts/local-delivery-acceptance.mjs
  - scripts/local-delivery-acceptance.test.mjs
  - scripts/local-verify.mjs
  - scripts/local-verify.test.mjs
  - scripts/phase7-browser-verify.mjs
  - scripts/refresh-local-facts.mjs
  - scripts/refresh-local-live.mjs
  - scripts/refresh-local-runtime-core.mjs
  - scripts/refresh-local-test-core.mjs
  - scripts/refresh-local.mjs
  - scripts/refresh-local.test.mjs
  - scripts/refresh-seed-store.mjs
findings:
  critical: 2
  warning: 1
  info: 0
  total: 3
status: issues_found
---

# Phase 08: Code Review Report

**Reviewed:** 2026-08-20T14:30:01Z
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

The fixed local-delivery implementation has strong exact-argv, immutable-image, receipt-schema, and local-authority validation, but two failure paths violate its core recovery guarantees. Failures after the refresh executor returns do not roll back the already-cut-over runtime, and the outer acceptance timeout is not actually bounded or cleanup-safe. The acceptance digest sanitizer also misses common structured credential forms.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Post-cutover verifier and terminal-output failures bypass rollback

**Classification:** BLOCKER

**File:** `scripts/refresh-local-runtime-core.mjs:975-1017`

**Issue:** `executeRefresh()` owns the only rollback-capable `runLocalRefresh()` scope, but it returns before `verifyEvidence()` and the `final_output` stage run. If evidence reconstruction fails at line 979, or a terminal-output stage boundary/write fails after cutover, the outer catch only recollects facts and writes a failure report. It never invokes `rollback-api-web` or `verify-rollback`. The canonical API/Web containers can therefore remain on an unverified target revision even though the command reports failure. This directly contradicts D-13 and the Phase 08 must-have that every failure after cutover begins restores the exact preflight image IDs and route baseline. The stage-fault regression at `scripts/refresh-local.test.mjs:1259-1275` also omits `evidence_verification` and `final_output`, which is why the gap passes the suite.

**Fix:** Keep rollback authority alive through evidence verification and terminal completion. One safe shape is to run current-runtime verification before final receipt publication, then publish the final receipt only after verification succeeds; alternatively expose a sealed adapter recovery operation to `runRefreshCliBoundary` and call `rollback-api-web` plus `verify-rollback` for every post-cutover outer failure. Add fault-injection tests for both `evidence_verification` and `final_output` that assert the old immutable API/Web IDs, original route observations, and absence of a success receipt.

### CR-02: Acceptance timeout/output limits can hang forever and leak generated runtimes

**Classification:** BLOCKER

**File:** `scripts/local-delivery-acceptance.mjs:155-177`

**Issue:** `runBounded()` starts the Phase 6/7 coordinator child as an ordinary process and, on timeout or output overflow, sends one `SIGTERM` only to that PID. There is no grace deadline, `SIGKILL` escalation, process-group termination, or signal-aware cleanup handshake. If the child ignores or delays `SIGTERM`, the promise never settles because it waits indefinitely for `close`, so the advertised ten-minute/output bound is not a bound. More importantly, killing `local-verify.mjs` or `phase7-browser-verify.mjs` at the parent PID can prevent their `finally` cleanup from running while spawned Compose containers, volumes, Next, fixture, or Playwright descendants continue running. The test-only runtime merely supplies synthetic `timedOut`/`overflow` result objects and never exercises the production process tree, so passing tests do not prove cleanup.

**Fix:** Implement a bounded child-tree controller: launch an isolated process group where supported, request cooperative termination, wait a short fixed grace period, then terminate the exact group with `SIGKILL` and reject only after the group is confirmed closed. Add SIGTERM handlers in the Phase 6 and Phase 7 entrypoints that await their namespace/root cleanup before exiting, and add a real helper-process regression that deliberately ignores TERM/spawns a descendant and proves bounded completion plus exact generated-authority cleanup.

## Warnings

### WR-01: Sanitized output digests still accept common structured secret forms

**Classification:** WARNING

**File:** `scripts/local-delivery-acceptance.mjs:38-52`

**Issue:** Both the redactor and raw-secret assertion recognize `password=...`, `token=...`, `secret=...`, PostgreSQL URLs, and `blog_x_session`, but not common forms such as `{"password":"value"}`, `token: value`, `Authorization: Bearer value`, or non-session cookie credentials. Such a line can pass `assertNoRawSecrets()` and be hashed unchanged into `outputSha256`. The receipt does not contain the cleartext, but a deterministic digest of known surrounding output and a low-entropy credential can still support offline guessing and does not meet the stated sanitized-digest contract.

**Fix:** Normalize and redact structured `key=value`, `key: value`, JSON credential fields, authorization headers, and cookie values before hashing, then run the raw-secret assertion against the normalized redacted form. Add fixtures for JSON, colon-delimited, bearer-token, and cookie variants and assert that changing only the secret does not change the sanitized output digest.

---

_Reviewed: 2026-08-20T14:30:01Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
