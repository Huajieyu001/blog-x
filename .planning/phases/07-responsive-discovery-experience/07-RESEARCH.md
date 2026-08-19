# Phase 7: Responsive Discovery Experience - Research

**Researched:** 2026-08-17
**Domain:** Next.js App Router server-rendered public discovery UI, strict query/metadata handling, responsive accessibility, and same-origin browser verification
**Confidence:** HIGH
**Research boundary:** Local repository, installed framework documentation, and installed runtimes only. No external network, Docker, server access, deployment, or Git commit was used.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

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

### Deferred Ideas (OUT OF SCOPE)

- 搜索联想、自动补全、拼写纠正、搜索历史和热门词不属于 v1.1。
- 个性化推荐、行为追踪和无重叠内容填充不属于本阶段。
- Phase 8 负责把 Phase 7 完成后的界面纳入固定 `3100` 一键刷新和 v1.1 全量收据。
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SRCH-01 | 访客可按标题、摘要和 Markdown 正文搜索已发布文章；草稿、下线和已删除文章永不出现在结果中。 | Phase 6 已提供严格公开搜索 DTO；Phase 7 只复用 `PublicPostListItem` 紧凑卡片，不增加第二套字段投影，并以隐藏状态标记的浏览器断言守住展示边界。 |
| SRCH-02 | 搜索支持中文与英文普通查询、稳定分页、明确的空查询/无结果/服务异常状态，并限制查询长度和资源消耗。 | Web 层复用共享查询 schema 做失败关闭，SSR helper 消费四态响应，分页保留规范化 `q`，页面分别渲染六类诚实状态，不增加即时请求。 |
| READ-08 | 文章详情展示仅含其他已发布文章的相关文章，优先共享分类与标签，并在分数相同时保持确定性顺序。 | Phase 7 不重排或解释 API 结果，只在非空成功响应时按返回顺序渲染同一紧凑公开卡片。 |
| READ-09 | 相关文章在无匹配、文章状态变化及手机/桌面布局下保持诚实、可访问且不会泄露非公开元数据。 | 相关文章成功空数组完全隐藏、失败局部隔离、正文持续可读；两列/自然折行/单列布局和真实浏览器隐私、语义、同源检查覆盖该要求。 |
</phase_requirements>

## Summary

Phase 7 不需要新的数据能力或依赖。Phase 6 已经交付并独立验证严格的 `GET /public/search` 与 `GET /public/articles/:slug/related`，两者都只返回现有 `PublicPostListItem` 投影；Web 端现有 `getPublic()` 又已把 HTTP、JSON 和 schema 失败统一折叠为 `upstream_error`。因此本阶段应保持一条窄链路：原生 GET 表单或页面 URL → Web 层严格预检 → server component 内部 API helper → strict contract → 现有卡片/分页/metadata/公共视觉系统。 [VERIFIED: `.planning/phases/06-public-discovery-data/06-VERIFICATION.md:25-68`; `apps/web/app/lib/api.ts:24-42`; `packages/contracts/src/public-discovery.ts:90-119`]

主要实现风险不在 API，而在 URL 与展示语义。当前 `pageMetadata()` 把“是否输出 canonical”和“是否 index”绑定在一个 `index` 布尔值上，而搜索页要求 **始终** `noindex,follow`，同时只为合法、规范化、非空且真实存在的页输出 canonical；该 helper 必须向后兼容地拆开这两个决策。其次，Next 页面收到的 `searchParams` 是解码后的普通对象，能保留重复键为数组，却不能区分 `/search?q=%ZZ` 与用户通过表单输入字面 `%ZZ` 生成的 `/search?q=%25ZZ`。本地 Node 24.15.0 探针确认两者解码值都为 `"%ZZ"`，所以畸形百分号编码必须在路由渲染前从原始 search string 判定。 [VERIFIED: installed Next.js docs `apps/web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md:59-117`; local Node probe recorded 2026-08-17; `apps/web/app/lib/site-metadata.ts:50-66`]

**Primary recommendation:** 在现有 Web 架构内完成三层增量：先建立一个共享的严格 search request/canonical resolver（含只匹配 `/search` 的原始编码标记），再扩展现有 Header/PostCard/Pagination/API/metadata 并实现 server-rendered 搜索页与局部隔离的相关文章，最后用无 Docker 的本地严格 API fixture + Playwright 覆盖 375/768/1280、无 JS、主题、状态、SEO、隐私和同源边界。

## Recommended Approach

