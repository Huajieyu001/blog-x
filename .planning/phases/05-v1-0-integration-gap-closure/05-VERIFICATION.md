---
phase: 05-v1-0-integration-gap-closure
verified: 2026-08-14T15:46:43Z
status: gaps_found
score: 3/4 roadmap success criteria verified
behavior_unverified: 0
requirements_verified: [OPS-01, OPS-03]
requirements_blocked: [OPS-05]
decision_coverage:
  honored: 4
  total: 4
  not_honored: []
gaps:
  - "The v2 receipt closes the former synthetic-result gap, but 05-04's required synthetic/actual prohibition fixtures and committed stale-owner/two-parent writer tests are absent."
  - "The passed milestone audit frontmatter cites d3a27b3, while its Receipt-Bound Full Gate body still cites the obsolete 68b9178 implementation revision."
---

# Phase 05: Integration Gap Closure Verification Report

**Phase Goal:** 修复 v1.0 里程碑审计发现的三项跨阶段矛盾，使浏览器媒体严格同源、生产备份路径可执行、发布前后门禁顺序可达，并在不接触冻结主机的前提下重新通过完整验收。
**Verified:** 2026-08-14T15:46:43Z
**Status:** gaps_found

## Executive Result

The deterministic receipt defect reported on 2026-08-12 is closed. Receipt v2 contains 28 embedded canonical execution-result records derived by the runner from captured TAP/database, Playwright, structured generated-pipeline, and machine-readable boundary outcomes. Independent reconstruction matched every source and result digest, and none of the retained result digests matches the former synthetic formula.

Phase 5 still cannot be marked complete because two high-severity 05-04 evidence controls are not represented by committed regression tests/fixtures, and the passed milestone audit contains a contradictory stale implementation revision in its body. Canonical production release remains `BLOCKED`.

## Roadmap Success Criteria

| # | Criterion | Status | Independent evidence |
|---|---|---|---|
| 1 | Published Markdown and covers emit only same-origin exact `/media/<uuid>` image requests; ordinary external links remain usable. | ✓ VERIFIED | Shared exact predicate, renderer/lifecycle enforcement, legacy disposition, browser wiring, 05-01 artifact/link checks, 6 Markdown tests, and the media prohibition test passed. |
| 2 | Production backup collection, encrypted mounted-directory transfer, receipt, retention, result, and alert contracts are executable locally and fail closed without live configuration. | ✓ VERIFIED | 05-02's 10 artifacts and 7 links passed; production/backup/restore focused checks passed with generated authorities only. No real mount, schedule, destination, or alert was activated. |
| 3 | `PRE_RELEASE_READY` and predecessor-bound `POST_RELEASE_VERIFIED` are distinct pure decisions and expose no automatic deployment capability. | ✓ VERIFIED | Release-gate focused checks passed all generated-scope rejection, predecessor binding, failed-smoke, exact-post, and expectation-only CLI cases. Canonical evidence remained `BLOCKED`. |
| 4 | Phase 1–5 acceptance and integrated evidence are reproducibly receipt-bound with the required negative controls. | ✗ BLOCKED | The exact retained v2 receipt is substantive and the recorded full gate passed, but the committed stale-owner/two-parent lock regressions and the named synthetic/actual prohibition fixtures promised by 05-04 are absent; the passed audit body also cites the obsolete implementation revision. |

**Score:** 3/4 roadmap success criteria verified.

## Receipt v2 Reconstruction

The retained receipt at `ops/phase5-full-gate-receipt.json` independently verified as follows:

- file SHA-256: `9c0aa9943017604ce4b25a25546355890afbbc0a0a8ba5289a7055918df79ee4`;
- schema/version: strict `blog-x-phase5-full-gate-receipt` v2;
- implementation revision: `d3a27b3d7615109c69a9c798f9f7563444299b45`;
- exact command: `corepack pnpm local:verify -- --phase5-full --interruption-check --parallel-check`;
- scope: `local-generated-production-pipeline-and-fake-fault-only`;
- terminal decision: `BLOCKED`;
- 28 manifest entries and 28 result entries: 14 database, 8 Node, 4 browser, 1 production pipeline, and 1 boundary audit;
- 36 invocations, 48,484 redacted output bytes, and 36 distinct output digests;
- aggregate result: 482 tests, 482 passed, 0 failed/cancelled/skipped/TODO;
- pipeline record: 2 invocations and 2 passing outcomes;
- boundary record: 305 checked-file outcomes and zero findings.

Independent recomputation produced:

| Binding | Result |
|---|---:|
| Manifest canonical SHA-256 | matched |
| Source bytes at `d3a27b3` | 28/28 matched |
| Embedded canonical result SHA-256 | 28/28 matched |
| Positive output byte length and digest shape | 36/36 matched |
| Distinct output digests | 36/36 |
| Former `phase5-semantic-pass:<id>:<revision>` formula | 0/28 matched |
| Canonical evidence bytes | matched `d006272f...` |
| Current deterministic BLOCKED output | matched receipt digest `8697a1ed...` |

The source no longer contains `phase5-semantic-pass`. Counts vary by actual suite output rather than being uniformly fixed at 1/1. The only literal 1/1 construction is for each of the two separately strict-parsed generated pipeline invocations, which aggregate to 2/2 and are not derived from suite ID or revision.

## Commit and Audit Ordering

The required history is structurally isolated:

1. implementation authority `d3a27b3`;
2. receipt-only commit `0939651` (only `ops/phase5-full-gate-receipt.json`);
3. later audit commit `ff59dc6` (only `.planning/v1.0-MILESTONE-AUDIT.md`);
4. later summary/planning handoff `4498cfe`.

