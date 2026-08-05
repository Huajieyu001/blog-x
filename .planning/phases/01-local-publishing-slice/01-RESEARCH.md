# Phase 1: Local Publishing Slice - Research

**Researched:** 2026-08-05  
**Domain:** TypeScript full-stack publishing slice, server-side sessions, PostgreSQL, and safe Markdown rendering  
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

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

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|---|---|---|
| AUTH-01 | 唯一管理员可登录后台并保持安全会话，未登录访客无法访问受保护的管理功能。 | Database-backed opaque sessions, Argon2id password verification, Fastify API guard, and protected web routes. |
| CONT-01 | 管理员可创建、编辑、预览、发布、下线和删除 Markdown 文章。 | Article state model, authenticated Fastify routes, shared Markdown renderer. |
| CONT-02 | 管理员可保存草稿，且草稿及已下线文章不会出现在公开页面、RSS 或 Sitemap 中。 | Explicit state predicates and separate public/admin repository queries. |
| CONT-03 | 管理员可维护文章标题、摘要、封面、唯一固定链接、发布时间和 SEO 描述。 | Zod DTOs and PostgreSQL unique slug constraint; SEO output itself remains Phase 3. |
| READ-01 | 访客可在首页查看已发布文章的标题、摘要、发布日期和分页信息。 | Next.js SSR fetches Fastify's public query, ordered by `publishedAt DESC`, with deterministic pagination. |
| READ-02 | 访客可打开文章固定链接，并正确阅读 Markdown、代码块、表格、引用、链接和图片。 | Server-only unified/remark/rehype pipeline, strict sanitization, and Shiki highlighting. |
| OPS-04 | 开发者可在本地通过隔离的开发配置启动并验证前台、后台、API 和数据库，不依赖主服务器。 | Compose-backed local PostgreSQL, `.env.example`, one application command, health route, and Playwright smoke flow. |
</phase_requirements>

## Summary