1. **单一请求模型。** 将解码后的 `Record<string, string | string[] | undefined>` 原样交给 `publicSearchQuerySchema.safeParse()`；不要先挑出 `q/page`，否则 unknown key 会被意外丢弃。重复值仍是数组，因此共享 schema 会失败关闭。原始编码有效性作为一个独立的布尔输入，与 schema 结果共同形成 `invalid | accepted`。 [VERIFIED: `packages/contracts/src/public-discovery.ts:10-29`; installed Next.js page docs `.../page.md:59-117`]
2. **只为畸形编码增加窄 Proxy seam。** 新建与 `app/` 同级的 `apps/web/proxy.ts`，matcher 固定为 `"/search"`；由一个无框架依赖的纯 helper 检查每个 `%` 后是否恰有两个十六进制字符，并对原始 key/value component 执行一次仅用于验证的 `decodeURIComponent`，从而同时拒绝残缺 `%` 和“十六进制形式完整但 UTF-8 非法”的字节序列。Proxy 覆盖写入一个短的内部 request header（例如 `valid|invalid`），使用 `NextResponse.next({request:{headers}})`，不要把该标记作为 response header 暴露给浏览器。Proxy 不读取共享全局、不开网络、不重写 URL。 [VERIFIED: installed Next.js 16.3.0 proxy docs `apps/web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md:11-38,382-438`]
3. **SSR 只消费内部 API helper。** 在 `apps/web/app/lib/api.ts` 新增 `getPublicSearch(query,page)` 和 `getPublicRelatedPosts(slug)`，两者只拼接编码后的路径并复用 `getPublic()`；浏览器不增加 `fetch`、数据库依赖或公网地址。搜索页对 invalid 不发上游请求；accepted（包括空查询）调用 Phase 6 route 并严格解析响应。 [VERIFIED: `apps/web/app/lib/api.ts:24-42,116-134`; `apps/web/next.config.ts:14-19`; `apps/api/src/routes/public-posts.ts:27-55,79-88`]
4. **结果与 metadata 共用一个 loader/resolver。** `/search/page.tsx` 和 `generateMetadata()` 调用同一无副作用函数。Next 16 文档明确 `generateMetadata` 只能位于 Server Component，且其中相同 `fetch` 会跨 metadata/page 自动 memoize；不要为了“复用”把搜索页改成 Client Component。 [VERIFIED: installed Next.js generateMetadata docs `.../generate-metadata.md:42-118`]
5. **canonical 与 robots 解耦。** 扩展 `pageMetadata` 为独立的 `index` 和 `canonical` 决策，保持所有现有调用默认行为不变。Search 永远传 `index:false`；只有 accepted、非空、API `ok` 且状态为 `results` 或第 1 页 `no_results` 时输出规范化 canonical。`page=1` 从 canonical 删除；第 2 页及以后仅在 API 返回真实 `results` 时保留。invalid、empty、out-of-range、upstream error 均无 canonical。 [VERIFIED: `apps/web/app/lib/site-metadata.ts:29-66`; `.planning/phases/07-responsive-discovery-experience/07-UI-SPEC.md`, SEO and Metadata Contract]
6. **UI 以原生文档导航为主。** 一个无状态 `SearchForm` 复用于 Header 和 page；`<form action="/search" method="get">`、可见 label、`type="search"`、`name="q"`、`maxLength={256}`，无 onChange 请求。Header 仍只为菜单增强保留客户端状态，提交时可同步关闭菜单但不能依赖该 handler 才能导航。 [VERIFIED: `.planning/phases/07-responsive-discovery-experience/07-UI-SPEC.md`, Public search entry; `packages/contracts/src/public-discovery.ts:4-8`; `apps/web/app/_components/PublicHeader.tsx:17-80`]
7. **一个卡片 renderer、一个分页 renderer。** `PostCard` 增加紧凑 variant，并让 ordinal/“已发布”装饰仅属于默认 variant；所有公开字段、日期和 taxonomy link 仍在同一文件中。`Pagination` 增加 preserved params 与 `ariaLabel`，用原生 `URLSearchParams` 构造 `q` + page，page 1 省略 `page`；不要复制页面数组算法。 [VERIFIED: `apps/web/app/_components/PostCard.tsx:1-33`; `apps/web/app/_components/Pagination.tsx:4-40`]
8. **相关文章失败只影响相关文章。** 文章详情的现有 `not_found/upstream_error` 决策继续决定正文；只有正文成功后才解释 related outcome。`ok + []` 返回 `null`，`ok + items` 渲染“继续阅读”，`upstream_error` 渲染局部恢复块。不得对 related failure `throw`，否则会触发全页 `ServiceUnavailable` 并隐藏可读正文。 [VERIFIED: `apps/web/app/posts/[slug]/page.tsx:10-50`; `apps/web/app/error.tsx:1-7`; `apps/web/app/_components/ServiceUnavailable.tsx:4-18`]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Header search input/menu keyboard behavior | Browser / Client | Frontend Server (SSR) | Header 的菜单开合、Escape 和 focus restore 已是最小 client island；表单本身必须是原生 GET、SSR 可用。 |
| Search parameter admission | Frontend Server (SSR) | Proxy | 解码后 shape/normalization 由共享 contracts 决定；只有原始百分号编码需要在 route rendering 前观察。 |
| Search/related data fetching | Frontend Server (SSR) | API / Backend | Web server 使用固定内部 origin；Fastify/PostgreSQL 已拥有可见性、排序、资源限制和错误契约。 |
| Search result/related rendering | Frontend Server (SSR) | Browser / Client | 卡片和状态是 server-rendered document content；浏览器只负责普通导航与 CSS 响应式布局。 |
| Search canonical/noindex | Frontend Server (SSR) | — | Metadata 必须基于严格请求 shape 和真实 API outcome，不能由客户端或 request host 推导。 |
| Responsive/theme/focus behavior | Browser / CSS | Frontend Server (semantic markup) | CSS media/theme variables控制布局；HTML 提供表单、heading、article、nav 等语义。 |
| Search ranking/public visibility | API / Backend | Database / Storage | Phase 6 已完成，Phase 7 不重新实现或排序。 |
| Browser acceptance | Browser / Playwright | Local API fixture | 真实 Chromium 验证视觉和交互；严格 fixture 提供所有成功/失败状态且不需要 Docker/云服务器。 |

## Project Constraints (from AGENTS.md)

- 主服务器 `47.99.80.8` 在用户明确解冻前不得连接、部署或修改；本阶段只在本地工作区实现和验证。
- 浏览器必须只访问同一博客 Web origin；不得写入或显示副服务器、公网地址、凭据、数据库拓扑或 `INTERNAL_API_ORIGIN`。
- 2C2G + 2C4G 资源边界排除外部搜索服务、微服务和常驻高内存组件。
- 不写入密码、私钥、令牌或数据库凭据；数据库不得暴露公网。
- 前台必须适配现代手机、平板、桌面与现有主题，维持内容持久性和正式上线门禁。
- 文件修改必须通过 GSD 执行阶段完成；研究只产出本文件。
- `apps/web/AGENTS.md` 要求把训练知识视为过时：实现前阅读仓库安装的 Next.js 16.3.0 文档，并遵守 `params/searchParams` Promise、Server Component metadata 和 `proxy.ts` 当前约定。 [VERIFIED: `AGENTS.md:1-75`; `apps/web/AGENTS.md:1-12`; `apps/web/package.json:12-23`]

## Existing Architecture and Patterns

### Existing authority map

