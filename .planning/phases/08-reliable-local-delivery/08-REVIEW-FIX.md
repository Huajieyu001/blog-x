---
phase: 08-reliable-local-delivery
fixed_at: 2026-08-21T04:10:05Z
review_path: .planning/phases/08-reliable-local-delivery/08-REVIEW.md
iteration: 2
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 08: Code Review Fix Report

**Fixed at:** 2026-08-21T04:10:05Z
**Source review:** `.planning/phases/08-reliable-local-delivery/08-REVIEW.md`
**Iteration:** 2

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Fixed Issues

### CR-01: Committed delivery evidence no longer verifies the current implementation revision

**Files modified:** `scripts/refresh-local-runtime-core.mjs`, `scripts/refresh-local.test.mjs`
**Commit:** `13f146d`
**Status:** fixed; successor evidence still requires a future explicit `local:deliver`
**Applied fix:** Preserved `ops/v1.1-local-delivery-evidence.json` as immutable historical evidence and introduced a new revision-, authority-, path-, and claim-bound successor evidence path. The verifier accepts only the successor path and retains the exact source-drift policy. Regression coverage proves the historical receipt remains unchanged, BLOCKED, and invalid as current successor evidence.

### CR-02: Receipt withdrawal failure still prevents post-cutover image rollback

**Files modified:** `scripts/refresh-local-runtime-core.mjs`, `scripts/refresh-local.test.mjs`
**Commit:** `c3a3817`
**Status:** fixed; recovery-state logic remains human-review-sensitive
**Applied fix:** Moved immutable old-image rollback ahead of and independent from receipt cleanup. Rollback facts are still collected and verified when evidence `lstat`, `realpath`, `unlink`, or directory sync fails; simultaneous runtime and evidence-cleanup failures retain both causes under an aggregate classification. Focused faults prove the old-image Compose invocation and route rollback facts complete before the artifact inconsistency is reported.

### CR-03: Process-group exit is reported as cleanup without proving generated Docker/root cleanup

**Files modified:** `scripts/local-delivery-child-tree.mjs`, `scripts/local-delivery-acceptance.mjs`, `scripts/local-delivery-acceptance.test.mjs`, `scripts/local-delivery-active-cleanup.test.mjs`, `scripts/local-verify.mjs`, `scripts/phase7-browser-verify.mjs`
**Commit:** `d0c80e5`
**Status:** fixed; process and daemon cleanup logic remains human-review-sensitive
**Applied fix:** Separated OS process-tree termination from generated-authority cleanup confirmation. Phase 6 now owns every allocated `blogxverify_*` namespace, confirms its exact containers and two volumes are absent, and emits one strict cleanup acknowledgement. Phase 7 owns its generated Web root from allocation, verifies its exact root/origins/children are absent, and emits a strict acknowledgement. The parent accepts completion only with the matching structured proof and never describes forced termination without proof as confirmed cleanup.

Real signal regressions cover a Phase 7 signal during generated-root setup and an active Phase 6 Compose namespace. The opt-in Docker regression uses existing verifier images plus `--skip-build`: cooperative TERM removed the exact namespace and emitted acknowledgement; SIGKILL emitted no acknowledgement, after which the harness cleaned only that random namespace. Before/after snapshots proved canonical `blogxlocal` containers and volumes were unchanged, and no `blogxverify_*` resource remained.

### WR-01: Whitespace-prefixed Cookie headers still change the sanitized digest

**Files modified:** `scripts/local-delivery-acceptance.mjs`, `scripts/local-delivery-acceptance.test.mjs`
**Commit:** `aa187b2`
**Applied fix:** Cookie and Set-Cookie normalization now recognizes indentation and ordinary log prefixes, while structured JSON redaction includes both `cookie` and `set-cookie`. The post-redaction raw-secret assertion uses the same header-shaped search. Paired fixtures cover indented Cookie, prefixed Cookie, log-prefixed Set-Cookie, and JSON `set-cookie`; changing only secret values leaves the sanitized digest unchanged.

## Verification

All verification ran in the main checkout because `workflow.use_worktrees=false` was explicitly configured for this execution.

- `node --test scripts/refresh-local.test.mjs` — 60 passed, 0 failed/skipped/TODO
- `node --test scripts/local-delivery-acceptance.test.mjs` — 7 passed, including forced process-tree and pre-try Phase 7 signal regressions
- `node --test scripts/local-verify.test.mjs` — 29 passed, 0 failed/skipped/TODO
- `BLOG_X_ACTIVE_DOCKER_CLEANUP_REGRESSION=1 node --test scripts/local-delivery-active-cleanup.test.mjs` — 2 passed, 0 failed/skipped/TODO; no build and no canonical authority change
- Final combined focused run — 96 passed, 0 failed, 2 intentionally skipped opt-in Docker cases
- Syntax checks passed for every changed/new `.mjs` file
- `node scripts/check-boundaries.mjs` — 410 files checked, 0 findings
- `git diff --check` — passed
- `local:deliver` was not run; the historical receipt was not modified or deleted; no cloud server operation was performed

## Prior Iteration History

Iteration 1 fixed the first review's three findings in commits `91b1755`, `e52b270`, and `2a89304`. Iteration 2 retained those changes and closed the successor findings raised by the second review with the four atomic commits above.

---

_Fixed: 2026-08-21T04:10:05Z_
_Fixer: the agent (gsd-code-fixer generic-agent workaround)_
_Iteration: 2_
