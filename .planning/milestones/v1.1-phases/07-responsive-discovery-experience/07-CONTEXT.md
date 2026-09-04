# Phase 7: Responsive Discovery Experience - Context

**Gathered:** 2026-08-17
**Status:** Ready for planning

<domain>
## Phase Boundary

在现有公共前台中交付响应式搜索入口、搜索结果页和文章详情相关文章区域。页面必须在手机、平板和桌面端保持完整能力，消费 Phase 6 的严格公开 API，并覆盖正常、空、无结果、无效和服务异常状态。本阶段不增加搜索联想、搜索历史、个性化推荐或新的后端排序能力。

</domain>

<decisions>
## Implementation Decisions

### Search Entry

- **D-01:** 桌面端在公共导航区域提供可直接输入的搜索框，不采用仅图标或弹窗式入口。
- **D-02:** 手机与窄屏端把搜索操作放入现有折叠菜单，通过明确的搜索按钮或表单入口进入；不得为了紧凑布局隐藏搜索能力。
- **D-03:** 搜索入口使用标准 GET 表单语义和可见标签，支持键盘、触控以及无 JavaScript 提交；现有 Escape、焦点和菜单关闭行为继续有效。

### Search Interaction and URL

- **D-04:** 用户提交后进入 `/search?q=...`，后续分页使用明确的 `page` 查询参数；不实现边输入边请求、自动补全或搜索建议。
- **D-05:** 结果页提供当前查询、结果数量、分页、清除搜索和返回浏览等明确操作，复用已有分页模式而不是无限滚动。
- **D-06:** 浏览器只通过同源入口访问数据；SSR/服务端数据获取继续使用现有内部 API helper 和严格 contracts。
- **D-07:** 搜索页始终采用受控 `noindex,follow` 策略，不加入 Sitemap；canonical 只根据规范化且允许的查询形状生成，畸形、重复或未知参数不得产生可索引页面。

### Search Results and States

- **D-08:** 搜索结果复用现有文章卡片的排版、日期、分类、标签和阅读链接语言，但创建更紧凑的展示变体，避免首页大卡片在结果页造成过长滚动。
- **D-09:** 桌面、平板和手机都使用同一内容顺序和信息集合；布局可以响应式变化，但不得在窄屏删除结果信息或操作。
- **D-10:** 空查询、无结果、无效查询、页码越界、服务异常和普通结果分别呈现诚实状态。错误状态保留继续导航、重试或清除查询的路径，不把上游故障伪装成无结果。

### Related Articles

- **D-11:** 文章详情正文之后展示相关文章；桌面使用两列紧凑卡片，手机使用单列，平板根据可用宽度自然折行。
- **D-12:** 相关文章卡片沿用搜索结果的紧凑视觉语言和严格 public card 数据，不公开得分、匹配字段、共享数量或任何后台元数据。
- **D-13:** API 返回真实匹配时才渲染整个相关文章区域；无匹配时整块隐藏，不显示空占位，也不填充无关文章。
- **D-14:** 相关文章请求失败必须与“无匹配”区分；页面正文仍可阅读，相关区域采用克制且可恢复的失败表达，不把文章本身变为 404。

### Responsive and Theme Behavior

- **D-15:** 延续现有 `700px` 和 `1023px` 响应式层级、浅色/深色/跟随系统主题、44px 最小交互尺寸、可见焦点以及 reduced-motion 规则。
- **D-16:** 搜索页和相关文章必须用真实浏览器验证手机、平板和桌面宽度，并证明所有浏览器请求保持同源 `/api`，不暴露副服务器地址。

### the agent's Discretion

- 搜索图标、按钮文字、紧凑卡片内部间距、桌面输入框具体宽度以及相关文章标题文案，可在保持现有编辑感视觉、可访问语义和上述行为的前提下由设计与实现阶段确定。
- 服务异常区域的具体重试控件可选择标准链接、按钮或页面刷新，但必须保留键盘能力和诚实状态。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product and Phase Contract

- `.planning/ROADMAP.md` — Phase 7 goal and five responsive discovery success criteria.
- `.planning/REQUIREMENTS.md` — SRCH-01, SRCH-02, READ-08 and READ-09 traceability plus mobile/desktop, SEO and same-origin constraints.
- `.planning/PROJECT.md` — local-first topology, frozen production boundary, low-resource limits and existing responsive public-shell decisions.

### Data and Runtime Authority

- `.planning/phases/06-public-discovery-data/06-CONTEXT.md` — locked search/related visibility, ranking, query and no-fabricated-recommendation decisions.
- `.planning/phases/06-public-discovery-data/06-VERIFICATION.md` — independently verified Phase 6 contracts, fixed `3100` runtime and strict failure semantics.

No external design specification was provided; the decisions in this context are the Phase 7 UI contract.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `apps/web/app/_components/PublicHeader.tsx`: existing desktop navigation, compact menu, Escape/focus restoration and private-surface exclusion; add search without creating a second header.
- `apps/web/app/_components/PostCard.tsx`: established public-card semantics and typography; extract or extend a compact variant instead of duplicating DTO rendering.
- `apps/web/app/_components/Pagination.tsx`: stable accessible pagination suitable for `/search?q=...&page=...` when query preservation is added.
- `apps/web/app/lib/api.ts`: strict server-side `PublicResult` handling and internal API origin; add search/related helpers here.
- `apps/web/app/lib/site-metadata.ts`: existing canonical/noindex utilities and strict public origin handling; extend with query-aware search metadata rather than inventing a second SEO authority.

### Established Patterns

- Next App Router pages fetch on the server with `cache: "no-store"`, parse shared contracts, and distinguish `ok`, `not_found` and `upstream_error`.
- `public.module.css` owns the public visual system, themes, focus styles and responsive breakpoints at 700px/1023px.
- Public navigation progressively enhances from ordinary links/forms; compact JavaScript behavior cannot be required for basic discovery.
- Sitemap enumerates explicit public routes and distribution data, so `/search` remains absent by construction.

### Integration Points

- Add the search route under `apps/web/app/search/page.tsx` and connect it to Phase 6 `/public/search` through `apps/web/app/lib/api.ts`.
- Add the navigation search entry inside `PublicHeader.tsx`, preserving current menu tab behavior at compact widths.
- Extend `apps/web/app/posts/[slug]/page.tsx` after the article body with Phase 6 `/public/articles/:slug/related` data.
- Extend Playwright coverage under `apps/web/e2e/` for responsive layout, state handling, keyboard navigation, SEO and same-origin requests.

</code_context>

<specifics>
## Specific Ideas

- 搜索体验是明确提交和分页式浏览，不是即时搜索应用。
- 结果页应比首页文章列表紧凑，但保持 Blog X 当前克制、编辑感的视觉语言。
- 相关文章是正文后的延伸阅读区域；真实无匹配时完全不出现。

</specifics>

<deferred>
## Deferred Ideas

- 搜索联想、自动补全、拼写纠正、搜索历史和热门词不属于 v1.1。
- 个性化推荐、行为追踪和无重叠内容填充不属于本阶段。
- Phase 8 负责把 Phase 7 完成后的界面纳入固定 `3100` 一键刷新和 v1.1 全量收据。

</deferred>

---

*Phase: 07-responsive-discovery-experience*
*Context gathered: 2026-08-17*
