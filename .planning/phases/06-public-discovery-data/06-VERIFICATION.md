---
phase: 06-public-discovery-data
verified: 2026-08-15T12:57:00Z
status: gaps_found
score: 19/20 must-haves verified
behavior_unverified: 0
---

# Phase 6: Public Discovery Data Verification Report

**Phase Goal:** 访客搜索和相关文章获得严格、稳定、低资源且不泄露非公开状态的数据基础。
**Verified:** 2026-08-15T12:57:00Z
**Status:** gaps_found

## Verification Verdict

Phase 6 的四项产品需求和 ROADMAP 的四条数据能力成功标准均由真实 PostgreSQL、Fastify 路由、严格 contracts 和独立三参数门禁验证通过。当前唯一阻塞项是 06-03 明确承诺的固定本地运行时刷新没有完成：`blogxlocal` 三项服务虽然健康，但仍运行旧镜像，`http://127.0.0.1:3100/api/public/search?q=` 和相关文章路由均返回 Fastify 默认 404。

该运行时缺口不能仅通过记录“Phase 8 负责离线刷新”来豁免。06-03 的 must-have、success criterion 和输出目标都明确要求最新验证 revision 在固定 `3100` 可观察；而 Phase 7 还需要通过该同源入口集成和浏览器验证搜索/相关文章 UI。因此 Phase 6 保持 pending，正式 Phase 7 执行应等待最小刷新闭环完成。

## Goal Achievement

### Observable Truths

| # | Plan | Truth | Status | Evidence |
|---|------|-------|--------|----------|
| 1 | 06-01 | 搜索只覆盖具有公开时间的 published、非删除文章，并仅返回严格 public card | ✓ VERIFIED | 独立 generated PostgreSQL suite 验证标题/摘要/Markdown 与 draft/unpublished/deleted/null-time 零泄漏；严格 key-set 断言通过 |
| 2 | 06-01 | 空/Unicode 空白查询不扫描；重复、未知、超长和越界输入失败关闭 | ✓ VERIFIED | contracts 10/10；Fastify empty-query no-scan 与 400 route tests 通过 |
| 3 | 06-01 | raw 256 UTF-16、NFC、80 code points、page 1..100/page size 10 边界准确 | ✓ VERIFIED | `public-discovery.test.ts` normalization/limit cases 全部通过 |
| 4 | 06-01 | `%`、`_`、反斜杠按 literal ILIKE 数据处理；CJK/emoji/case/NFC 行为正确 | ✓ VERIFIED | PostgreSQL hostile-input suite 通过；实现使用绑定 pattern 和显式 `ESCAPE '\\'` |
| 5 | 06-01 | title 3、summary 2、Markdown 1，随后 publishedAt/UUID 稳定排序并共享快照 | ✓ VERIFIED | 排名、ties、重复请求、分页测试通过；repository 使用 repeatable-read/read-only transaction |
| 6 | 06-01 | 搜索资源有固定 LIMIT/OFFSET、批量 hydration、GET limiter、2000ms timeout，且仅 57014 映射 unavailable | ✓ VERIFIED | repository 和 route timeout tests 通过；独立代码检查确认 `SET LOCAL statement_timeout` 与 typed mapping |
| 7 | 06-02 | `/public/search` 严格解析并返回四种一致状态 | ✓ VERIFIED | Fastify/PostgreSQL route suite 与 strict response schema 通过 |
| 8 | 06-02 | distinct 400、typed-only 503、其他异常 exact opaque 500 | ✓ VERIFIED | exact body `{"error":"discovery_error"}` 与 hostile exception non-disclosure tests 通过 |
| 9 | 06-02 | related source 使用 publicPredicate，排除自己，最多四张 public card，隐藏来源统一 404 | ✓ VERIFIED | hidden/unknown/draft/unpublished/deleted/null-time source tests 通过 |
| 10 | 06-02 | related 只返回真实分类/标签 overlap，按 category/tag-count/time/UUID 确定排序，无 overlap 返回空 | ✓ VERIFIED | PostgreSQL related ranking、lifecycle 与 empty-overlap tests 通过 |
| 11 | 06-02 | 搜索和相关文章不泄露 Markdown、UUID、score、内部关联或生命周期字段 | ✓ VERIFIED | strict card schema、完整 key-set 和 serialized secret-marker tests 通过 |
| 12 | 06-03 | `--phase6-data` 使用独立 generated namespace，严格执行 suites 并只清理自身 | ✓ VERIFIED | 独立重跑 gate；父 namespace `blogxverify_0327a50deab2` 通过，结束后无 `blogxverify_*` container/volume |
| 13 | 06-03 | `--interruption-check` 真实杀死命名迁移进程并完成双 retry、sentinel/schema/volume/lock 恢复 | ✓ VERIFIED | 独立 exact three-flag gate 输出完整 interruption lifecycle 并 exit 0 |
| 14 | 06-03 | `--parallel-check` 启动两个不同 child namespace/port，执行真实 Phase 6 suites 且无 receipt authority | ✓ VERIFIED | `blogxverify_d1086e9cbf6d` 与 `blogxverify_212c63e8d082` 均输出 data-pass/BLOCKED marker 并清理 |
| 15 | 06-03 | gate 包含 build/typecheck/schema/ledger/regressions/boundaries 和 canonical BLOCKED，且不写 receipt | ✓ VERIFIED | exact gate exit 0；独立 typecheck/boundary/release checks 通过；工作区和 retained receipt 无变化 |
| 16 | 06-03 | Phase 6 selection 与 Phase 5 receipt writer 分离，完整 v1 archive 保持不变 | ✓ VERIFIED | local-verifier 27/27；`git diff --exit-code` 对 milestone archive/receipt 为净；最近 archive commit 仍为 `61cb903` |
| 17 | 06-03 | generated gate 前后固定 `blogxlocal` 身份、业务数据、sequence、ledger、media 不变 | ✓ VERIFIED | 独立 gate 前后容器 ID/image ID/startedAt 与 `/private/tmp/blog-x-phase6-pre-refresh.txt` 完全一致；三项服务健康 |
| 18 | 06-03 | 缓存不足时 refresh 在迁移/重建前失败关闭，不破坏固定环境 | ✓ VERIFIED | formal Docker build 为 `network: none`；缺失 frozen-install cache 后记录 `OFFLINE CACHE MISSING`，runtime/migration/volume action 均为 none |
| 19 | 06-03 | 最新验证 revision 在固定 `3100` 通过 health、公开页面、empty search、unknown related 检查 | ✗ FAILED | `/api/health` 为 200，但 empty search 与 related 均为默认 route-not-found 404；当前 API/Web 容器仍是旧 image IDs，未承载 `588e959`/当前 HEAD |
| 20 | 06-03 | executor 只交付 summaries，保持 requirements/status 未完成、生产 BLOCKED 且不接触服务器 | ✓ VERIFIED | REQUIREMENTS/ROADMAP/STATE 未被 executor 标完成；canonical gate 输出 `RELEASE BLOCKED`；本次验证无 SSH/cloud/deploy |