All ancestor checks passed, and the receipt completed before both receipt and audit commits. Audit frontmatter declares v2 and exactly matches the receipt SHA-256 and `d3a27b3` revision. However, line 47 of the audit body still claims implementation revision `68b9178079b58bb4299b2938f233ae7532b5f186`. The current boundary check parses only the frontmatter revision, so it does not detect this contradictory body claim.

## Lock, CAS, and Atomicity Controls

The implementation contains the intended controls:

- one fixed `${receiptPath}.lock` and one fixed `${receiptPath}.lock.recovery`, created with exclusive `"wx"`/0600 semantics;
- strict owner PID, birth identity, nonce, UID/mode/type checks;
- live PID+matching-birth rejection and PID-reuse recovery by birth mismatch;
- inode/device/nonce comparison before unlink;
- predecessor existence/version/SHA-256 captured while holding the lock and compared immediately before rename;
- restrictive incomplete sibling, file fsync, atomic rename, parent fsync, strict final readback, and byte equality;
- lock held from before suite execution through final readback and released in the outer `finally`.

Focused repository tests verify live-owner rejection, predecessor CAS, failure preservation, stable readback, and clean committed authority. An independent generated-target probe also confirmed live-owner rejection, birth-identity-mismatch recovery, and removal of both lock paths.

The evidence gap is test durability: `scripts/phase5-receipt.test.mjs` contains no deterministic two-parent subprocess/barrier test, dead-owner/SIGKILL recovery test, PID-reuse regression, or inode/nonce ownership-change release case. Those were explicit 05-04 acceptance requirements created to close the plan-checker's race concern. The summary's claim of full stale-recovery/concurrency evidence therefore outruns the committed test suite.

## Missing Required Fixtures

`05-04-PLAN.md` and `05-04-SUMMARY.md` name these files as created evidence:

- `scripts/fixtures/prohibitions/phase5-receipt-synthetic-results.json`
- `scripts/fixtures/prohibitions/phase5-receipt-actual-results.json`

Neither file exists in the worktree or Git tree, and neither focused receipt/local-verifier test consumes such a fixture. The RED commit `d62370d` changed only the two test files. Static GSD artifact verification did not catch this because the two paths were omitted from the plan's `must_haves.artifacts` list despite appearing in `files_modified` and the summary.

## Requirements and Integration Coverage

| Requirement / audit link | Status | Evidence |
|---|---|---|
| OPS-01 / G1 / INT-01 / FLOW-07 | ✓ SATISFIED locally | Exact media policy, lossless legacy disposition, fresh/restored browser wiring, focused Markdown and prohibition checks. |
| OPS-03 / G2 / INT-02 / FLOW-08 | ✓ SATISFIED at local executable-contract boundary | Fresh complete-set collector, concrete generated mounted adapter, encryption/receipt/retention/result/alert contracts, rehearsal separation, focused tests. |
| OPS-05 / G3 / INT-03 / FLOW-09 | ✗ PHASE CLOSURE BLOCKED | Non-circular release state machine and actual-result v2 receipt pass, but required concurrency regression evidence/fixtures are absent and the passed audit is internally inconsistent. |

## Independent Checks

| Check | Result |
|---|---|
| GSD artifacts/key links, 05-01 through 05-04 | 31/31 artifacts and 26/26 links passed |
| GSD summary verification, 05-01 through 05-04 | Passed |
| Read-only receipt verifier and file SHA-256 | Passed |
| Independent manifest/source/result/decision reconstruction | Passed |
| Receipt/local-verifier/release/production focused suite | 50 passed; 0 failed/skipped/TODO |
| Media/backup/restore focused suite | 13 passed; 0 failed/skipped/TODO |
| Markdown renderer focused suite | 6 passed; 0 failed/skipped/TODO |
| Repository boundary audit | 306 files, 0 findings |
| Workspace typecheck | Passed |
| Drizzle schema generation check | Passed; no drift |
| Exact full Phase 1–5 gate | Not rerun; the retained v2 receipt and preserved terminal log were sufficient for outcome reconstruction |

## Required Closure

1. Add and consume the two named synthetic/actual receipt prohibition fixtures, proving the old formula/fixed-count shape fails and an actual-record shape passes.
2. Add deterministic committed tests for two competing parent writers, live-owner non-displacement, dead/SIGKILL owner recovery, PID birth-identity reuse, recovery-guard contention, and inode/nonce-safe release. Keep the current production-free generated target scope.
3. Correct the milestone audit body revision to `d3a27b3d7615109c69a9c798f9f7563444299b45` and add a boundary/test assertion preventing stale contradictory revision claims.
4. Rerun focused receipt/boundary checks, update the audit in a later docs commit if needed, then rerun independent Phase 5 verification. A new heavy full gate is unnecessary unless implementation changes affect receipt bytes or execution-result capture.

## Residual Live Release Blockers

Even after local Phase 5 closure, production must remain `BLOCKED` pending explicit main-server unfreeze authorization, real host baselines, verified secure node link, configured and verified off-host destination/mount, activated daily schedule and alert delivery, recovery-target evidence, TLS and renewal facts, deployment, and post-release HTTPS smoke with continue/rollback evidence.

No cloud server, public endpoint, deployment, real mount, systemd activation, live alert, TLS check, rollback, unfreeze, or production transition was contacted or performed during this verification.

---
*Verified: 2026-08-14T15:46:43Z*

*Verifier: Codex gsd-verifier (independent Phase 05 rerun)*
