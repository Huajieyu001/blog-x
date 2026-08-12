---
phase: 05-v1-0-integration-gap-closure
verified: 2026-08-12T15:46:25Z
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
  - "The retained Phase 5 receipt has synthetic result digests and fixed one-test counts, so it does not bind the reported full-gate suite outcomes to actual semantic test output."
---

# Phase 05: Integration Gap Closure Verification Report

**Phase Goal:** 修复 v1.0 里程碑审计发现的三项跨阶段矛盾，使浏览器媒体严格同源、生产备份路径可执行、发布前后门禁顺序可达，并在不接触冻结主机的前提下重新通过完整验收。
**Verified:** 2026-08-12T15:46:25Z
**Status:** gaps_found

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | 已发布 Markdown 与封面只会产生同源的精确 `/media/<uuid>` 图像请求；外部锚点保持可用。 | ✓ VERIFIED | `media-reference-policy.ts` provides the exact lowercase UUID predicate and AST-only classifier; renderer, lifecycle, migration, API, Node prohibition, and browser paths are linked. `markdown-renderer.test.ts` and `media-policy.test.mjs` passed. |
| 2 | 遗留图片内容得到无损、幂等的 disposition，迁移/架构检查阻止 retained pending state。 | ✓ VERIFIED | Generated migration 0006, transactional classifier, count-7 schema checks, and export/restore wiring exist; `db:generate:check` passed and static GSD artifact/link checks passed. |
| 3 | 生产备份与 rehearsal 的根权限分离；收集器、加密挂载目录、收据、保留、结果与告警契约可在生成的本地权限下执行并失败关闭。 | ✓ VERIFIED | 05-02's 10 artifacts/7 links passed GSD checks; independent backup/restore/production suite run passed 24 relevant tests, including cross-root, collector, mounted ciphertext, retention, fake-only, and pipeline controls. |
| 4 | 不配置真实生产权限时，计划任务/挂载/告警不会被激活或伪装成 off-host 生产证据。 | ✓ VERIFIED | Production tests and boundary audit passed; result schemas reject generated/fake scopes for release readiness. Service is a dormant template. No live mount, systemd activation, transfer, or alert operation was performed. |
| 5 | `PRE_RELEASE_READY` 和 predecessor-bound `POST_RELEASE_VERIFIED` 是独立、纯、可达的决策；生成作用域不能授予 readiness，且没有自动部署能力。 | ✓ VERIFIED | Independent `release-gate.test.mjs` run passed all v2 sequence, generated-scope rejection, canonical BLOCKED, and expectation-only CLI tests. |
| 6 | Phase 1–5 完整本地验收的保留收据以提交、精确 suites、真实语义结果/计数、终端 BLOCKED 绑定，因而可重现地支持里程碑审计。 | ✗ FAILED | Receipt schema/file hash/source digests/revision/order are valid, but `phase5ReceiptCandidate()` derives every `resultSha256` from `phase5-semantic-pass:${suite.id}:${implementationRevision}` and writes `tests: 1, passed: 1` for every suite. Independent recomputation matched that synthetic formula for all 27 entries. Thus no result digest or count binds actual TAP/Playwright/pipeline output, violating the receipt truth in 05-03. |

**Score:** 5/6 primary goal truths verified. The phase remains blocked because the final acceptance receipt is not evidence of actual suite results.

## Plan Must-Haves, Artifacts, and Wiring

| Plan | Artifacts | Key links | Summary validation | Result |
|---|---:|---:|---|---|
| 05-01 | 7/7 | 6/6 | passed | ✓ Static contract verified |
| 05-02 | 10/10 | 7/7 | passed | ✓ Static contract verified |
| 05-03 | 7/7 | 7/7 | passed | ✗ Receipt result-evidence contract failed independently |

All three `verify artifacts`, all three `verify key-links`, and all three `verify-summary` GSD commands returned success. This establishes declared files and pattern wiring, but does not override the receipt-evidence failure.

## Requirements and Integration Coverage

| Requirement / audit link | Status | Evidence |
|---|---|---|
| OPS-01 / G1 / INT-01 / FLOW-07 | ✓ SATISFIED locally | Exact parser/render/save/publish policy, migration disposition, prohibition control, and focused API/Node/static checks. |
| OPS-03 / G2 / INT-02 / FLOW-08 | ✓ SATISFIED at the local executable-contract boundary | Authority-separated complete-set verifier, fresh generated collector, AES-GCM mounted-directory provider, receipt-gated retention, result/alert contracts, fake isolation, and passing focused tests. Live off-host/mount/schedule/alert evidence is intentionally absent. |
| OPS-05 / G3 / INT-03 / FLOW-09 | ✗ BLOCKED for Phase 5 closure | Non-circular release state machine and canonical BLOCKED behavior pass, but the retained full-gate receipt cannot prove that its 27 reported suite outcomes actually ran/passed. |