| Concern | Existing authority | Phase 7 use |
|---------|--------------------|-------------|
| Search query/state/error schema | `packages/contracts/src/public-discovery.ts` | 直接 import；Web 不定义第二个 query parser 或响应 union。 |
| Public card DTO | `packages/contracts/src/public-posts.ts` | Search/related 均继续使用 `PublicPostListItem`。字段原文为 `"title"`, `"summary"`, `"slug"`, `"publishedAt"`, literal `"published"`, optional nullable `"category"`, and `"tags"`. [VERIFIED: `packages/contracts/src/public-posts.ts:19-27`] |
| Server API boundary | `apps/web/app/lib/api.ts` | 新 helper 复用 `getPublic()` 的 `"ok" / "not_found" / "upstream_error"`。 [VERIFIED: `apps/web/app/lib/api.ts:24-42`] |
| Browser-to-API boundary | `apps/web/next.config.ts` | 浏览器可见 API 始终为 `"/api/:path*"`，内部 destination 才使用固定 server origin。 [VERIFIED: `apps/web/next.config.ts:14-19`] |
| Header/menu | `PublicHeader.tsx` | 在同一 nav 中插入 SearchForm，保留 `"(max-width: 1023px)"`、Escape 与 toggle focus。 [VERIFIED: `apps/web/app/_components/PublicHeader.tsx:17-80`] |
| Public card | `PostCard.tsx` | 增加 compact variant；复用固定 `"Asia/Shanghai"` 日期、summary fallback `"暂无摘要"`、taxonomy URLs 与 `"阅读文章"`。 [VERIFIED: `apps/web/app/_components/PostCard.tsx:5-29`] |
| Pagination | `Pagination.tsx` | 保留 visible page set、`aria-current="page"` 和上一/下一页；扩展 href/label。 [VERIFIED: `apps/web/app/_components/Pagination.tsx:4-40`] |
| Metadata | `site-metadata.ts` | 保留 `PUBLIC_ORIGIN` 严格校验与 `pageMetadata`，仅拆分 canonical/index。 [VERIFIED: `apps/web/app/lib/site-metadata.ts:6-27,50-66`] |
| Visual system | `public.module.css` | 继续使用变量 `"--paper"`, `"--surface"`, `"--ink"`, `"--muted"`, `"--line"`, `"--accent"`，断点 `700px/1023px` 和 reduced-motion。 [VERIFIED: `apps/web/app/public.module.css:1-34,358-420`] |
| Article outcome | `posts/[slug]/page.tsx` | 文章 404/上游错误不变；related 是文章成功后的独立 outcome。 [VERIFIED: `apps/web/app/posts/[slug]/page.tsx:10-50`] |
| SEO regression | `site-metadata.test.ts`, `phase3-distribution.spec.ts` | 扩展 noindex/canonical 组合；继续证明 sitemap/RSS 和 same-origin。 [VERIFIED: `apps/web/app/lib/site-metadata.test.ts:40-74`; `apps/web/e2e/phase3-distribution.spec.ts:131-200`] |

### Data-flow diagram

```text
Visitor GET /search?...
  -> Web Proxy (only /search): inspect raw percent encoding; overwrite internal valid/invalid marker
  -> Next Server Component: await decoded searchParams + internal marker
     -> strict publicSearchQuerySchema
        -> invalid: local invalid UI + no canonical + NO API request
        -> accepted: fixed-origin getPublicSearch(encoded q, bounded page)
           -> strict Phase 6 DTO
              -> results/no_results/empty/out-of-range: honest SSR state
              -> HTTP/schema/network failure: scoped search failure state
     -> generateMetadata from the same resolved request/outcome
        -> robots always noindex,follow
        -> canonical only for normalized allowed real page shape

Visitor GET /posts/:slug
  -> getPublicPost(slug)
     -> not_found: existing 404
     -> upstream_error: existing whole-page recovery
     -> ok: render article body
        -> getPublicRelatedPosts(slug)
           -> ok + items: compact related grid
           -> ok + []: render nothing
           -> upstream_error/404/malformed: local related recovery; article stays visible
```

### Server Component boundary

Pages remain Server Components. `PublicHeader` remains the existing Client Component only because it owns `matchMedia`, menu state, Escape, and focus restoration. A pure `SearchForm` imported by it enters the client graph but must contain no effect or fetch; the search page may reuse the same prop-driven markup from a Server Component. Do not add `useSearchParams`, autocomplete state, `useEffect` fetching, loading spinners, or live regions. [VERIFIED: `apps/web/app/_components/PublicHeader.tsx:1-44`; installed Next.js server/client docs `apps/web/node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md:11-40,178-214`]

## Standard Stack

No dependency changes are recommended. Versions below are the repository-pinned and locally installed versions, not a claim about latest registry releases.

### Core

| Library | Version | Purpose | Why Standard Here |
|---------|---------|---------|-------------------|
| Next.js | `16.3.0` | App Router, Server Components, metadata, proxy, same-origin rewrites | Already owns every public page and the Web/API boundary. [VERIFIED: `apps/web/package.json:12-16`] |
| React / React DOM | `19.2.8` | Semantic component rendering and the existing header client island | Already pinned; no additional client state library is needed. [VERIFIED: `apps/web/package.json:12-16`] |
| `@blog-x/contracts` | `workspace:*` | Shared strict Zod schemas/types | Existing single wire authority for search, related and public cards. [VERIFIED: `apps/web/package.json:12-16`; `packages/contracts/src/index.ts:1-9`] |
| CSS Modules | framework built-in | Public visual system, themes and responsive layout | `public.module.css` already centralizes the editorial system and breakpoints. [VERIFIED: `apps/web/app/public.module.css:1-420`] |

### Supporting

| Library / runtime | Version | Purpose | When to Use |
|-------------------|---------|---------|-------------|
| Playwright | `1.62.1` | Real Chromium responsive/keyboard/SEO/same-origin acceptance | Final Phase 7 browser gate. [VERIFIED: `apps/web/package.json:18-23`; local `playwright --version`] |
| TypeScript | `7.0.2` | Strict page/helper/component typing | All implementation and unit tests. [VERIFIED: `apps/web/package.json:18-23`] |
| Node.js | `v24.15.0` installed; project minimum `>=24.15.0` | Node test runner, local strict fixture, process orchestration | Unit tests and no-Docker Playwright fixture runner. [VERIFIED: local `node --version`; `package.json:6-7`] |
| pnpm | `11.20.0` | Existing workspace scripts | Use through `corepack pnpm`; no install is required. [VERIFIED: local `corepack pnpm --version`; `package.json:6`] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native GET form | Next `<Form>` or client router | Native form directly satisfies no-JS/keyboard requirements; enhanced routing adds no value to explicit submit-only search. |
| Server-rendered states | Client fetch + spinner/live region | Would add request/state duplication, violate the locked document-navigation behavior, and enlarge same-origin testing. |
| Shared compact `PostCard` variant | New `SearchCard` and `RelatedCard` | Separate components would duplicate public DTO formatting and eventually drift. |
| Narrow `/search` Proxy marker | Reject replacement characters only | Replacement-character rejection cannot distinguish all malformed `%` sequences and would incorrectly reject legitimate U+FFFD searches while still conflating literal `%ZZ`. |
| Existing PostgreSQL API | Browser search service or index daemon | Explicitly out of scope and incompatible with low-resource/same-origin constraints. |

