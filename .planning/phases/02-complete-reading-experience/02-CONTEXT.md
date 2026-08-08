# Phase 2: Complete Reading Experience - Context

**Gathered:** 2026-08-08
**Status:** Ready for planning

<domain>
## Phase Boundary

本阶段在 Phase 1 发布闭环之上交付完整阅读体验：分类与标签管理及公开浏览、按年月归档、可维护的关于页、文章目录、受校验的同域图片上传、移动端/桌面端响应式导航、浅色/深色/跟随系统主题，以及可区分 404 与服务异常的恢复页面。搜索、评论、RSS、Sitemap、完整 SEO、内容导出、备份恢复和生产部署仍属于后续阶段。

</domain>

<decisions>
## Implementation Decisions

### Content Organization and Discovery
- **D-01:** 每篇文章最多关联一个可选分类，并可关联多个标签；分类和标签各自拥有规范化且全局唯一的 slug。— **Reversibility:** costly — 改为多分类会改变关系模型、管理表单、公开查询和 URL 契约。
- **D-02:** 公开站点提供分类索引、标签索引和各自带明确分页的文章列表；只展示至少关联一篇当前已发布文章的分类或标签，所有列表继续复用 Phase 1 的公开可见性谓词与稳定排序。
- **D-03:** 归档页按年份、月份分组展示已发布文章，默认展开最近年份；它是时间导航而不是新的内容状态或筛选系统。
- **D-04:** 已有关联的分类或标签不能直接删除；管理界面显示关联数量，并要求管理员先移除或重新分配关联，避免静默丢失文章组织信息。
- **D-05:** “关于”是单例 Markdown 页面，支持草稿、认证预览和发布；公开页面仅读取已发布版本，并复用文章的服务端安全 Markdown 渲染器。

### Article Table of Contents
- **D-06:** 目录只收集正文的二级和三级标题，生成确定性的 Unicode 友好锚点；重复标题按出现顺序追加稳定后缀。— **Reversibility:** costly — 锚点发布后可能被外部链接引用，后续更换算法需要兼容旧锚点。
- **D-07:** 宽屏文章页使用正文旁的 sticky 目录，窄屏在正文前显示可折叠且键盘可操作的目录；没有合格标题时不渲染空目录。
- **D-08:** 基础锚点跳转和标题链接不依赖客户端 JavaScript；浏览器支持时渐进增强当前章节高亮，不让高亮逻辑阻塞阅读或服务端渲染。

### Media Upload and Delivery
- **D-09:** 只接受 JPEG、PNG 和 WebP，单文件上限 5 MiB；服务端同时验证声明类型、文件签名、成功解码、像素尺寸和资源上限，拒绝 SVG、动画及伪装文件。
- **D-10:** 上传后纠正方向、移除公开派生图中的元数据、限制最长边为 2400 px 且不放大，并生成面向网页的静态派生图；受保护的源文件保留用于后续重新处理与迁移，公开请求只返回派生图。— **Reversibility:** costly — 媒体布局和备份格式会依赖“源文件 + 公开派生图”的双资产约定。
- **D-11:** 媒体使用不可变的随机标识和服务端记录，不采用原始文件名作为公开路径；浏览器始终通过同域 `/media/...` 访问。开发环境使用本地文件系统适配器，存储边界须允许后续切换到副服务器而不改变文章 Markdown URL。
- **D-12:** Phase 2 只提供上传、选择和插入文章的可靠路径，不提供可能破坏已发布文章的永久媒体删除；未引用文件清理延后到备份与运维阶段评估。

### Responsive Theme and Recovery States
- **D-13:** 提供浅色、深色和跟随系统三种模式；显式选择保存在浏览器本地，并在首屏绘制前应用，避免主题闪烁。无 JavaScript 时仍按系统偏好和可读的服务端默认样式工作。
- **D-14:** 延续 Phase 1 的极简编辑型视觉语言。公共页头包含文章、分类、标签、归档和关于；窄屏使用键盘可操作的紧凑菜单，不引入底部导航或应用式仪表盘。
- **D-15:** API 明确区分“已确认不存在”和“上游暂时不可用”。前者渲染真正的 404；后者渲染独立的可恢复错误页，提供重试与返回首页导航，不能再把网络失败伪装成 404。
- **D-16:** 分类、标签、归档、关于和错误页面在手机、平板、桌面三档保持完整功能；布局允许视觉重排，但不可隐藏关键内容或管理动作。

