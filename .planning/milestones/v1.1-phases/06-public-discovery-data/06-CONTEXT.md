# Phase 6: Public Discovery Data — Context

**Gathered:** 2026-08-15
**Status:** Ready for planning
**Mode:** Autonomous from approved v1.1 scope

<domain>
## Phase Boundary

建立公开内容搜索与相关文章的数据、查询、契约和 API 边界。Phase 6 不实现最终搜索页面或相关文章视觉组件；这些属于 Phase 7。

</domain>

<decisions>
## Implementation Decisions

### Search authority

- 继续以现有 published-only repository predicate 为唯一公开可见性权威。
- 搜索字段限于标题、摘要和 Markdown 原文；不得返回原始 Markdown、内部状态、删除时间或后台字段。
- 采用现有 PostgreSQL，在低内容规模下优先简单、可解释的参数化查询；允许使用 PostgreSQL 自带扩展或索引，但不得增加独立搜索服务。

### Query contract

- 查询在服务端规范化，限制 Unicode 字符数、页码和固定 page size；空白查询返回明确的空查询结果而不是全库浏览。
- 中文与英文、通配符字符和组合 Unicode 都必须有自动化覆盖；`%`、`_` 等字符不能逃逸成未授权通配。
- 相关度明确区分标题、摘要、正文命中，随后使用公开时间和 UUID 保证稳定分页。

### Related authority

- 相关文章排除当前文章，只允许已发布、未删除且有公开时间的其他文章。
- 排名优先共享分类，其次共享标签或采用清晰的加权分数；无共享分类/标签时返回空，不伪造“推荐”。
- 返回复用或扩展严格 public card DTO，禁止公开后台关联与内部分数实现细节。

### Verification

- TDD 覆盖草稿/下线/删除泄露、分页稳定性、查询限制、SQL 通配符、中文、排序 tie 和文章状态变化。
- Phase 6 验收只使用本地生成 PostgreSQL，不接触任何服务器。
- 生产发布决定继续为 `BLOCKED`。

### Codex discretion

- 具体 SQL/Drizzle 表达式、索引策略、DTO 文件拆分和 API 路径，只要满足上述边界与现有仓库模式即可由实现阶段决定。

</decisions>

<code_context>
## Existing Code Insights

- `apps/api/src/articles/repository.ts` 与公开列表/详情查询已经拥有 published-only predicate 和稳定分页模式，应优先复用。
- `packages/contracts` 是 Web/API 之间唯一共享 wire authority，新 DTO 必须 strict parse。
- 现有 taxonomy 关联表可作为相关文章得分来源，不应在 Web 端重新推导。
- 数据库测试已具备 runner-owned PostgreSQL 与迁移工具，应扩展现有测试入口而非新增不受管测试数据库。

</code_context>

<specifics>
## Specific Ideas

- 推荐公开 API 形状为 `/public/search?q=...&page=...` 与 `/public/articles/:slug/related`，最终以现有路由命名约定为准。
- 搜索结果卡片尽量复用首页 public card，减少 Phase 7 展示分叉。
- 相关文章默认数量保持小且有硬上限，适配低资源节点和文章详情 SSR。

</specifics>

<deferred>
## Deferred Ideas

- 搜索 UI、导航入口、搜索元数据和相关文章卡片视觉留给 Phase 7。
- 搜索热词、历史、拼写纠正、个性化推荐和行为分析不属于 v1.1。
- 自动保存、定时发布和管理审计属于后续里程碑。

</deferred>