**Installation:** none.

## Package Legitimacy Audit

Not applicable. Phase 7 installs no package, changes no lockfile, and uses only repository-pinned dependencies already present in the workspace. No registry or external network lookup was performed.

## Implementation File Map

| File | Change | Dependency / reason |
|------|--------|---------------------|
| `apps/web/lib/search-encoding.ts` (new) | Dependency-free raw query component validation for valid percent triplets and valid UTF-8 decoding. | Safe to import from Proxy without pulling app/contracts code into the separately executed Proxy bundle. |
| `apps/web/lib/search-encoding.test.ts` (new) | Unit cases for residual `%`, truncated octets, illegal UTF-8, valid literal percent/CJK/emoji and ordinary query encoding. | Proves the one capability decoded page props cannot recover. |
| `apps/web/proxy.ts` (new) | Match only `/search`; call the raw encoding helper and overwrite one internal request header. | Required before decoded `searchParams` loses raw distinction; uses installed Next 16 Proxy API. |
| `apps/web/app/lib/search-discovery.ts` (new) | Pure strict decoded-request resolution, search href generation and outcome-driven canonical decision. | Keeps UI and metadata on one authority; imports shared contracts and consumes the trusted encoding marker as an input. |
| `apps/web/app/lib/search-discovery.test.ts` (new) | Unit coverage for unknown/duplicate/malformed/oversized/page/query normalization, href encoding and canonical matrix. | Fast feedback without browser or API. |
| `apps/web/app/lib/api.ts` | Add strict `getPublicSearch` and `getPublicRelatedPosts`. | Reuse fixed internal origin, `cache:"no-store"`, strict parser and `PublicResult`. |
| `apps/web/app/lib/site-metadata.ts` | Decouple canonical emission from `index`; retain backward-compatible defaults. | Search needs canonical + noindex simultaneously. |
| `apps/web/app/lib/site-metadata.test.ts` | Prove canonical+noindex and no-canonical+noindex combinations; preserve existing origin/RSS tests. | Prevent Phase 3 SEO regression. |
| `apps/web/app/_components/SearchForm.tsx` (new) | Shared labelled native GET form with context classes and compact-menu tabIndex support. | Avoid header/page form markup drift. |
| `apps/web/app/_components/PublicHeader.tsx` | Insert SearchForm after public links and before 管理; preserve compact, Escape, focus and private exclusion. | D-01..D-03. |
| `apps/web/app/_components/PostCard.tsx` | Add compact variant while retaining one public DTO formatter. | D-08/D-12; no second projection. |
| `apps/web/app/_components/Pagination.tsx` | Add preserved params, custom aria label, page-1 omission and 44px targets. | D-05; preserve existing callers by defaults. |
| `apps/web/app/search/page.tsx` (new) | Server-rendered search form, six honest states, result list, actions, pagination and dynamic metadata. | Main SRCH-01/SRCH-02 presentation. |
| `apps/web/app/posts/[slug]/page.tsx` | Fetch/interpret related independently after successful article; render nonempty, hidden-empty, or scoped failure. | READ-08/READ-09 and D-11..D-14. |
| `apps/web/app/public.module.css` | Add search forms/states/compact cards/related grid and responsive/focus/44px rules using existing variables. | D-09/D-11/D-15 and UI-SPEC. |
| `apps/web/e2e/public-discovery-fixture.ts` (new) | Strict deterministic local API with success/empty/out-of-range/failure/malformed/related variants and sanitized control endpoints. | Browser UI coverage without Docker/database/cloud. |
| `apps/web/e2e/public-discovery.spec.ts` (new) | Full 375/768/1280, keyboard, no-JS, theme, state, related, SEO, sitemap, privacy and same-origin journey. | D-16 and Browser Verification Contract. |
| `scripts/phase7-browser-verify.mjs` (new, selected) | Allocate loopback ports, start fixture + current Next build/dev, run the Playwright suite, and terminate exact children. | Sole authoritative Phase 7 runner; do not add Phase 8 fixed-`3100` receipt authority here. |

No API repository, route, database schema, migration, Compose topology, server document, production evidence, RSS implementation, or sitemap implementation should change in Phase 7.

## Architecture Patterns

### Pattern 1: Strict Web preflight before upstream work

**What:** Resolve raw-encoding validity and pass the entire decoded object to the shared strict schema. Invalid returns a local presentation union and performs no fetch.

**Why:** The API already validates, but the UI contract requires invalid/unknown/duplicate requests to have a deterministic invalid page rather than collapse into generic upstream failure. Keeping the object intact preserves `.strict()` unknown-key rejection and array rejection. [VERIFIED: `packages/contracts/src/public-discovery.ts:10-29`; `apps/api/src/routes/public-posts.ts:27-35`]

**Proposed interface (planner target, not existing code):**

```ts
type SearchRequestResolution =
  | { kind: "invalid" }
  | { kind: "accepted"; query: string; page: number };

resolveSearchRequest(searchParams, encodingIsValid): SearchRequestResolution;
```

The quoted values `"q"`, `"page"`, maximum raw length `256`, maximum normalized code points `80`, page range `1..100`, and page size `10` come from the shared contract and must not be redefined as new literals. [VERIFIED: `packages/contracts/src/public-discovery.ts:4-29`]

### Pattern 2: Outcome-driven metadata

**What:** Generate search metadata only after the same strict resolution/API outcome used by the body. `robots` is unconditional; canonical is conditional.

**Canonical truth table:**

| Request/outcome | Canonical | Robots |
|-----------------|-----------|--------|
| Invalid raw encoding, unknown/duplicate key, invalid/oversized q/page | none | `noindex, follow` |
| Accepted empty/whitespace q | none | `noindex, follow` |
| Accepted q, page 1, `results` | normalized `/search?q=...` | `noindex, follow` |
| Accepted q, page 1, `no_results` | normalized `/search?q=...` | `noindex, follow` |
| Accepted q, real page 2+, `results` | normalized `/search?q=...&page=N` | `noindex, follow` |
| `page_out_of_range` | none | `noindex, follow` |
| API HTTP/schema/network failure | none | `noindex, follow` |