**Score:** 19/20 must-have truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/contracts/src/public-discovery.ts` | 严格 discovery contracts/limits/errors | ✓ EXISTS + SUBSTANTIVE | constants、NFC query schema、coherent states、strict related/error schemas 均存在并被 API 使用 |
| `apps/api/src/content/public-repository.ts` | published-only search 与 deterministic related authority | ✓ EXISTS + SUBSTANTIVE | publicPredicate、literal pattern、snapshot pagination、ranking、hydration 和 related query 已连线 |
| `apps/api/src/routes/public-posts.ts` | strict search/related Fastify routes | ✓ EXISTS + SUBSTANTIVE | 两条 GET route、typed 503、route-local opaque 500 均存在并在 generated runtime 测试通过 |
| `apps/api/test/public-discovery.test.ts` | PostgreSQL/route/confidentiality evidence | ✓ EXISTS + SUBSTANTIVE | search/related/ranking/leak/error/route 行为均有非零测试 |
| `scripts/local-verify.mjs` | isolated Phase 6 gate/interruption/parallel/BLOCKED | ✓ EXISTS + SUBSTANTIVE | exact gate 独立重跑通过 |
| `scripts/local-verify.test.mjs` | selection/no-receipt/cleanup regression | ✓ EXISTS + SUBSTANTIVE | 27/27 通过 |

**Artifacts:** 6/6 verified

### Key Link Verification

| Connection | Status | Details |
|------------|--------|---------|
| discovery contracts → existing public card | ✓ WIRED | 复用 `publicPostListItemSchema`，无第二套 public projection |
| repository search/related → schema/publicPredicate | ✓ WIRED | source、candidate、count、rows 在匹配/排序前受同一公开谓词约束 |
| routes → strict contracts → repository | ✓ WIRED | query/params、success 和 error schemas 均在 handler 边界使用 |
| Phase 6 gate → PostgreSQL suites/Compose/boundaries/release gate | ✓ WIRED | parent 与两 child 的真实 generated runs 均通过 |
| fixed `blogxlocal` Compose → latest verified revision at `3100` | ✗ NOT WIRED AT RUNTIME | Compose 定义存在，但 offline formal build 未产出 revision-tagged image，固定容器仍运行旧镜像 |

**Wiring:** 10/11 plan key links verified; the one runtime/provenance link is blocked.

## Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| SRCH-01 | ✓ SATISFIED IN IMPLEMENTATION | published-only PostgreSQL search across title/summary/Markdown；hidden states and fields zero-leak |
| SRCH-02 | ✓ SATISFIED IN IMPLEMENTATION | multilingual/NFC/literal wildcard/limits/stable pagination/state/error tests pass |
| SRCH-03 | ✓ SATISFIED IN IMPLEMENTATION | exact 3/2/1 rank plus publication/UUID tie order and repeatable-read snapshot pass |
| READ-08 | ✓ SATISFIED IN IMPLEMENTATION | related source/candidates public-only, real overlap, deterministic order, fixed cap pass |

**Coverage:** 4/4 product requirements satisfied by implementation and generated runtime evidence. They must remain formally pending until the Phase 6 runtime-observability gap is closed and Phase 6 is reverified.

## Automated Evidence

- `corepack pnpm --filter @blog-x/contracts test` — 10 passed, 0 failed/skipped/TODO/cancelled.
- `node --test scripts/local-verify.test.mjs` — 27 passed, 0 failed/skipped/TODO/cancelled.
- `corepack pnpm -r typecheck` — contracts/API/Web passed.
- `node scripts/check-boundaries.mjs` — 328 files checked, 0 findings.
- `corepack pnpm local:verify -- --phase6-data` — generated PostgreSQL/public-boundary gate passed and ended `RELEASE BLOCKED`.
- Exact `corepack pnpm local:verify -- --phase6-data --interruption-check --parallel-check` — exit 0; real interruption recovery, parent pass, two child passes, exact cleanup, no receipt.
- `node scripts/release-gate.mjs --evidence=ops/release-evidence.blocked.json --expect-blocked` — canonical `RELEASE BLOCKED` with live-production facts unresolved.
- Fixed runtime inspection — Web/API/PostgreSQL healthy and unchanged, but Phase 6 search route remains default 404.
- `verify-summary` for 06-03 correctly fails because the self-check heading is `PASSED WITH SAFE REFRESH BLOCK`; this is consistent with the unresolved runtime success criterion.

## Prohibitions and Safety

- No search daemon, pg_trgm/GIN migration, browser database access, public data plane, or new resident service was introduced.
- Literal wildcard/SQL-shaped queries and hostile exception messages are covered by passing tests; no hidden state or topology field is exposed.
- Exact gate did not mutate `.planning/milestones` or `ops/phase5-full-gate-receipt.json`, did not leave generated containers/volumes, and did not acquire receipt authority.
- No local volume was deleted or recreated; the fixed `blogxlocal` runtime was not mutated after refresh preflight failed.
- No SSH, server, cloud, deployment, unfreeze, or production transition was performed. Production remains `BLOCKED`.

## Anti-Patterns Found

No product-code stubs or placeholder implementations were found. One delivery/evidence mismatch is blocking: the plan statically links Compose to `3100`, but no current-revision image is actually running there.

## Human Verification Required

None. The blocking condition is machine-observable and reproduced as an exact 404 response.

## Gaps Summary

### Critical Gap

1. **Fixed `3100` runtime is healthy but stale**
   - Missing: a source-proven, fully offline Web/API build and safe `blogxlocal` refresh from the verified revision.
   - Cause: `compose.yaml` correctly sets formal builds to `network: none`, but the Dockerfiles require `corepack pnpm install --frozen-lockfile` and the required classic install cache layer is absent. The executor correctly stopped before mutation.
   - Impact: 06-03's explicit must-have and phase success criterion are false; visitors and Phase 7 browser tests cannot reach the new search/related APIs through the fixed same-origin entry.
   - Authority: Phase 8 owns the reusable one-command delivery system, but that future ownership does not waive this Phase 6 acceptance criterion. A minimal closure can establish the durable offline primitive now and Phase 8 can harden/generalize it later.

## Recommended Fix Plan

### 06-04-PLAN.md: Durable Offline Fixed-Runtime Refresh

**Objective:** build the verified Phase 6 revision without registry access and make it observable at fixed `blogxlocal`/`3100` while preserving all local data.

**Tasks:**

1. Add a source-proven offline dependency/build authority that works with Docker `network: none` even when the classic frozen-install layer is absent; reject stale/unknown images and all network fallback.
2. From a clean committed revision, build revision-tagged Web/API images, retain exact PostgreSQL/media volumes and business/sequence/ledger/media facts, run idempotent migration/schema verification, and recreate only fixed `blogxlocal` Web/API services.
3. Verify container image/revision provenance plus Web-origin home/category/tag/archive, `/api/health`, empty search 200, and strict hidden/unknown related 404; confirm fixed data identities, v1 archive, receipt and production `BLOCKED` remain unchanged, then re-run the independent Phase 6 verifier.

**Estimated scope:** Medium

**Phase 7 disposition:** Do not formally execute/complete Phase 7 yet. Planning may continue, but the Phase 6 dependency and fixed same-origin runtime must be closed before Phase 7 browser integration evidence is authoritative.

## Verification Metadata

**Verification approach:** Goal-backward, all PLAN frontmatter must-haves plus ROADMAP success criteria
**Automated checks:** product contracts, PostgreSQL/Fastify semantics, local verifier, typecheck, boundaries, exact interruption/parallel gate, cleanup, release gate and fixed-runtime route checks
**Automated result:** all implementation/data checks passed; 1 fixed-runtime observability check failed
**Human checks required:** 0
**Servers contacted:** 0

---
*Verified: 2026-08-15T12:57:00Z*
*Verifier: independent Phase 6 GSD verifier*