### the agent's Discretion
- 在保持现有 CSS Modules、SSR、无障碍焦点样式和编辑型配色的前提下，决定具体 token、字体回退、断点、菜单动画和空状态文案。
- 选择图片解码/转换库和存储接口细节，但不得引入需要常驻独立服务的重型媒体组件。
- 决定当前章节高亮的轻量实现方式及降级策略；目录链接的服务端可用性优先。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product Scope
- `.planning/PROJECT.md` — 核心价值、Phase 1 已验证能力、剩余活动需求和生产冻结约束。
- `.planning/REQUIREMENTS.md` — Phase 2 的 READ-03..07、TAXO-01、MEDIA-01 精确需求及追踪关系。
- `.planning/ROADMAP.md` — Phase 2 目标、边界、成功标准与后续阶段分界。
- `REQUIREMENTS.md` §5.1–5.2, §6 — 原始前台、内容管理和非功能需求基线。

### Prior Decisions and Safety
- `.planning/phases/01-local-publishing-slice/01-CONTEXT.md` — 已锁定的编辑型阅读方向、显式分页、单管理员、Markdown 权威和发布可见性决策。
- `.planning/phases/01-local-publishing-slice/01-VERIFICATION.md` — Phase 1 已验证行为与不可回归边界。
- `.planning/phases/01-local-publishing-slice/01-SECURITY.md` — 已建模的会话、渲染、公开数据和本地运行威胁控制。
- `docs/INFRASTRUCTURE.md` §3–5, §7–8 — 本地替代入口、未来双节点职责、同域链路与主服务器冻结。

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/web/app/_components/PostCard.tsx` — 可扩展分类/标签元数据，并复用于分类、标签和归档列表。
- `apps/web/app/_components/Pagination.tsx` — 可抽取路径感知的明确分页，不改用无限滚动。
- `apps/web/app/_components/ArticleBody.tsx` 与 `apps/web/app/public.module.css` — 已有安全 HTML 注入边界、技术文章排版和响应式基础。
- `apps/api/src/content/markdown.ts` — 预览与公开页共用的服务端解析、高亮和最终清理管线，是标题 ID、目录和图片 URL 策略的唯一扩展点。

### Established Patterns
- `packages/contracts/src/public-posts.ts` 使用严格 Zod allowlist；Phase 2 的分类、标签、目录、关于和错误结果继续由共享契约约束。
- `apps/api/src/content/public-repository.ts` 集中维护已发布、未删除、有发布时间的公开谓词，并以重复读事务提供一致分页。
- `apps/api/src/db/schema.ts` 使用 Drizzle/PostgreSQL、显式唯一索引和保留标识；新增 taxonomy、页面与媒体记录应延续数据库最终约束。
- 公共页面由 Next SSR 通过内部 API origin 读取，浏览器写请求只走相对 `/api`，不得引入副服务器公网地址。

### Integration Points
- `apps/web/app/layout.tsx` 是全局主题初始化与站点框架入口。
- `apps/web/app/posts/[slug]/page.tsx` 需要接入目录布局，并把“未找到”与“服务错误”拆为不同结果。
- `apps/web/app/admin/_components/ArticleEditor.tsx` 是分类、标签、封面媒体选择和 Markdown 插图的管理入口。
- `apps/api/src/routes/admin-posts.ts`、`apps/api/src/routes/public-posts.ts` 和 `apps/api/src/app.ts` 是新管理/公开路由与同域媒体响应的注册点。

</code_context>

<specifics>
## Specific Ideas

- 保持“先看到文章、再发现作者与分类”的内容优先顺序，不把站点做成复杂个人仪表盘。
- 公开媒体 URL 应在未来从本地切换到副服务器存储时仍保持不变。
- 错误体验必须诚实：后端故障不能被展示成“文章不存在”。

</specifics>

<deferred>
## Deferred Ideas

- 未引用媒体自动清理 — 留到 Phase 4 备份、恢复与运维策略一起决定。
- 图片多尺寸 `srcset`、CDN 和高级格式协商 — 当前资源规模下不是 Phase 2 必需能力，可在性能数据出现后增量增加。

</deferred>

---

*Phase: 2-complete-reading-experience*
*Context gathered: 2026-08-08*
