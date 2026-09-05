# Roadmap: Blog X

## Milestones

- ✅ **v1.0 Local MVP** — Phases 1–5 (shipped 2026-08-15)
- ✅ **v1.1 Content Discovery** — Phases 6–8 (shipped 2026-09-04)
- ✅ **v1.2 Publishing Quality** — Phases 9–10 (shipped 2026-09-05)
- 🚧 **v1.3 Private Insights** — Phases 11–13 (in progress)

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

<details>
<summary>✅ v1.2 Publishing Quality (Phases 9–10, 4 plans) — SHIPPED 2026-09-05</summary>

- [x] **Phase 9: Public Article Structured Data** — completed 2026-09-04
- [x] **Phase 10: Controlled Scheduled Publishing** — completed 2026-09-05

</details>

### 🚧 v1.3 Private Insights (In Progress)

**Milestone Goal:** 在不追踪或识别单个访客的前提下提供可信的内容访问趋势，并把单管理员后台升级为清晰、现代且完整响应式的工作台。

- [x] **Phase 11: Privacy-Safe View Authority** — 匿名、原子且有界地聚合已发布文章浏览量，并纳入保留与恢复边界。 (completed 2026-09-05)
- [ ] **Phase 12: Administrator Insights** — 让管理员通过轻量总览和统计页理解内容表现。
- [ ] **Phase 13: Responsive Admin Workspace and Local Delivery** — 统一后台工作流体验，并以完整本地回归和固定展示交付收口。

## Phase Details

### Phase 11: Privacy-Safe View Authority

**Goal**: 访客打开已发布文章时，系统能够在不保存可识别访问记录的前提下可靠形成可恢复的聚合 PV 趋势。
**Depends on**: Phase 10
**Requirements**: STAT-01, STAT-02, STAT-03, STAT-04, STAT-06
**Success Criteria** (what must be TRUE):

  1. 访客实际打开已发布文章可匿名增加一次 PV；未知或非公开文章保持不可探测且不计数，预加载和可识别爬虫也不计数。
  2. 管理员检查持久化数据时只会看到按文章、上海自然日和粗粒度来源类别汇总的计数，不存在原始事件或任何访客标识，也没有独立访客声明。
  3. 并发请求下总量与来源分项保持一致，匿名写入在滥用、过载或无效请求下有界地失败关闭且不泄露文章状态。
  4. 可重复执行的本地清理会保留最近 400 天每日聚合并移除更早数据，不需要常驻统计服务或第三方平台。
  5. 完整数据库备份恢复后统计聚合逐行等价，而既有 Markdown 便携导出保持兼容且明确不包含统计或访客数据。

**Plans**: 3/3 plans executed

- [x] 11-01-PLAN.md
- [x] 11-02-PLAN.md
- [x] 11-03-PLAN.md

### Phase 12: Administrator Insights

**Goal**: 管理员能够在清晰、轻量的后台视图中理解匿名文章访问趋势并快速进入主要创作流程。
**Depends on**: Phase 11
**Requirements**: STAT-05, ADMN-02
**Success Criteria** (what must be TRUE):

  1. 已登录管理员可切换 7、30、90 或 400 天范围，查看总 PV、每日趋势、热门文章和粗粒度来源分布。
  2. 所有统计视图都明确说明数据是匿名、尽力而为的 PV 趋势，不呈现独立访客或计费级结论。
  3. 未登录访客无法读取统计，管理员统计响应不被缓存，异常和空数据都呈现诚实且可恢复的状态。
  4. 后台首页以有层级的卡片呈现内容工作概况、主要创作入口和访问趋势摘要，而不是平铺同等权重的链接。

**Plans**: 3/3 plans executed

- [x] 12-01-PLAN.md — Define strict authenticated no-store analytics contracts and the current-public aggregate read authority.
- [x] 12-02-PLAN.md — Build the hierarchical administrator dashboard and complete responsive anonymous-PV analytics page.
- [x] 12-03-PLAN.md — Seal exact test ownership, local verification, deep-review reruns, and fixed 3100 delivery evidence.

**UI hint**: yes

### Phase 13: Responsive Admin Workspace and Local Delivery

**Goal**: 管理员在手机、平板和桌面端都能通过一致且可访问的工作台完成既有管理任务，并持续看到经完整回归验证的最新本地版本。
**Depends on**: Phase 12
**Requirements**: ADMN-01, ADMN-03, ADMN-04, ADMN-05, QUAL-01, QUAL-02
**Success Criteria** (what must be TRUE):

  1. 管理员可通过统一后台导航到文章、统计、新建、分类标签、关于和审计页，随时识别当前页和退出；移动导航支持开合、Escape 关闭及正确焦点行为。
  2. 文章列表以紧凑摘要清晰展示标题、状态、时间和详情，危险或低频操作渐进展开，同时保留确认、预约与无脚本提交语义。
  3. 分类标签、关于、审计和统计页共享一致的标题、表单、按钮、卡片及空白、加载、失败反馈，并保留既有脱敏和编辑恢复行为。
  4. 后台在 390、768 和 1280 像素宽度下无横向溢出，主要触控目标至少 44 像素、键盘焦点清晰，并完整支持浅色、深色和跟随系统主题。
  5. 一条本地自动化交付链路证明统计、后台和既有关键流程无回归；每个大步骤后的 `dev` 源码都更新到健康的固定 `http://127.0.0.1:3100` 展示环境，生产决定仍为 `BLOCKED`。

**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 11. Privacy-Safe View Authority | v1.3 | 3/3 | Complete    | 2026-09-05 |
| 12. Administrator Insights | v1.3 | 3/3 | In Progress|  |
| 13. Responsive Admin Workspace and Local Delivery | v1.3 | 0/TBD | Not started | - |

Complete prior milestone plans, requirements and phase records are archived under `.planning/milestones/`.
