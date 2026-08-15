# Requirements: Blog X v1.1 Content Discovery

**Defined:** 2026-08-15  
**Core Value:** 博主能够可靠地发布和保存 Markdown 内容，访客能够持续、快速地通过博客域名阅读已发布文章。

## v1.1 Requirements

### Search

- [ ] **SRCH-01**: 访客可按标题、摘要和 Markdown 正文搜索已发布文章；草稿、下线和已删除文章永不出现在结果中。
- [ ] **SRCH-02**: 搜索支持中文与英文普通查询、稳定分页、明确的空查询/无结果/服务异常状态，并限制查询长度和资源消耗。
- [ ] **SRCH-03**: 搜索结果按可解释且确定性的相关度排序，标题匹配优先于摘要和正文，排序相同时使用稳定公开时间与 UUID 次序。

### Related Reading

- [ ] **READ-08**: 文章详情展示仅含其他已发布文章的相关文章，优先共享分类与标签，并在分数相同时保持确定性顺序。
- [ ] **READ-09**: 相关文章在无匹配、文章状态变化及手机/桌面布局下保持诚实、可访问且不会泄露非公开元数据。

### Local Delivery

- [ ] **DEVX-01**: 开发者可用一条固定命令更新 `blogxlocal` Web/API，保留 PostgreSQL 与媒体卷，执行幂等迁移并等待健康状态。
- [ ] **DEVX-02**: 本地更新在 registry 不可用时优先复用已安装依赖完成离线构建，且不会误建另一 Compose 项目或把临时验收 URL 固化到 `3100`。
- [ ] **DEVX-03**: 每个 v1.1 大步骤完成后，自动化验收必须检查当前 Git revision 对应的本地页面、API 健康和主要公开路由，并报告可见变化。

## Acceptance Constraints

- 搜索与相关文章只使用现有 PostgreSQL，不引入 Elasticsearch、Meilisearch 或其他常驻搜索服务。
- 浏览器继续只访问同源 Web 入口；搜索 API、媒体和文章请求不暴露副服务器地址。
- 所有新页面与组件必须适配手机、平板和桌面，并支持现有浅色/深色/跟随系统主题。
- 搜索页不得进入 Sitemap；无效或非规范查询必须采用明确的 canonical/noindex 策略。
- 主服务器保持冻结，生产发布状态保持 `BLOCKED`；v1.1 的完成只代表本地实现与验收完成。

## Out of Scope

| Feature | Reason |
|---------|--------|
| 个性化推荐与用户画像 | 当前没有访客账户，且不符合隐私与低资源约束 |
| 外部搜索集群 | 两台低配置服务器不适合新增常驻重型服务 |
| 搜索历史、热门词与行为追踪 | 需先明确隐私策略与统计口径 |
| 自动保存、定时发布与审计日志 | 保留为后续里程碑，不与内容发现范围混合 |
| 生产部署与主服务器更新 | 备案审查冻结与真实发布门禁尚未解除 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SRCH-01 | Phase 6 | Pending |
| SRCH-02 | Phase 6 | Pending |
| SRCH-03 | Phase 6 | Pending |
| READ-08 | Phase 6 | Pending |
| READ-09 | Phase 7 | Pending |
| DEVX-01 | Phase 8 | Pending |
| DEVX-02 | Phase 8 | Pending |
| DEVX-03 | Phase 8 | Pending |

**Coverage:**

- v1.1 requirements: 8 total
- Mapped to phases: 8
- Complete: 0
- Unmapped: 0 ✓

---
*Requirements defined: 2026-08-15 for v1.1 Content Discovery*