This requires `pageMetadata` to permit both `alternates.canonical` and `robots.index=false`; Next supports these as independent metadata fields. [VERIFIED: installed Next.js metadata docs `.../generate-metadata.md:392-429,551-579`]

### Pattern 3: Presentational state union, not exception reuse

Search should render exactly one of `invalid`, `upstream_error`, `empty_query`, `no_results`, `page_out_of_range`, or `results`. Only the copy/actions in UI-SPEC are allowed. Search failure must not throw to the generic global boundary because its copy says `"暂时无法加载内容"`, while Phase 7 requires `"暂时无法完成搜索"`. Related failure similarly remains a local branch. [VERIFIED: `apps/web/app/_components/ServiceUnavailable.tsx:4-18`; `.planning/phases/07-responsive-discovery-experience/07-UI-SPEC.md`, Copywriting and State Contracts]

### Pattern 4: Query-preserving pagination with native URLSearchParams

`Pagination` should accept preserved normalized parameters and a navigation label. Construct URLs from `basePath` plus `URLSearchParams`; insert `q` first, include `page` only for pages greater than 1, and never concatenate a second `?`. Existing home/taxonomy callers pass no preserved parameters and retain their exact URLs. Numeric pages and directions become at least 44px without changing visible-page selection. [VERIFIED: `apps/web/app/_components/Pagination.tsx:4-40`; `.planning/phases/07-responsive-discovery-experience/07-UI-SPEC.md`, Navigation and pagination]

### Pattern 5: Real-empty versus failed-related isolation

Interpret `{items:[]}` only after strict schema success. A 404 from related, non-2xx, malformed JSON/DTO, refusal or exception is `upstream_error`, not empty. Render ordering from the API unchanged and show no score/match explanation. [VERIFIED: `packages/contracts/src/public-discovery.ts:109-115`; `apps/web/app/lib/api.ts:29-42`; `apps/api/src/routes/public-posts.ts:79-88`]

### Recommended component hierarchy

```text
RootLayout
├── PublicHeader (existing client island)
│   └── SearchForm context="header"
└── SearchPage (server)
    ├── discovery heading
    ├── SearchForm context="page"
    ├── SearchState OR CompactPostList
    │   └── PostCard variant="compact"
    └── Pagination preservedParams={q} ariaLabel="搜索结果分页"

PublicArticlePage (server)
└── article.articleShell
    ├── existing header/cover/body/ToC
    └── RelatedReading
        ├── absent (strict success + zero)
        ├── scoped failure
        └── compact grid -> PostCard variant="compact"
```

### Anti-patterns to avoid

- Picking only `{q,page}` before schema parsing; this silently accepts unknown keys.
- Reading `request.headers.host`, forwarded headers, or browser location to construct canonical URLs; `PUBLIC_ORIGIN` remains the sole external origin authority.
- Treating any HTTP 404/500/malformed DTO as an empty related list.
- Throwing search/related failures into the generic page error boundary.
- Fetching on `onChange`, adding debounce/autocomplete, or requiring JavaScript for form submission.
- Reordering related results or exposing score/shared metadata in presentation code.
- Creating separate SearchCard/RelatedCard DTO renderers.
- Hard-coding light colors, a third breakpoint, reduced target sizes, ellipsis truncation, or hidden mobile metadata.
- Adding `/search` to `sitemap.ts` or altering RSS/distribution output.
- Using `dangerouslySetInnerHTML` for the echoed query, title, summary or taxonomy.
- Testing only screenshots; semantic, state, request-origin, head metadata and overflow assertions are required.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Query normalization/limits | New regex/parser/constants in Web | `publicSearchQuerySchema` | Already owns NFC, trim, raw/code-point caps, page range and strict keys. |
| Public-card allowlist | Search/related-specific DTO interface | `PublicPostListItem` / existing `PostCard` | Prevents admin/Markdown/rank leakage and formatting drift. |
| URL encoding | String replacement or manual concatenation | `URLSearchParams`, `encodeURIComponent` at path segments | Correctly handles CJK, spaces, `%`, `&`, `+` and page-1 omission. |
| Search result state inference | `items.length` alone | `PublicSearchResponse.state` | Distinguishes empty query, no results and out-of-range. |
| Related ranking | Frontend category/tag scoring | API response order | Phase 6 already owns real overlap and deterministic order. |
| Theme/responsive system | New tokens/theme provider/breakpoints | `public.module.css` variables and existing 700/1023 rules | Preserves pre-paint/system/no-JS behavior. |
| SEO origin | Request Host or backend origin | `publicOrigin()` / `pageMetadata()` | Prevents spoofed host and topology leakage. |
| Menu/dialog/search widgets | Third-party component package | Native form/input/button/nav + current header state | No dependency is needed; native semantics satisfy no-JS and keyboard requirements. |
| Browser failure backend | Production test route or Docker-only DB | Local strict Node fixture | Deterministic, no credentials/cloud, and able to emit malformed/failure states. |

## Test Strategy

`.planning/config.json` sets `workflow.nyquist_validation` to `false`, so the formal GSD Validation Architecture/Wave-0 section is intentionally omitted. Phase 7 still requires the following tests because D-16 and UI-SPEC make real-browser evidence part of the feature contract. [VERIFIED: `.planning/config.json:19-31`; `.planning/phases/07-responsive-discovery-experience/07-UI-SPEC.md`, Browser Verification Contract]

### Fast unit/contract tests

| Behavior | Test file | Focused command |
|----------|-----------|-----------------|
| Shared API contract unchanged | existing `packages/contracts/src/public-discovery.test.ts` | `corepack pnpm --filter @blog-x/contracts test` |
| Raw encoding + Web request/canonical resolver | new `apps/web/lib/search-encoding.test.ts`, `apps/web/app/lib/search-discovery.test.ts` | `node --import tsx --test apps/web/lib/search-encoding.test.ts apps/web/app/lib/search-discovery.test.ts` |
| Metadata canonical+noindex compatibility | existing `apps/web/app/lib/site-metadata.test.ts` | `node --import tsx --test apps/web/app/lib/site-metadata.test.ts` |
| Workspace types | all touched files | `corepack pnpm -r typecheck` |
| Architecture/secret boundaries | repository | `node scripts/check-boundaries.mjs` |

