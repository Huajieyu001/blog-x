---
phase: 08-reliable-local-delivery
reviewed: 2026-08-20T15:34:21Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - apps/api/Dockerfile.refresh
  - apps/web/Dockerfile.refresh
  - ops/v1.1-local-delivery-evidence.json
  - package.json
  - scripts/fixtures/local-delivery-child-tree-helper.mjs
  - scripts/local-delivery-acceptance-test-core.mjs
  - scripts/local-delivery-acceptance.mjs
  - scripts/local-delivery-acceptance.test.mjs
  - scripts/local-delivery-child-tree.mjs
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
  critical: 3
  warning: 1
  info: 0
  total: 4
status: issues_found
---

# Phase 08: Code Review Report

**Reviewed:** 2026-08-20T15:34:21Z
**Depth:** standard
**Files Reviewed:** 19
**Status:** issues_found
**Iteration:** 2

## Summary

Iteration 1's fixes add useful rollback coverage, an isolated process-group controller, cooperative signal handling, and broader output redaction. The focused suites pass, but the phase is not ready to close. The committed receipt no longer verifies the current source revision, receipt withdrawal can still prevent the required image rollback, and the new process controller proves only OS-process exit rather than cleanup of the generated Docker/filesystem authorities. Cookie redaction also retains a structured-form gap.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: The committed delivery receipt no longer proves the current implementation

**Classification:** BLOCKER

**Files:** `ops/v1.1-local-delivery-evidence.json:4`, `scripts/refresh-local-runtime-core.mjs:885-890`

**Issue:** The sole receipt binds implementation revision `4414710b605ecd8a770a1c3a60afef479c9b4eb7`, while the reviewed HEAD is `de5ebda211cd2ea85a59cd4d2cfed073e3855672` and contains source changes in the rollback, process-tree, signal-cleanup, and redaction paths. The read-only production verifier fails with `intervening Git paths exceed the evidence/docs-only allowlist`, exactly as the verifier should. Therefore the phase's core claim that current committed code is the code visibly delivered at fixed `3100` is false for the reviewed HEAD. The existing immutable v1.1 path also cannot simply be overwritten.

**Fix:** Preserve the historical receipt, define a planned successor receipt/attempt authority that remains non-overwriting, then perform one formal delivery from a clean commit containing all accepted review fixes. Independently verify that successor receipt against the same commit and fixed runtime before phase completion. Do not weaken the verifier's source-path allowlist or treat source changes as documentation-only drift.

### CR-02: Receipt withdrawal failure still prevents post-cutover image rollback

**Classification:** BLOCKER

**File:** `scripts/refresh-local-runtime-core.mjs:632-642,762-766`

**Issue:** `rollback-api-web` calls `withdrawPublishedEvidence()` before it runs the immutable old-image Compose cutover. Any `lstat`, authority, `unlink`, directory-open, or directory-sync failure therefore aborts recovery while the unverified target API/Web images remain serving. This is especially relevant to the newly covered `evidence_verification` and `final_output` failures: the fix retains rollback authority only when receipt withdrawal succeeds. It still violates D-13's unconditional post-cutover restore guarantee and has no fault regression for final-receipt unlink/fsync failure.

**Fix:** Make runtime rollback independent of receipt cleanup. Attempt and verify the exact old-image cutover even if evidence withdrawal fails, retain both failure causes without masking either, and fail closed on the remaining artifact inconsistency only after old images/routes are restored. Add post-publication fault injection for evidence `lstat`/`realpath`/`unlink`/directory sync and assert the old-image Compose invocation and rollback facts still complete.

### CR-03: Process-group exit is reported as cleanup without proving generated Docker/root cleanup

**Classification:** BLOCKER

**Files:** `scripts/local-delivery-child-tree.mjs:71-81`, `scripts/local-verify.mjs:432-458`, `scripts/phase7-browser-verify.mjs:251-264,280-289`

**Issue:** `runBoundedChildTree()` declares "exact child tree cleanup confirmed" as soon as the OS process group disappears. That does not prove Phase 6's daemon-owned Compose containers/volumes were removed or Phase 7's generated Web root was deleted. Phase 6 aborts an active command with only direct-child `SIGTERM`; if that child does not close within the outer five-second grace, the outer `SIGKILL` can terminate `local-verify.mjs` before its `finally` finishes Docker cleanup. Phase 7 also creates `isolatedWebRoot` and then checks `throwIfAborted()` before entering the `try/finally`, so a signal during port allocation or root setup can leave the directory outside cleanup ownership. The real regression covers only a TERM-ignoring listener process and cannot detect either retained authority.

**Fix:** Put each generated authority under cleanup ownership from the moment it is allocated, including Phase 7 root creation. Add a bounded cooperative-cleanup acknowledgement that proves the exact Phase 6 namespace/volumes and Phase 7 root/origins are absent before the controller may report cleanup; forced group termination must not be called confirmed without those checks. Add real signal regressions for pre-try Phase 7 setup and an active generated Phase 6 Compose namespace, including the forced-kill path.

## Warnings

### WR-01: Whitespace-prefixed Cookie headers still change the supposedly sanitized digest

**Classification:** WARNING

**File:** `scripts/local-delivery-acceptance.mjs:47-69`

**Issue:** Both Cookie redaction and the post-redaction raw-secret check require `Cookie:` or `Set-Cookie:` at column zero. Captured/log-indented forms such as `  Cookie: account=alpha` pass validation unchanged. A focused reproduction showed that replacing only `alpha` with `beta` changes `phase6Data.outputSha256`, so the original structured-secret digest contract is still incomplete.

**Fix:** Recognize optional indentation and ordinary log prefixes before Cookie/Set-Cookie header fields, or parse header-shaped segments before hashing. Extend the paired-secret tests with whitespace-prefixed/prefixed Cookie and JSON `set-cookie` forms and require secret-only changes to leave the digest identical.

## Prior Finding Closure

- Previous CR-01: partially closed. Normal evidence-verification/final-output failures now enter rollback, but CR-02 above shows receipt-cleanup faults can still prevent restoration.
- Previous CR-02: partially closed. OS descendants are bounded and the helper listener closes, but CR-03 above shows generated Docker/filesystem authority is not actually confirmed.
- Previous WR-01: partially closed. JSON, colon, Bearer, database URL, and column-zero Cookie fixtures are redacted, but WR-01 above remains.

## Verification Performed

- `node --test scripts/refresh-local.test.mjs` — 57 passed, 0 failed/cancelled/skipped/TODO.
- `node --test scripts/local-delivery-acceptance.test.mjs` — 6 passed, including the TERM-ignoring process-tree helper; 0 failed/cancelled/skipped/TODO.
- `node --test scripts/local-verify.test.mjs` — 29 passed, 0 failed/cancelled/skipped/TODO.
- Syntax checks passed for all changed/new `.mjs` files.
- `node scripts/check-boundaries.mjs` — 409 files checked, 0 findings.
- `git diff --check` — passed.
- Read-only production evidence verification — failed as expected because current source changes exceed the receipt/docs-only allowlist.
- Focused whitespace-prefixed Cookie reproduction — accepted both variants and produced different sanitized output digests.
- `local:deliver` was not run; the receipt was not modified; no server operation was performed.

---

_Reviewed: 2026-08-20T15:34:21Z_
_Reviewer: the agent (gsd-code-reviewer generic-agent workaround)_
_Depth: standard_
_Iteration: 2_