Roadmap criteria 1–3 are supported by local implementation and focused verification. Criterion 4 is **not verified** because its required full acceptance receipt is non-evidentiary for suite results, despite strict-valid formatting.

## Receipt and Revision Audit

- Read-only receipt verifier passed: `aeb00503c90e3a7476be010915b7b5ea04ae5ea7a430e582e728ab92dcb0b0c9`.
- Actual SHA-256 equals the audit frontmatter citation.
- Receipt implementation revision `68b9178079b58bb4299b2938f233ae7532b5f186` is an ancestor of current HEAD; the audit evidence commit follows receipt completion.
- All 27 manifest source SHA-256 values independently matched the files at that implementation revision.
- **Fatal divergence:** all 27 receipt result SHA-256 values match a deterministic formula independent of any command output; all counts are hard-coded to one passing test. Receipt verification checks formatting but has no actual-output digest to compare.

## Independent Checks

| Check | Result |
|---|---|
| GSD artifacts/key links: 05-01 through 05-03 | 24/24 artifacts; 20/20 links passed |
| GSD summary verification: 05-01 through 05-03 | Passed |
| `node scripts/phase5-receipt.mjs verify --receipt=...` | Passed; digest above |
| Receipt source-digest reconstruction at implementation revision | 27/27 matched |
| Receipt result-digest reconstruction | 27/27 matched the synthetic formula (failure evidence) |
| `node --test` release/receipt/local-verifier/media/backup/restore/production | 59 passed; 0 failed/skipped/TODO |
| `corepack pnpm check:boundaries` | Passed |
| `corepack pnpm -r typecheck` | Passed |
| `corepack pnpm db:generate:check` | Passed |
| Focused API files outside the runner-owned disposable database | Not a valid standalone gate: 7 passed, 3 skipped, 2 failed for missing required generated database/backup roots; not counted against the phase |
| `corepack pnpm local:verify -- --phase5-media --interruption-check` | Could not obtain a reliable terminal result in this verifier session. The sandbox first lacked Docker-socket access; the approved local rerun ended after schema verification with no terminal PASS/FAIL delivery. It did not alter receipt bytes or leave generated verifier containers. |

## Anti-Pattern / Critical Gap

### Receipt binds source files but not their executed outcomes

`scripts/local-verify.mjs` creates receipt results in `phase5ReceiptCandidate()` from a literal string per suite and fixed `tests: 1, passed: 1`. It does not preserve or hash the captured semantic TAP/Playwright/pipeline output, nor derive counts from those outputs. This means a future runner regression, omitted suite execution, or zero-test result could still generate structurally valid receipt entries with the same form.

**Impact:** The Phase 5 full-gate receipt cannot substantiate Roadmap criterion 4, 05-03 Tasks 2–4, or the milestone audit's asserted 27 passing nonzero suite outcomes. The passed audit is correctly ordered and byte-cited but not substantively supported.

**Required fix:** Record a canonical redacted semantic output/result object for each suite at execution time; parse actual test/passed/failed/skipped/TODO counts; SHA-256 those actual records; require them to match the receipt entries; test that altered/omitted/zero outputs and false counts prevent receipt creation. Re-run the exact full gate from a clean committed implementation, then create a new receipt and re-audit in later evidence commits. Do not edit the passed milestone audit before a valid replacement receipt exists.

## Residual Live Release Blockers

Regardless of the local receipt gap, production stays `BLOCKED` pending explicit unfreeze authorization, real host baselines and private node link, verified off-host destination/mount identity, activated schedule and alert delivery, recovery-target evidence, TLS/renewal, deployment, and post-release HTTPS smoke with continue/rollback outcome. These were not attempted or claimed.

## Human Verification Required

None. The failure is deterministic from repository source and receipt bytes; no human judgment can turn synthetic result digests into executed-suite evidence.

## Verification Metadata

**Verification approach:** Goal-backward against ROADMAP criterion 1–4, 05-01 through 05-03 must-haves, OPS-01/03/05, G1–G3, INT-01–03, FLOW-07–09, receipt/audit/revision ordering, and canonical release safety.

**Automated checks:** Static GSD checks, receipt verifier, source-digest reconstruction, focused 59-test suite, boundaries, typecheck, and Drizzle generation passed. Receipt outcome-binding check failed.

**Servers:** Untouched. No server/cloud contact, deployment, real mount/systemd/alert/TLS operation, or release transition was performed.

---
*Verified: 2026-08-12T15:46:25Z*

*Verifier: Codex gsd-verifier*