Required resolver cases: missing/blank q; CJK/English; NFC composed/decomposed; raw 256/257; semantic 80/81 code points; page missing/1/2/100/101/01/decimal/sign/array; duplicate q; unknown key; raw `%ZZ`, `%E0%A4%A`, illegal UTF-8 `%ED%A0%80`/`%C0%AF`, and literal encoded `%25ZZ`; href encoding for spaces/`+`/`&`/`%`; every canonical truth-table row; upstream/malformed response has no canonical.

### No-Docker Playwright architecture

Use one local Node HTTP fixture that emits only strict public DTOs and has bounded, symbolic control modes for search/related failure. Start the fixture and the current Web build/dev server on generated loopback ports; set `INTERNAL_API_ORIGIN` to the fixture and `PUBLIC_ORIGIN/E2E_WEB_ORIGIN` to the Web origin. The runner must terminate only its exact child PIDs and may not use SSH, Docker, Compose, a public IP, production data, or a test-only production endpoint.

The fixture should include:

- matching Chinese and English title/summary/body scenarios represented by exact public result DTOs;
- at least 11 results for deterministic two-page UI and query preservation;
- public cards with/without summary/category/tags and very long mixed-language text;
- symbolic draft/downline/deleted secret markers that never appear in any strict response or rendered HTML;
- exact `empty_query`, `no_results`, `page_out_of_range`, 400, 500, 503 and malformed DTO modes;
- article detail plus nonempty related, empty related, failed related and malformed related paths;
- baseline distribution response so sitemap/RSS regressions can be checked without adding search.

### Browser acceptance matrix

| Area | Assertions |
|------|------------|
| Desktop 1280 | Header form visible after public links/before 管理; label/input/submit semantics; typing sends no request; Enter and click reach `/search?q=...`; compact results and two-column related grid. |
| Tablet 768 | Form inside closed/open menu; closed descendants not tabbable; keyboard open/submit; Escape closes and restores toggle focus; related grid naturally wraps. |
| Mobile 375 | Expanded form usable with no overflow; result/card information unchanged; exactly one related column; every Phase 7 control bounding box is at least 44px high. |
| No JavaScript | Compact nav/form remain visible; filling and Enter submit to rendered state; clear/return/pagination are normal links. |
| Themes | Explicit light, explicit dark and system mode render legible form/cards/state/focus; no light-only hard-coded styles. |
| Search truth | Results/count/query/page, empty, no-result, invalid, out-of-range and upstream failure have exact copy/actions; malformed/unknown/duplicate performs no upstream discovery request. |
| Privacy | No draft/downline/deleted marker, `markdown`, rank, score, IDs, stack, host/port, `INTERNAL_API_ORIGIN`, `124.222.91.230` or `47.99.80.8` in body/head/links/errors. |
| Related truth | Nonempty 1..4 cards preserve API order/exclude source; zero removes heading/section; failure leaves article body and shows distinct recovery, never 404/no-match. |
| SEO | All search forms have `noindex, follow`; only allowed normalized real pages have one canonical; page1 omitted; invalid/empty/out-of-range/failure none; `/search` absent from sitemap and baseline RSS/sitemap unchanged. |
| Same-origin | Every observed HTTP(S) page request has the Web origin; explicit API smoke uses `${webOrigin}/api/public/search` and `${webOrigin}/api/public/articles/:slug/related`; no request/link contains a direct fixture/API/cloud origin. |
| Accessibility | Visible labels, named site/search pagination nav, h1/h2/h3 order, article/time semantics, `aria-current`, focus-visible, native button/link activation and no duplicate live announcements. |

### Regression commands

After focused tests, run at minimum:

```text
corepack pnpm --filter @blog-x/contracts test
node --import tsx --test apps/web/lib/search-encoding.test.ts apps/web/app/lib/site-metadata.test.ts apps/web/app/lib/search-discovery.test.ts
corepack pnpm -r typecheck
node scripts/check-boundaries.mjs
node scripts/phase7-browser-verify.mjs
```

Phase 8, not Phase 7, owns adding this browser suite to the fixed `blogxlocal` one-command refresh and v1.1 full receipt.

## UI-SPEC Decision Trace

| Decision | Implementation evidence to plan |
|----------|---------------------------------|
| D-01 | One labelled inline header GET form at `>=1024px`; no icon/modal-only entry. |
| D-02 | Same form inside existing `#public-navigation` at `<=1023px`; closed controls non-tabbable; no-JS visible. |
| D-03 | Native GET/Enter/touch; existing Escape/focus restoration preserved and browser-tested. |
| D-04 | `/search?q=...`, explicit `page`; no onChange request, suggestions or history. |
| D-05 | Normalized query/count, clear/return, shared Pagination with q preservation. |
| D-06 | Server API helpers only; any browser API probe uses relative `/api`; fixed internal origin remains server-only. |
| D-07 | Always noindex; canonical truth table; raw malformed/duplicate/unknown invalid; sitemap unchanged. |
| D-08 | `PostCard variant="compact"`; same field/date/taxonomy/read-link renderer. |
| D-09 | One DOM content order/information set at all widths; only CSS layout changes. |
| D-10 | Six disjoint presentation states with exact UI-SPEC copy and continuation actions. |
| D-11 | Related after article body; two columns desktop, auto-wrap tablet, one mobile. |
| D-12 | Strict card only; no rank/match/shared/admin fields or explanations. |
| D-13 | Strict success empty returns `null`; no heading/separator/filler. |
| D-14 | Related upstream branch is local; article body remains and is never converted to 404. |
| D-15 | Existing variables, 700/1023 breakpoints, 44px, focus and reduced-motion extended. |
| D-16 | Playwright 375/768/1280 + no-JS/theme/same-origin/private-address assertions. |

## Common Pitfalls and Risks

### Pitfall 1: Unknown keys accidentally become valid
**What goes wrong:** Code builds `{q: searchParams.q, page: searchParams.page}` before parsing; `.strict()` never sees `extra=x`.
**Prevention:** Parse the complete decoded object; only derive data from `parsed.data`.
**Warning sign:** `/search?q=x&extra=y` shows results or canonical.

