# Roadmap: Blog X

## Milestones

- ✅ **v1.0 Local MVP** — Phases 1–5 (shipped 2026-08-15)
- ✅ **v1.1 Content Discovery** — Phases 6–8 (shipped 2026-09-04)
- 🚧 **v1.2 Publishing Quality** — Phases 9–10 (in progress)

## Phases

<details>
<summary>✅ v1.0 Local MVP (Phases 1–5, 26 plans) — SHIPPED 2026-08-15</summary>

- [x] **Phase 1: Publishing Loop**
- [x] **Phase 2: Reading Experience**
- [x] **Phase 3: Distribution and Export**
- [x] **Phase 4: Security, Backup and Release Gates**
- [x] **Phase 5: Local MVP Closeout**

</details>

<details>
<summary>✅ v1.1 Content Discovery (Phases 6–8, 24 plans) — SHIPPED 2026-09-04</summary>

- [x] **Phase 6: Public Discovery Data** — completed 2026-08-17
- [x] **Phase 7: Responsive Discovery Experience** — completed 2026-08-19
- [x] **Phase 8: Reliable Local Delivery** — completed 2026-08-30

</details>

### 🚧 v1.2 Publishing Quality (In Progress)

**Milestone Goal:** 让博主可以安全地预约文章发布，并让已公开文章向搜索引擎提供严格、可验证的结构化数据。

- [ ] **Phase 9: Public Article Structured Data** - 已发布文章输出安全且与可见内容一致的 `BlogPosting` JSON-LD，其他页面不输出。
- [ ] **Phase 10: Controlled Scheduled Publishing** - 管理员可预约、改期和取消发布，本地有界任务在并发与失败下仍安全收敛。

## Phase Details

### Phase 9: Public Article Structured Data

**Goal**: 搜索引擎只能从真实公开文章页获得与读者所见内容一致的安全结构化数据。
**Depends on**: Phase 8
**Requirements**: SEO-03, SEO-04, SEO-05
**Success Criteria** (what must be TRUE):
  1. 访客打开已发布文章时，页面含有可解析的 Schema.org `BlogPosting` JSON-LD，其标题、摘要、时间与 canonical URL 均与页面可见内容一致。
  2. 访客获得的 JSON-LD 只含来自严格公开投影的字段，不会泄露 Markdown 源文、内部地址、存储路径或管理状态。
  3. 草稿、已下线、已删除、未知文章和非文章页面不输出文章 JSON-LD，含 `</script>` 等输入也无法逃逸受控序列化边界。
**Plans**: TBD

### Phase 10: Controlled Scheduled Publishing

**Goal**: 管理员可在不提前泄露内容的前提下安全预约发布，并由本地受控任务仅一次地公开到期草稿。
**Depends on**: Phase 9
**Requirements**: CONT-05, CONT-06, CONT-07, CONT-08
**Success Criteria** (what must be TRUE):
  1. 已登录管理员可在手机、平板和桌面端为草稿设置未来发布时间，看到明确时区，并在到期前查看、改期或取消计划。
  2. 已预约但未到期的文章不会出现在首页、搜索、分类、标签、归档、RSS、Sitemap 或相关阅读中，直接访问也不会泄露内容。
  3. 本地单次任务只扫描有界数量的已到期草稿；重试或并发执行不会重复发布，且首次公开时间与稳定 slug 语义保持不变。
  4. 预约、改期、取消和到期发布都受既有单管理员认证与审计边界保护；无效时间、非草稿状态或部分失败会失败关闭并产生可观测的非零失败结果。
  5. 管理员与访客可在固定 `http://127.0.0.1:3100` 本地生成环境验证完整闭环，生产调度和发布决定始终保持 `BLOCKED`。
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:** Phase 9 → Phase 10

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 9. Public Article Structured Data | v1.2 | 0/TBD | Not started | - |
| 10. Controlled Scheduled Publishing | v1.2 | 0/TBD | Not started | - |

Complete prior milestone plans, requirements and phase records are archived under `.planning/milestones/`.
