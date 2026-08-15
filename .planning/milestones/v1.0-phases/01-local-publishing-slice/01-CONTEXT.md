# Phase 1: Local Publishing Slice - Context

**Gathered:** 2026-08-05
**Status:** Ready for planning

<domain>
## Phase Boundary

本阶段只交付本地可运行的首个端到端发布切片：单管理员登录、Markdown 文章创建与预览、草稿/发布/下线/删除状态、公开首页列表和文章固定链接阅读。分类标签、图片上传、完整主题系统、SEO/RSS、备份恢复及生产部署分别属于后续阶段。

</domain>

<decisions>
## Implementation Decisions

### Public Reading Shape
- **D-01:** 首个首页采用简洁的编辑型文章列表，默认按发布时间倒序，优先显示标题、摘要、日期和基础内容状态，不采用图片瀑布流或仪表盘式布局。
- **D-02:** 文章详情以无干扰阅读和中英文技术内容排版为优先，代码块、表格、引用、链接和图片必须在首个切片正确呈现。
- **D-03:** 首页使用明确分页而不是无限滚动，便于稳定 URL、可访问性和后续 SEO。

### Administrator Access
- **D-04:** 首期只允许一个管理员账号，不提供注册、多角色、OAuth 或公开找回密码流程。
- **D-05:** 管理员使用账号密码登录，浏览器通过安全、HttpOnly、SameSite Cookie 保持服务端会话；管理页面和所有写操作均要求有效会话。
- **D-06:** 首个管理员通过受控的初始化配置或一次性种子命令创建，明文凭据不得写入仓库或日志。

### Authoring and URL Lifecycle
- **D-07:** Markdown 原文是文章正文的内容源；桌面编辑器提供并排预览，窄屏使用编辑/预览切换。
- **D-08:** 固定链接 slug 默认由标题生成，但管理员可在首次发布前编辑；slug 在所有文章状态中必须唯一。
- **D-09:** 已发布文章修改 slug 必须显式确认，因为该操作会改变公开链接。— **Reversibility:** costly — 变更已发布 URL 后需要重定向和外部链接兼容处理。
- **D-10:** 删除在数据层采用可恢复的软删除，公开查询立即排除被删除内容；永久清理不进入本阶段。

### Publishing Visibility
- **D-11:** 发布操作成功后文章应立即出现在公开首页并可通过固定链接访问，不要求人工重建站点。
- **D-12:** 草稿、已下线和已删除文章仅能在管理员已认证的预览或管理接口中读取，公开接口统一返回不可用结果。
- **D-13:** 发布需要标题、唯一 slug 和非空正文；发布时间在首次发布时写入，后续编辑保留原发布时间并更新修改时间。

### the agent's Discretion
- 在满足本地一键启动、2C2G/2C4G 资源约束和未来双节点部署的前提下选择前后端框架、ORM、数据库迁移工具及 monorepo 工具。
- 选择 Markdown 解析、代码高亮、表单校验和测试库，但必须优先使用维护活跃、依赖克制且可进行服务端安全渲染的方案。
- 设计具体视觉 token、字体栈、间距和空状态文案，同时保持极简编辑型方向。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product Scope
- `.planning/PROJECT.md` — 核心价值、硬约束、范围边界和已确认关键决策。
- `.planning/REQUIREMENTS.md` — Phase 1 的七项可测试需求及完整 v1 追踪关系。
- `.planning/ROADMAP.md` — Phase 1 边界、成功标准和三个计划的顺序。
- `REQUIREMENTS.md` §5.1–5.2, §6 — 原始前台、内容管理和非功能需求。

### Infrastructure and Safety
- `docs/INFRASTRUCTURE.md` §5.1 — 主服务器监管审查冻结；任何后续步骤均不得连接或修改 `47.99.80.8`。
- `docs/INFRASTRUCTURE.md` §3–4, §7–8 — 本地替代主入口、副服务器职责、目标请求链路和生产变更约定。

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `maintenance.html`: 仅作为备案维护页和后续视觉参考，不作为新应用架构基础。
- `backups/hexo-source-20260805.tar.gz`: 后续迁移旧文章、固定链接和媒体时的内容来源；Phase 1 不直接导入。
- `backups/hexo-published-20260805.tar.gz`: 可用于对照旧站公开 URL 与渲染结果；Phase 1 不修改归档。

### Established Patterns
- 当前没有应用代码或既有框架约束，是绿地项目。
- GSD 规划文件和根需求文档是实现的权威输入；敏感凭据不进入仓库。

### Integration Points
- 本地环境同时承担前台入口、后台 UI 和 API 联调。
- 副服务器后续承载持久化服务；Phase 1 代码必须通过环境配置切换数据库/API 地址。
- 主服务器不属于当前集成点，直到用户明确解除冻结。

</code_context>

<specifics>
## Specific Ideas

- 首屏应让访客迅速看到最近文章，而不是先看到复杂个人仪表盘。
- 管理端以“能可靠写完并发布一篇技术文章”为第一体验目标。
- 发布后的公开链接应稳定，slug 变更视为需要谨慎处理的公开契约变更。

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 1-local-publishing-slice*  
*Context gathered: 2026-08-05*