### Pitfall 2: Decoded parameters hide malformed encoding
**What goes wrong:** `%ZZ` and `%25ZZ` both become `%ZZ`, so body/metadata cannot satisfy D-07 from `searchParams` alone.
**Prevention:** Narrow Proxy raw-search validation with percent-triplet checks plus component `decodeURIComponent`, an overwritten request-only marker, and unit/browser cases for literal, truncated and illegal-UTF-8 spellings.
**Warning sign:** malformed direct URL gets a canonical or reaches `/public/search`.

### Pitfall 3: noindex removes every canonical
**What goes wrong:** Reusing current `pageMetadata(index:false)` omits canonical even for normalized valid queries.
**Prevention:** Make `index` and canonical emission orthogonal with backward-compatible defaults.
**Warning sign:** valid `/search?q=中文` has robots but no canonical.

### Pitfall 4: Metadata and body disagree
**What goes wrong:** Separate parsers or outcome inference produce a canonical for an out-of-range/error page.
**Prevention:** One resolver/loader and one canonical truth table; tests assert body state and head together.
**Warning sign:** page says “这一页没有结果” while canonical retains that page.

### Pitfall 5: Search/related error is thrown globally
**What goes wrong:** The generic boundary hides search-specific recovery or the entire readable article.
**Prevention:** Inline result unions; throw only for the primary article/public page authority that already owns whole-page availability.
**Warning sign:** related failure displays “暂时无法加载内容” instead of the article.

### Pitfall 6: Compact card becomes a second disclosure boundary
**What goes wrong:** New renderer handles raw API objects or adds score/snippet/admin fields.
**Prevention:** Prop type remains `PublicPostListItem`; strict helper parse precedes rendering; exact forbidden-byte browser assertions.
**Warning sign:** search/related card implementation does not import the shared type or duplicates all fields.

### Pitfall 7: Menu controls remain in tab order while visually closed
**What goes wrong:** Search input/button are added without the existing `compact && !open` tabIndex handling.
**Prevention:** SearchForm accepts disabled tab order from Header; test Tab order at 768 and 375 plus no-JS visibility.
**Warning sign:** keyboard focus disappears into hidden nav.

### Pitfall 8: Existing pagination behavior regresses
**What goes wrong:** Generic href changes add `?page=1`, lose taxonomy paths, double `?`, or shrink controls.
**Prevention:** Preserve defaults and existing tests; add search-only preserved params and custom label; verify home/taxonomy URLs.
**Warning sign:** homepage previous from page 2 is no longer `/`, or search next drops q.

### Pitfall 9: CSS satisfies desktop but loses narrow information
**What goes wrong:** category/tags/actions are hidden, long text overflows, or related `minmax(260px)` still forces 375px overflow through padding/min-width.
**Prevention:** `min-width:0`, `overflow-wrap:anywhere`, one DOM order, box sizing and scrollWidth checks at exact widths.
**Warning sign:** `documentElement.scrollWidth > clientWidth` or a mobile card lacks desktop metadata.

### Pitfall 10: Browser test proves the wrong topology
**What goes wrong:** fixture origin is opened directly or assertions inspect only page URLs, not requests/head/links.
**Prevention:** browser base is Web origin; fixture is only `INTERNAL_API_ORIGIN`; record all HTTP(S) requests and scan rendered HTML/head/actions.
**Warning sign:** any browser request contains fixture port, cloud IP or `INTERNAL_API_ORIGIN`.

## Security Domain

Security enforcement is enabled at ASVS Level 1 and blocks high findings. [VERIFIED: `.planning/config.json:26-34`]

### Applicable ASVS categories

| ASVS Category | Applies | Standard control |
|---------------|---------|------------------|
| V2 Authentication | no | Public read-only surface; existing admin/private header exclusion remains unchanged. |
| V3 Session Management | no | No session/token is read or added. |
| V4 Access Control | yes (confidentiality boundary) | API Phase 6 `publicPredicate` + strict `PublicPostListItem`; Web never broadens projection. |
| V5 Validation, Sanitization and Encoding | yes | Shared strict Zod schema, raw percent validation, `encodeURIComponent`/`URLSearchParams`, React text escaping. |
| V6 Cryptography | no | No secret, token, cookie, TLS or cryptographic primitive is introduced. |
| V7 Error Handling and Logging | yes | `PublicResult` maps failures to scoped opaque UI; no exception/origin/contract detail rendered. |
| V12 Files and Resources | no | No upload/media/storage mutation. |
| V14 Configuration | yes | `PUBLIC_ORIGIN` remains strict canonical authority; `INTERNAL_API_ORIGIN` stays server-side. |

### Threat register

| Threat | STRIDE | Severity | Required mitigation / verification |
|--------|--------|----------|------------------------------------|
| Unknown/duplicate/malformed search shape produces results/canonical | Tampering | high | Whole-object strict parse + raw encoding marker; invalid makes no API request and no canonical. |
| Query/article text becomes executable markup | Tampering / Elevation | high | Render React text only; no `dangerouslySetInnerHTML`; hostile string browser assertion. |
| Search/related leaks draft/admin/rank/topology/error data | Information Disclosure | high | Strict contracts, one card renderer, forbidden marker/key/IP/host scans in body/head/links. |
| Browser connects to backend/fixture/cloud origin | Information Disclosure / Spoofing | high | No client fetch; Web origin only; request listener and relative `/api` smoke. |
| Client spoofs raw-encoding marker | Spoofing | medium | Proxy overwrites (does not preserve) inbound marker and passes it request-only; matcher and browser tests. |
| Type-ahead or unbounded pagination increases resource use | Denial of Service | high | Submit-only GET, shared 80/256/100/10 caps, Phase 6 timeout/rate/query limits; no new daemon. |
| Related failure suppresses primary article | Denial of Service | medium | Independent outcome; related never throws after article success. |
| SEO duplicate/poisoned URL receives canonical | Tampering | medium | Outcome-driven canonical matrix, strict public origin, all search pages noindex. |

