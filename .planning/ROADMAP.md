# Roadmap: Blog X

## Milestones

- ✅ **v1.0 Local MVP** — Phases 1–5（shipped 2026-08-15）
- 🚧 **v1.1 Content Discovery** — Phases 6–8（in progress）

## Archived Milestone

<details>
<summary>✅ v1.0 Local MVP（Phases 1–5，26 plans）— SHIPPED 2026-08-15</summary>

完整路线、需求、审计和逐计划执行记录位于 `.planning/milestones/`。

</details>

## v1.1 Phases

- [ ] **Phase 6: Public Discovery Data** — 建立仅公开内容的低资源搜索与确定性相关文章数据边界。
- [ ] **Phase 7: Responsive Discovery Experience** — 交付搜索入口、结果页和文章相关文章的响应式访客体验。
- [ ] **Phase 8: Reliable Local Delivery** — 固化离线优先的本地更新、健康验证和 v1.1 全量验收。

### Phase 6: Public Discovery Data

**Goal:** 访客搜索和相关文章获得严格、稳定、低资源且不泄露非公开状态的数据基础。
**Mode:** mvp
**Depends on:** Shipped Local MVP baseline
**Requirements:** SRCH-01, SRCH-02, SRCH-03, READ-08
**UI hint:** no
**Plans:** 8 active plans (+ 3 superseded drafts)

Plans:
- [x] 06-01-PLAN.md — Define strict public search contracts and published-only query semantics.
- [x] 06-02-PLAN.md — Implement deterministic related-article data and API boundaries.
- [x] 06-03-PLAN.md — Run isolated Phase 6 data gates and detect the stale fixed runtime.
- [x] 06-04-PLAN.md — Build sanitized offline API/Web refresh primitives.
- 06-05-PLAN.md — Superseded after its one allowed `b7fa05c` invocation safely exposed the missing live adapter.
- [x] 06-06-PLAN.md — Implement the first strict live-adapter revision without runtime mutation.
- 06-07-PLAN.md — Superseded before execution at `3221f99`; audit stopped before bare invocation, claim, evidence or mutation.
- [x] 06-08-PLAN.md — Remediate the first audited P0/P1 live-adapter and evidence gap set under TDD.
- 06-09-PLAN.md — Superseded before execution at `df4aa3b`; second audit stopped before bare invocation, claim, evidence or mutation.
- [ ] 06-10-PLAN.md — Close all five remaining evidence, failure, authority, sealing and atomic-publication blockers under TDD.
- [ ] 06-11-PLAN.md — Execute the next clean revision exactly once, commit v4 evidence/docs, and hand off independent verification.

**Success Criteria:**

1. 参数化查询只返回已发布、未删除且具有公开时间的文章，覆盖标题、摘要和 Markdown 正文。
2. 中文与英文查询、长度/分页上限、空查询和特殊字符均失败关闭且不会触发无界扫描或 SQL 注入。
3. 排序规则可解释且确定：标题优先于摘要和正文，相关度相同后按公开时间和 UUID 稳定排序。
4. 相关文章排除当前文章和所有非公开文章，按共享分类/标签得分与稳定次序返回。

### Phase 7: Responsive Discovery Experience

**Goal:** 访客在手机和桌面端都能从公共导航搜索内容，并在阅读后继续发现相关文章。
**Mode:** mvp
**Depends on:** Phase 6
**Requirements:** SRCH-01, SRCH-02, READ-08, READ-09
**UI hint:** yes
**Success Criteria:**

1. 公共导航提供可键盘访问的搜索入口，搜索页具有明确查询、结果计数、分页和清除/返回操作。
2. 空查询、无结果、无效查询、服务异常和普通结果均有诚实且可继续导航的状态。
3. 文章详情在存在真实匹配时展示相关文章卡片；无匹配时不伪造推荐或泄露后台字段。
4. 搜索与相关文章适配现有主题以及手机、平板、桌面布局，并通过真实浏览器的同源请求检查。
5. 搜索页采用受控 canonical/noindex 策略且不进入 Sitemap，既有 RSS/SEO 输出保持不变。

### Phase 8: Reliable Local Delivery

**Goal:** 每个大步骤完成后，最新代码都能安全、可复现地出现在固定 `3100` 环境并获得机器可读验证。
**Mode:** mvp
**Depends on:** Phase 7
**Requirements:** DEVX-01, DEVX-02, DEVX-03
**UI hint:** no
**Success Criteria:**

1. 单一命令固定使用 `blogxlocal` 项目名，重建 Web/API、保留数据库和媒体卷、执行迁移并等待三个健康状态。
2. registry DNS 不可用时可从已安装依赖离线刷新；构建始终把公开 URL 固化为 `http://127.0.0.1:3100` 而非临时验收端口。
3. 脚本拒绝错误项目名、意外新卷、脏工作区或无法证明来源的镜像，不会删除非目标容器和数据。
4. v1.1 完整验收覆盖搜索、相关文章、响应式界面、边界和本地展示更新，并在结束后验证当前 `3100` 的主要路由。
5. 所有本地检查成功后生产决定仍为 `BLOCKED`，不产生 SSH、部署或云服务器修改能力。

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 6. Public Discovery Data | v1.1 | 6/8 active | Second audit remediation planned | — |
| 7. Responsive Discovery Experience | v1.1 | 0/? | Not started | — |
| 8. Reliable Local Delivery | v1.1 | 0/? | Not started | — |