Build a small two-application pnpm workspace: `apps/web` is the Next.js App Router SSR frontend, and `apps/api` is the Fastify API that exclusively owns PostgreSQL, authentication, Markdown rendering, and mutations. Next.js Server Components can fetch an API asynchronously, while Fastify provides typed HTTP routes and plugin-scoped hooks. [CITED: https://nextjs.org/docs/app/getting-started/fetching-data] [CITED: https://fastify.dev/docs/latest/Reference/Routes/] [CITED: https://fastify.dev/docs/latest/Reference/Plugins/]

Use PostgreSQL from day one, Drizzle's TypeScript schema plus generated, committed SQL migrations, and the `pg` driver. Drizzle documents `generate` for migration files and `migrate` for applying them; use that reviewable migration path instead of `drizzle-kit push` for this long-lived content store. [CITED: https://orm.drizzle.team/docs/kit-overview] [CITED: https://orm.drizzle.team/docs/migrations]

Keep the security boundary small: an opaque, random session identifier goes only in an HttpOnly/SameSite cookie and maps to a hashed, expiring server-side session row. Do not add a client token, JWT, local-storage credential, registration flow, or external identity provider. OWASP recommends Argon2id for stored passwords and explicitly prefers HttpOnly, Secure, SameSite cookies over browser storage for session credentials. [CITED: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html] [CITED: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html]

**Primary recommendation:** Use `apps/web` (Next.js 16.3.0) plus `apps/api` (Fastify 5.11.2) and PostgreSQL + Drizzle. Locally, one Compose command starts web, API, and database; in the future the main node serves web/TLS and reverse-proxies `/api` while the secondary node runs Fastify/PostgreSQL. Keep pnpm workspaces only—no Turborepo, Redis, queue, or further service split. [CITED: https://nextjs.org/docs/app/guides/self-hosting] [CITED: https://fastify.dev/docs/latest/Reference/Server/]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Public home and permalink rendering | Frontend Server (SSR) | API / Backend | Server Components fetch Fastify public endpoints and render HTML; they never connect to PostgreSQL. |
| Login and session validation | API / Backend | Database / Storage | Fastify creates/revokes sessions; every protected API request validates an opaque cookie against a server-side row. |
| Article lifecycle and slug uniqueness | API / Backend | Database / Storage | Validation and state transition rules belong server-side; PostgreSQL enforces final uniqueness. |
| Markdown editing/preview interaction | Browser / Client | Frontend Server (SSR) | The editor needs local typing state; preview calls the shared server renderer so published and preview output match. |
| Markdown rendering and sanitization | API / Backend | Frontend Server (SSR) | Fastify alone runs the trusted transformation pipeline; web receives already-sanitized article HTML for SSR. |
| Schema changes | Database / Storage | API / Backend | Versioned SQL migrations create the durable contract; application code consumes it. |
| Local orchestration and future proxy placement | Frontend Server (SSR) | API / Backend | Local Compose connects web/API/PostgreSQL; future Nginx keeps the browser on one domain and routes `/api` to the secondary node. |

## Project Constraints (from AGENTS.md)

- 主服务器 `47.99.80.8` remains frozen: do not connect, deploy, or modify it until the user explicitly unfreezes it.
- Local workspace is the current frontend/entrypoint/end-to-end environment; this phase needs no server operation.
- The future browser surface is one blog domain; it must not directly use the secondary-server public IP, and PostgreSQL must not be public.
- Fit the eventual 2C2G + 2C4G topology: avoid microservices, heavyweight search, and resident high-memory services.
- Never commit passwords, private keys, tokens, or database credentials; content must remain exportable/back-up-able in later phases.
- Do not run destructive database or firewall changes without separate confirmation. [VERIFIED: AGENTS.md:15-22] [VERIFIED: docs/INFRASTRUCTURE.md:74-80]

## Standard Stack

### Core

| Library | Version / published | Purpose | Why Standard |
|---|---:|---|---|
| `next`, `react`, `react-dom` | 16.3.0 (2026-08-03); 19.2.8 (2026-07-21) | SSR frontend in `apps/web` | App Router supplies Server Components for public reading and authenticated administration; it calls the separate API rather than PostgreSQL. [CITED: https://nextjs.org/docs/app/getting-started/server-and-client-components] [CITED: https://nextjs.org/docs/app/getting-started/fetching-data] |
| `fastify`, `@fastify/cookie` | 5.11.2 (2026-08-03); 11.1.2 (2026-07-15) | API server and cookie parsing/serialization in `apps/api` | Fastify routes/plugins make a small Node API; the cookie plugin supports Fastify 5, parses on `onRequest`, and exposes `setCookie`. [CITED: https://fastify.dev/docs/latest/Reference/Routes/] [CITED: https://github.com/fastify/fastify-cookie] |
| `drizzle-orm`, `drizzle-kit`, `pg` | 0.45.2 (2026-03-27); 0.31.10 (2026-03-17); 8.22.0 (2026-06-19) | Typed PostgreSQL access and committed migrations | Drizzle documents codebase-first schemas, generated SQL, and `migrate`; PostgreSQL is the required durable store. [CITED: https://orm.drizzle.team/docs/migrations] |
| `@node-rs/argon2` | 2.0.2 (2024-12-05) | Argon2id password hash/verify | Use a maintained implementation instead of constructing a password KDF; configure Argon2id at or above OWASP's stated minimum and benchmark locally. [CITED: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html] |
| `zod` | 4.4.3 (2026-05-04) | Shared request/form/configuration validation | One schema source for API payloads, seed configuration, and web form types. [ASSUMED] |

### Supporting

| Library | Version / published | Purpose | When to Use |
|---|---:|---|---|
| `unified`, `remark-parse`, `remark-gfm`, `remark-rehype`, `rehype-sanitize`, `rehype-stringify` | 11.0.5 (2024-06-19); 11.0.0 (2023-09-18); 4.0.1 (2025-02-10); 11.1.2 (2025-04-02); 6.0.0 (2023-08-26); 10.0.1 (2024-09-27) | Parse GFM Markdown to a sanitized HTML string | Use in one server-only renderer for preview and public detail; do not parse Markdown in two independently configured places. [ASSUMED] |
| `shiki` | 4.4.2 (2026-08-05) | Server-side syntax highlighting | Reuse one highlighter, explicitly limit languages/themes, and fall back unknown fences to `text`; Shiki warns highlighter creation is expensive. [CITED: https://shiki.style/guide/install] [CITED: https://shiki.style/guide/best-performance] |
| `@playwright/test` | 1.62.1 (2026-07-30) | Chromium E2E acceptance tests | Verify the login → draft → preview → publish → public-read journey; use one Chromium worker to respect local/2-core resources. [CITED: https://playwright.dev/docs/intro] [CITED: https://playwright.dev/docs/test-cli] |
| `pnpm` | 11.20.0 (2026-08-03) | Workspaces and deterministic install | Root workspace only; defer task runners until a second independently built package actually exists. [CITED: https://pnpm.io/workspaces] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|---|---|---|
| Fastify API + Next SSR web | One deployable Next.js application | One application has fewer local processes, but conflicts with the canonical deployment boundary that keeps backend/database on the secondary node. [VERIFIED: .planning/PROJECT.md:7-9] [VERIFIED: docs/INFRASTRUCTURE.md:28-47] |
| Fastify API + Next SSR web | NestJS API | Nest supplies more conventions, modules, and DI, but Fastify is a leaner fit for one administrator and a handful of routes. [ASSUMED] |
| Drizzle migrations | Prisma | Prisma is viable, but Drizzle's generated SQL and narrower runtime suit a small, SQL-visible two-node service. [ASSUMED] |
| Opaque database sessions | JWT/browser storage | Stateless credentials reduce DB reads but contradict the locked server-side-session decision and complicate revocation; OWASP says not to store session identifiers in browser storage. [CITED: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html] |
| Unified pipeline + Shiki | MDX or client-side rendering | MDX expands execution risk and client rendering risks divergent output; this phase only needs Markdown. [ASSUMED] |

**Installation (after the human resolves the audit warnings below):**

```bash
pnpm --filter @blog-x/web add next@16.3.0 react@19.2.8 react-dom@19.2.8
pnpm --filter @blog-x/api add fastify@5.11.2 @fastify/cookie@11.1.2 drizzle-orm@0.45.2 pg@8.22.0 @node-rs/argon2@2.0.2 unified@11.0.5 remark-parse@11.0.0 remark-gfm@4.0.1 remark-rehype@11.1.2 rehype-sanitize@6.0.0 rehype-stringify@10.0.1 shiki@4.4.2
pnpm --filter @blog-x/contracts add zod@4.4.3
pnpm add -Dw drizzle-kit@0.31.10 @playwright/test@1.62.1
```

All listed versions were queried directly from the npm registry on 2026-08-05; their displayed publication timestamps are in the tables. `npm view <package> scripts.postinstall` returned no postinstall value for each listed package. [VERIFIED: npm registry]

## Package Legitimacy Audit

The required legitimacy seam returned `SUS` with missing registry metadata for every submitted package, while direct `npm view` checks did return the versions above. Per the protocol, retain the seam verdict instead of silently upgrading it: before installing, a human must re-run the legitimacy check with working metadata and confirm each package's official repository. The official documentation cited in the stack tables independently establishes the framework/library names except for the explicit `[ASSUMED]` entries.

Inline warnings required by that result: `next` [WARNING: flagged as suspicious — verify before using.], `react` [WARNING: flagged as suspicious — verify before using.], `react-dom` [WARNING: flagged as suspicious — verify before using.], `fastify` [WARNING: flagged as suspicious — verify before using.], `@fastify/cookie` [WARNING: flagged as suspicious — verify before using.], `drizzle-orm` [WARNING: flagged as suspicious — verify before using.], `drizzle-kit` [WARNING: flagged as suspicious — verify before using.], `pg` [WARNING: flagged as suspicious — verify before using.], `@node-rs/argon2` [WARNING: flagged as suspicious — verify before using.], `zod` [WARNING: flagged as suspicious — verify before using.], `unified` [WARNING: flagged as suspicious — verify before using.], `remark-parse` [WARNING: flagged as suspicious — verify before using.], `remark-gfm` [WARNING: flagged as suspicious — verify before using.], `remark-rehype` [WARNING: flagged as suspicious — verify before using.], `rehype-sanitize` [WARNING: flagged as suspicious — verify before using.], `rehype-stringify` [WARNING: flagged as suspicious — verify before using.], `shiki` [WARNING: flagged as suspicious — verify before using.], `@playwright/test` [WARNING: flagged as suspicious — verify before using.], and `pnpm` [WARNING: flagged as suspicious — verify before using.].

| Package | Registry | Age / downloads / source repo | Verdict | Disposition |
|---|---|---|---|---|
| `next`, `react`, `react-dom` | npm | metadata unavailable to seam | SUS | Flagged — human verify |
| `fastify`, `@fastify/cookie` | npm | Fastify seam: 10.9M weekly downloads and official GitHub repo; cookie seam: 2.4M weekly downloads and official GitHub repo; both flagged only `too-new` | SUS | Flagged — human verify |
| `drizzle-orm`, `drizzle-kit`, `pg` | npm | metadata unavailable to seam | SUS | Flagged — human verify |
| `@node-rs/argon2`, `zod` | npm | metadata unavailable to seam | SUS | Flagged — human verify |
| `unified`, `remark-parse`, `remark-gfm`, `remark-rehype` | npm | metadata unavailable to seam | SUS | Flagged — human verify |
| `rehype-sanitize`, `rehype-stringify`, `shiki` | npm | metadata unavailable to seam | SUS | Flagged — human verify |
| `@playwright/test`, `pnpm` | npm | metadata unavailable to seam | SUS | Flagged — human verify |

**Packages removed due to [SLOP] verdict:** none.  
**Packages flagged as suspicious [SUS]:** the original package set lacks seam metadata; `fastify` and `@fastify/cookie` have registry/repository metadata but were flagged `too-new`. Planner must add one `checkpoint:human-verify` immediately before the initial dependency installation; do not make one checkpoint per package.

## Architecture Patterns

### System Architecture Diagram

```text
Browser
  | GET /, /posts/:slug ----------------------------> Next.js SSR (`apps/web`)
  |                                                     | server fetch to API
  |                                                     v
  |                                             Fastify (`apps/api`)
  |                                                     | public-only query
  |                                                     v
  |                                              PostgreSQL articles
  |
  | POST /api/auth/login (credentials) -----------> `/api` rewrite / reverse proxy
  |                                                     |
  |                                                     v
  |                                             Fastify auth route
  |                                                     | Argon2id verify
  |                                                     | create opaque session
  | <----------- Set-Cookie: session token ------------+
  |
  | POST/PATCH /api/admin/posts ------------------> `/api` rewrite / reverse proxy
  |          |                                          | validate cookie + Zod
  |          |                                          | transition state / slug
  |          |                                          v
  |          +-- authenticated preview ---------> Fastify Markdown renderer
  |                                                     | GFM -> HAST -> sanitize -> highlight
  |                                                     v
  +<--------------- HTML preview / SSR article --------+

Local: `docker compose up` starts web + API + PostgreSQL; Next's `/api` rewrite points at API.
Future: main-node Nginx serves web/TLS and proxies `/api` to secondary-node Fastify over the approved private/encrypted link.
```

### Recommended Project Structure

```text
apps/web/
├── app/                       # Next.js App Router pages and layouts only
│   ├── (public)/               # home and /posts/[slug] SSR pages
│   ├── admin/                  # protected editor and management pages
│   └── lib/api.ts              # internal API fetcher; forwards cookies for SSR
├── next.config.ts              # local `/api/*` rewrite to API origin
├── e2e/                        # Playwright acceptance journeys
└── .env.example                # public/internal API origin names only
apps/api/
├── src/
│   ├── routes/                 # public, auth, admin, preview, health Fastify plugins
│   ├── auth/                   # password verification, session create/read/revoke
│   ├── content/                # repository, state machine, Markdown renderer
│   ├── db/                     # Drizzle client, schema, migration runner
│   └── lib/                    # config parsing and API helpers
├── drizzle/                    # generated SQL migrations committed to git
└── .env.example                # names only, never values
packages/contracts/             # Zod DTOs consumed by web and API
compose.yaml                    # local web + API + PostgreSQL only
pnpm-workspace.yaml             # workspace rooted at apps/*
```

### Pattern 1: Public/admin query separation

**What:** Put every data read behind either Fastify public route/repository operations or authenticated admin route/repository operations. Public predicates always require `status = published` and `deletedAt IS NULL`; admin preview is authorized before it loads any non-public row. `apps/web` calls these HTTP endpoints and has no Drizzle client or `DATABASE_URL`. [ASSUMED]

**When to use:** Every page and handler. Do not pass a `preview=true` flag from an unauthenticated browser request into a public query. [ASSUMED]

### Pattern 2: Explicit article state transitions

**What:** Persist a small status enum such as `draft`, `published`, and `unpublished`, plus nullable `publishedAt` and `deletedAt`. Publish validates title, slug, and non-empty Markdown in one transaction; first publication sets `publishedAt`, later edits preserve it, and deletion only sets `deletedAt`. [ASSUMED]

**When to use:** Keep state rules in a content service, not scattered among React components or SQL fragments. A unique database index on slug across all non-deleted rows is required to honor D-08; decide whether a deleted slug remains reserved before schema implementation. [ASSUMED]

### Pattern 3: Server-only Markdown rendering

**What:** Store Markdown source unchanged, then have `apps/api` use one asynchronous server pipeline for preview and public article responses: `remark-parse` → `remark-gfm` → `remark-rehype` with raw HTML disabled → Shiki code HAST transform → `rehype-sanitize` allowlist → `rehype-stringify`. Shiki provides server-side HTML output and advises reuse of a long-lived highlighter. [CITED: https://shiki.style/guide/install] [CITED: https://shiki.style/guide/best-performance]

**When to use:** Render preview through the authenticated API endpoint/module, with cancellation/debounce in the editor. Keep the renderer out of web Client Components and never enable raw HTML merely to support styling. [ASSUMED]

### Pattern 4: Opaque database session

**What:** Fastify generates the session ID with Node's cryptographically secure random API, and `@fastify/cookie` parses/sets the opaque HttpOnly cookie. Store a SHA-256 digest, administrator ID, expiry, and creation/revocation timestamps in PostgreSQL. Validate the exact generated value on every protected API route; rotate/delete the old session on login and delete it on logout. The plugin parses cookies before dependent `onRequest` hooks and exposes `setCookie`; OWASP says the application should accept only server-generated session IDs and that session identifiers must not enter browser storage. [CITED: https://github.com/fastify/fastify-cookie] [CITED: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html]

**When to use:** Cookie settings are `HttpOnly`, `SameSite=Lax` (or Strict after tested UX), `Path=/`, no `Domain`, and `Secure` in HTTPS deployment. Use `__Host-` name only for the HTTPS production cookie because that prefix itself requires Secure. Responses that set session cookies use `Cache-Control: no-store`. [CITED: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html]

### Anti-Patterns to Avoid

- **Browser-to-secondary-IP calls:** Violates the future same-domain boundary and adds CORS/cookie complexity. Keep all browser `/api` requests on the main-domain reverse proxy (or the local Next rewrite). [VERIFIED: docs/INFRASTRUCTURE.md:55-68]
- **`drizzle-kit push` as the deployment migration:** It bypasses reviewed migration artifacts; generate and commit SQL, then run `migrate`. [CITED: https://orm.drizzle.team/docs/kit-overview]
- **JWT/localStorage session:** Breaks D-05's server-side sessions and OWASP's browser-storage guidance. [CITED: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html]
- **Render Markdown with raw HTML or unsanitized `dangerouslySetInnerHTML`:** Enables stored XSS in administrator-authored content and makes later editor changes unsafe. [ASSUMED]
- **Hard delete or mutable published dates:** Conflicts with D-10 and D-13. [VERIFIED: 01-CONTEXT.md:30-35]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Password storage | SHA/bcrypt wrapper or encryption scheme | `@node-rs/argon2` with Argon2id parameters benchmarked locally | OWASP specifies adaptive password hashing and Argon2id. [CITED: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html] |
| SQL migration diffing | Runtime DDL or ad-hoc schema scripts | Drizzle schema + generated committed SQL + `drizzle-kit migrate` | Gives reviewable, repeatable upgrades. [CITED: https://orm.drizzle.team/docs/kit-overview] |
| Markdown/GFM parsing | Regex parser or string replacement | unified/remark/rehype pipeline | Tables, fenced code, URL handling, and HTML sanitization are parser/security work, not formatting helpers. [ASSUMED] |
| Syntax grammars | Custom regex highlighter | Shiki with small language allowlist | Shiki uses TextMate grammars and warns highlighter creation is expensive, so cache it. [CITED: https://shiki.style/guide/] [CITED: https://shiki.style/guide/best-performance] |
| Browser journey tests | DOM scripts or manual-only acceptance | Playwright Test | It provides isolated browser automation and a standard CLI/reporting path. [CITED: https://playwright.dev/docs/intro] |

**Key insight:** The session table itself is application data, but cryptography, migration generation, parsing, sanitization, highlighting, and browser automation are not appropriate Phase 1 custom infrastructure.

## Common Pitfalls

### Pitfall 1: Public visibility leaks through a reused repository method

**What goes wrong:** A draft, unpublished, or soft-deleted article appears through the home page, slug route, preview response, or a future feed. [ASSUMED]

**Why it happens:** Status filters are appended ad hoc instead of being the invariant of the public repository. [ASSUMED]

**How to avoid:** Make public queries status- and deletion-constrained by construction; test each non-public state receives the same unavailable response at `/posts/:slug`. [ASSUMED]

**Warning signs:** A page component calls a general `findBySlug` method, or the public handler accepts an article status from query params. [ASSUMED]

### Pitfall 2: Preview and published Markdown drift or stored XSS

**What goes wrong:** The editor preview does not match public reading, or Markdown creates executable/unsafe output. [ASSUMED]

**Why it happens:** Two renderers, client-only highlighting, raw HTML enabled, or sanitize-before-transform ordering. [ASSUMED]

**How to avoid:** One server renderer, raw HTML disabled, a strict final HAST sanitizer, protocol-restricted links/images, and tests for script/event-handler/unsafe-URL payloads. [ASSUMED]

**Warning signs:** `rehype-raw`, unrestricted `style` attributes, or a Client Component doing final HTML generation. [ASSUMED]

### Pitfall 3: Cookie works locally but is insecure or broken when proxied

**What goes wrong:** `Secure` is disabled in production, cookies fail over HTTPS proxying, or sessions are cached/leaked. [ASSUMED]

**Why it happens:** Cookie flags are hard-coded for localhost or proxy headers are ignored. [ASSUMED]

**How to avoid:** Validate environment at startup; use HttpOnly/SameSite/no-Domain cookies, set Secure for HTTPS production, and set `Cache-Control: no-store` on session-changing responses. [CITED: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html]

**Warning signs:** Tokens in response JSON/localStorage, a cookie with a Domain attribute, or logging raw Cookie/Set-Cookie headers. [CITED: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html]

### Pitfall 4: SSR and browser API paths do not use the same boundary

**What goes wrong:** Browser mutations work only against a development API port, while SSR requests, production Nginx, or cookies fail after the split. [ASSUMED]

**Why it happens:** The web app calls a hard-coded localhost address, does not forward Cookie on authenticated SSR API fetches, or treats Next Proxy as the authorization mechanism. [CITED: https://nextjs.org/docs/app/getting-started/proxy]

**How to avoid:** Browser code always calls relative `/api/*`; local Next rewrites proxy that path to Fastify; Server Components use an internal API origin and explicitly forward only the inbound Cookie header when they need authenticated data. Nginx later owns the equivalent `/api` proxy. [CITED: https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites] [VERIFIED: docs/INFRASTRUCTURE.md:28-47]

**Warning signs:** `NEXT_PUBLIC_API_URL` contains a public IP, Fastify CORS is added only to make local browser calls work, or `/admin` authorization exists solely in `proxy.ts`. [ASSUMED]

### Pitfall 5: A costly slug change is silently accepted

**What goes wrong:** Existing public links break after a published slug edit. [ASSUMED]

**Why it happens:** The editor treats slug like any other text field. [ASSUMED]

**How to avoid:** Require a typed/modal confirmation for a published slug change and log the intent. Do not build redirects in Phase 1; that policy belongs to the future URL compatibility work. [VERIFIED: 01-CONTEXT.md:28-30]

### Pitfall 6: Local startup is claimed but cannot be reproduced

**What goes wrong:** It relies on a developer's global Postgres, uncommitted migration, or secret environment file. [ASSUMED]

**Why it happens:** Compose, seed, migration, environment validation, and health check are not one documented workflow. [ASSUMED]

**How to avoid:** `compose.yaml`, `.env.example` without values, ignored `.env.local`, `pnpm dev`, `pnpm db:migrate`, a non-sensitive health route, and a Playwright E2E seed/cleanup fixture. [ASSUMED]

## Code Examples

### Public query must own visibility filtering

```ts
// Source: Phase D-10/D-12/D-13 + Drizzle query pattern
export async function getPublicPostBySlug(slug: string) {
  return db.query.posts.findFirst({
    where: and(
      eq(posts.slug, slug),
      eq(posts.status, "published"),
      isNull(posts.deletedAt),
    ),
  });
}
```

The enum literals are an implementation proposal, not an existing in-repo definition. [ASSUMED]

### Markdown pipeline boundary

```ts
// Source: https://shiki.style/guide/install
const html = await unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeSanitize, blogSanitizeSchema)
  .use(rehypeStringify)
  .process(markdown);
```

The plan must insert the Shiki HAST transform before final stringify while retaining a sanitizer schema that permits only its expected safe output. The exact helper implementation is deliberately deferred until the planner chooses the smallest integration shape. [ASSUMED]

### Session-cookie boundary in Fastify

```ts
// Source: https://github.com/fastify/fastify-cookie
reply.setCookie("session", opaqueSessionId, {
  httpOnly: true,
  sameSite: "lax",
  secure: isHttpsProduction,
  path: "/",
});
```

The cookie contains no user profile, role, password, or database credential; it is only a lookup key for a validated server session. [CITED: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Next.js Pages Router API Routes | Fastify API plus App Router frontend | Canonical two-node topology | Keep browser pages in `apps/web` and database/API routes in `apps/api`; local rewrites and production Nginx preserve the single browser origin. [VERIFIED: .planning/PROJECT.md:7-9] [VERIFIED: docs/INFRASTRUCTURE.md:28-47] |
| Database mutation through `drizzle-kit push` | Generated SQL committed and run through `drizzle-kit migrate` | Current Drizzle migration guidance | Make schema evolution reviewable and reproducible. [CITED: https://orm.drizzle.team/docs/kit-overview] |
| Client token/localStorage authentication | HttpOnly, Secure, SameSite cookie with server-side validation | Current OWASP guidance | Meet the locked session model and limit XSS credential theft. [CITED: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html] |

**Deprecated/outdated:** Do not start with Lucia v3: its documentation is versioned at `v3.lucia-auth.com`; the phase does not need an auth framework abstraction beyond a single opaque session protocol. [CITED: https://v3.lucia-auth.com/basics/sessions] [ASSUMED]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | Zod remains the best small schema validator for this TypeScript application. | Standard Stack | Select a different maintained validator before install. |
| A2 | The listed unified packages remain mutually compatible at their current npm versions. | Standard Stack / Markdown | Pin and run the renderer/XSS tests before acceptance. |
| A3 | Next's local rewrite can transparently proxy `/api/*` to Fastify and deployment Nginx can preserve the same path. | Architecture | Misconfigured rewrites/proxy headers would break sessions or browser requests. |
| A4 | The proposed article status names and deleted-slug reservation policy are suitable. | Architecture Patterns | Schema/migration semantics may need revision; decide before initial migration. |
| A5 | The current local machine can use Docker Desktop/Compose after installation to provide the isolated PostgreSQL dependency. | Environment Availability | Local one-command startup remains blocked until a DB runtime is installed. |
| A6 | Lucia v3 should not be added. | State of the Art | Re-evaluate only if a supported session library materially reduces reviewed code. |

## Open Questions

1. **Should a soft-deleted slug remain permanently reserved?**
   - What we know: **“slug 在所有文章状态中必须唯一。”** and **“删除在数据层采用可恢复的软删除，公开查询立即排除被删除内容；永久清理不进入本阶段。”** [VERIFIED: 01-CONTEXT.md:28-30]
   - What's unclear: Whether a deleted post's slug may be reused would change the unique-index predicate and future URL compatibility.
   - Recommendation: Reserve slugs for all retained rows in Phase 1, since reclaiming a former public URL is a costly public-contract decision. [ASSUMED]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---:|---|---|
| Node.js | Next.js, Fastify, migrations, tests | ✓ | v24.15.0 | — |
| npm | package legitimacy/version checks | ✓ | 11.12.1 | pnpm installed during bootstrap |
| pnpm | workspace/install scripts | ✗ | — | Corepack or an audited pnpm installation before execution. [ASSUMED] |
| Docker / Docker Compose | isolated local PostgreSQL | ✗ | — | Install Docker Desktop/Compose, or provision a local non-public PostgreSQL instance and document its URL. [ASSUMED] |
| PostgreSQL client/service | database/migrations | ✗ | — | Compose-managed PostgreSQL after Docker is available. [ASSUMED] |
| Playwright browser binary | E2E test | ✗ | — | Run `pnpm exec playwright install chromium` after dependency installation. [CITED: https://playwright.dev/docs/intro] |

**Missing dependencies with no fallback:** none; Docker/Compose (or an equivalent local PostgreSQL) must be installed before OPS-04 can be verified.  
**Missing dependencies with fallback:** pnpm, Docker/Compose, PostgreSQL, and Playwright Chromium as described above.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | yes | One seed-created administrator; Argon2id hash/verify; generic login failure and no credential logging. [CITED: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html] |
| V3 Session Management | yes | Server-generated opaque session, hash-at-rest, expiry/revocation, HttpOnly/SameSite cookie, Secure on HTTPS. [CITED: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html] |
| V4 Access Control | yes | Fastify guards every protected API route server-side; web redirects are presentation only and never authorization. [CITED: https://nextjs.org/docs/app/getting-started/proxy] |
| V5 Input Validation | yes | Zod validates login/article/slug payloads and environment; database constraints backstop invariants. [ASSUMED] |
| V6 Cryptography | yes | Use Argon2id package and Node CSPRNG; never implement password hashing or token randomness manually. [CITED: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html] |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| Credential disclosure | Information disclosure | Argon2id only; seed reads secret from ignored env/stdin; redact request/cookie logging. [CITED: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html] |
| Session theft/fixation | Spoofing | CSPRNG opaque IDs, accept only issued sessions, HttpOnly/SameSite/HTTPS Secure cookie, server-side expiry and logout revocation. [CITED: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html] |
| Stored Markdown XSS | Tampering / information disclosure | Disable raw HTML, sanitize final HAST, restrict URL protocols, and test malicious content. [ASSUMED] |
| Draft visibility leak | Information disclosure | Public repository predicate is fixed; non-public permalink returns unavailable; E2E covers every state. [ASSUMED] |
| Slug race/collision | Tampering / denial of service | Database unique constraint plus user-facing conflict response; no check-then-insert-only logic. [ASSUMED] |
| SQL injection | Tampering | Parameterized Drizzle queries; no concatenated SQL from article fields. [ASSUMED] |

## Sources

### Primary / official documentation

- [Next.js App Router](https://nextjs.org/docs/app), [data fetching](https://nextjs.org/docs/app/getting-started/fetching-data), and [rewrites](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites) — SSR frontend, API fetches, and local same-origin path masking.
- [Next.js self-hosting guide](https://nextjs.org/docs/app/guides/self-hosting) — reverse-proxy deployment guidance.
- [Fastify routes](https://fastify.dev/docs/latest/Reference/Routes/), [plugins](https://fastify.dev/docs/latest/Reference/Plugins/), [server](https://fastify.dev/docs/latest/Reference/Server/), and [testing](https://fastify.dev/docs/v5.7.x/Guides/Testing/) — lightweight API routes, lifecycle placement, container binding, and injection testing.
- [@fastify/cookie README](https://github.com/fastify/fastify-cookie) — Fastify 5 compatibility plus cookie parsing/setting behavior.
- [Drizzle Kit overview](https://orm.drizzle.team/docs/kit-overview) and [migration fundamentals](https://orm.drizzle.team/docs/migrations) — generated SQL and `migrate` workflow.
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) and [Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) — password/session controls.
- [Shiki install/use](https://shiki.style/guide/install) and [performance practices](https://shiki.style/guide/best-performance) — server highlighter lifecycle and loading strategy.
- [Playwright installation](https://playwright.dev/docs/intro) and [test CLI](https://playwright.dev/docs/test-cli) — E2E install and resource-limited execution.
- [pnpm workspaces](https://pnpm.io/workspaces) — workspace scope.

### Registry verification

- npm registry, queried with `npm view <package> version` and `npm view <package>@<version> time[<version>]` on 2026-08-05 — current version/publish-time values in Standard Stack.

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM — current npm versions were checked; authoritative framework, ORM, security, Shiki, and Playwright documentation was consulted; the legitimacy seam's data-less SUS result prevents HIGH package confidence.
- Architecture: MEDIUM — directly aligned with official Next.js/Drizzle/OWASP guidance and locked topology, with explicitly logged application-design assumptions.
- Pitfalls: MEDIUM — security pitfalls derive from OWASP; content lifecycle and renderer-specific risks are clearly marked assumptions until implementation tests exist.

**Research date:** 2026-08-05  
**Valid until:** 2026-09-04 for versions and implementation guidance; re-check immediately before install because Next.js/package versions move quickly.