No high threat may remain accepted or deferred in a plan. Every high row requires an automated task assertion.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | unit tests/local fixture | yes | `v24.15.0` | none needed |
| Corepack/pnpm | workspace commands | yes | `11.20.0` | none needed |
| Next.js | Web build/dev/start | yes | `16.3.0` pinned | none needed |
| Playwright CLI | browser gate | yes | `1.62.1` | none needed |
| Chromium headless shell | browser gate | yes | installed under Playwright cache | use installed Desktop Chrome channel only if the exact Playwright browser executable becomes unavailable; do not download during the phase gate |
| Docker/PostgreSQL/cloud servers | Phase 7 UI verification | not required | — | local strict API fixture |

No missing blocking dependency was found. The browser gate must fail clearly rather than downloading packages/browsers or falling back to a cloud server.

## Selected Plan Decomposition (revised after independent plan check)

Phase 7 uses exactly four dependent plans/waves and seven total tasks. This is the selected execution structure, not advisory history:

### Plan 07-01 — Real search tracer (Wave 1, 1 task)

**Scope:** the thinnest production vertical path: shared native header form → SSR `/search` → server-only `getPublicSearch` → strict visible result, with generated-port fixture/Web/Playwright proof in `apps/web/e2e/public-discovery.spec.ts` through `scripts/phase7-browser-verify.mjs`.

**Exit truth:** a real form submission renders one strict result over the same-origin browser boundary and the focused tracer is runnable.

### Plan 07-02 — Strict query, SEO and complete search states (Wave 2, depends on 07-01, 2 tasks)

**Scope:** raw encoding helper/Proxy marker, whole-object request/outcome resolver, canonical/noindex decoupling, exact search copy, compact-card order and stable pagination.

**Task split:**
1. RED/GREEN strict raw/decoded request, outcome and metadata authority.
2. RED/GREEN complete search states, strict compact cards and query-preserving pagination.

**Exit truth:** invalid forms make no upstream call; all search states and metadata are deterministic and honest.

### Plan 07-03 — Related reading and responsive implementation (Wave 3, depends on 07-02, 2 tasks)

**Scope:** exact `getPublicRelatedPosts`/`publicRelatedPostsResponseSchema` integration with article-retaining populated/zero/failure TDD, followed by focused 375/768/1280, 44px, keyboard, theme, no-JavaScript and overflow implementation proof in `apps/web/e2e/public-discovery.spec.ts`.

**Task split:**
1. Related populated, true-zero-hidden and failure-preserves-article RED/GREEN path.
2. Responsive discovery implementation plus its own focused Playwright evidence.

**Exit truth:** D-11..D-16 are implemented and focused browser checks pass before the independent full gate.

### Plan 07-04 — Independent full browser gate (Wave 4, depends on 07-03, 2 tasks)

**Scope:** expand the same strict fixture/spec/runner to all 20 edge truths, state/SEO/privacy/lifecycle/concurrency cases, then run the unfiltered Phase 7 browser and regression gate.

**Task split:**
1. Exact named `phase 7 edge and privacy matrix` Playwright block with nonzero focused execution.
2. Independent unfiltered generated-port browser gate plus unit/contracts/type/boundary/diff regressions.

**Exit truth:** all D-01..D-16 and READ-09 have independent machine evidence. Phase 8 receives the single suite path for later fixed-3100/full-receipt integration; Phase 7 does not refresh `blogxlocal` or update milestone receipts.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | None. Product/UI choices are locked in CONTEXT/UI-SPEC; framework behavior was checked against installed Next 16.3.0 docs and local runtime probes; implementation recommendations stay within the agent discretion granted there. | — | — |

## Open Questions (RESOLVED)

None blocking planning. The generated-port process orchestration is resolved to the single authoritative entry point `scripts/phase7-browser-verify.mjs`; do not add one-off shell orchestration or a second runner.

## Sources

### Primary (HIGH confidence)

- `.planning/phases/07-responsive-discovery-experience/07-CONTEXT.md` — locked D-01..D-16, boundaries and discretion.
- `.planning/phases/07-responsive-discovery-experience/07-UI-SPEC.md` — exact copy, layout, state, metadata, accessibility and browser contract.
- `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/PROJECT.md`, `.planning/STATE.md` — phase goal, requirement traceability, topology and release constraints.
- `.planning/phases/06-public-discovery-data/06-RESEARCH.md`, `06-01/02-PLAN.md`, `06-01/02-SUMMARY.md`, `06-VERIFICATION.md` — delivered Phase 6 contracts, strict routes, errors, same-origin readiness and verified behavior.
- `packages/contracts/src/public-discovery.ts`, `public-posts.ts`, `index.ts` — query/state/public-card source of truth.
- `apps/web/app/lib/api.ts`, `site-metadata.ts`, `site-metadata.test.ts`, `next.config.ts` — current server fetch, metadata and same-origin patterns.
- `apps/web/app/_components/PublicHeader.tsx`, `PostCard.tsx`, `Pagination.tsx`, `ServiceUnavailable.tsx` — reusable UI behavior.
- `apps/web/app/page.tsx`, `posts/[slug]/page.tsx`, `error.tsx`, `sitemap.ts`, `public.module.css` — current server page, error, SEO and visual authorities.
- `apps/web/e2e/public-shell.spec.ts`, `public-errors.spec.ts`, `public-list.spec.ts`, `public-reading.spec.ts`, `phase3-distribution.spec.ts`, `public-error-fixture.ts` — browser, fixture, responsive, failure and same-origin testing patterns.
- Installed official Next.js 16.3.0 docs under `apps/web/node_modules/next/dist/docs/` — current page/searchParams, Server Component metadata, canonical/robots and Proxy request-header behavior.
- Local runtime probes on 2026-08-17 — Node `v24.15.0`, pnpm `11.20.0`, Playwright `1.62.1`, installed Chromium headless shell, and raw/decoded malformed URL behavior.

### External sources

None. External research was intentionally disabled and prohibited for this task.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions read from repository manifests and confirmed by installed CLIs; no new package proposed.
- Architecture: HIGH — all seams are direct extensions of opened current source and installed framework docs.
- UI behavior: HIGH — exact behavior is locked in approved UI-SPEC and maps to existing CSS/component patterns.
- Testing: HIGH — patterns come from current Playwright suites and a proven local HTTP failure fixture architecture.
- Pitfalls/security: HIGH — each risk is tied to an observed current-code seam, strict contract, runtime probe, or locked requirement.

**Research date:** 2026-08-17
**Valid until:** 2026-09-16 (30 days; stable local stack and locked phase contract)
