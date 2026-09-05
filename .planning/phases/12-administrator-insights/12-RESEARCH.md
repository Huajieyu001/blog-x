# Phase 12: Administrator Insights - Research

**Researched:** 2026-09-05  
**Domain:** Authenticated, aggregate-only administrator analytics and lightweight SSR workspace  
**Confidence:** HIGH for existing integration seams; MEDIUM for the new response shape and presentation details, which are deliberate implementation recommendations.

## User Constraints

- `STAT-05` is the phase requirement: “管理员可在受认证保护且不缓存的后台查看 7、30、90 或 400 天的总浏览量、每日趋势、热门文章和粗粒度来源分布，所有数字明确标注为匿名 PV 趋势而非独立访客或计费依据。” [VERIFIED: .planning/REQUIREMENTS.md:14]
- `ADMN-02` is the phase requirement: “后台首页以分组卡片呈现内容工作概况、主要创作入口和访问趋势摘要，不再将所有操作平铺为同等权重的链接。” [VERIFIED: .planning/REQUIREMENTS.md:20]
- The range, top-article count, and response row count must be bounded; no heavy chart library or resident high-memory component is allowed. [VERIFIED: .planning/REQUIREMENTS.md:36]
- The analytics claim is explicitly best-effort PV only: no visitor identifier means no reliable deduplication, precise anti-fraud, profiling, geography, or cross-device attribution. [VERIFIED: .planning/REQUIREMENTS.md:34]
- The work stays local, must not access any cloud server or use server credentials, and must not modify `main`. [VERIFIED: .planning/REQUIREMENTS.md:32-33]

## Project Constraints (from AGENTS.md)

- Do not connect to, deploy to, or modify `47.99.80.8` while production is frozen. [VERIFIED: AGENTS.md:15]
- Keep secrets and database credentials out of the repository and keep the database off the public network. [VERIFIED: AGENTS.md:19]
- Browser traffic must stay on the one blog-domain entry path for pages, APIs, and media. [VERIFIED: AGENTS.md:17, AGENTS.md:21]
- Preserve low-resource operation on the `2C2G + 2C4G` production footprint; avoid heavy services and resident memory. [VERIFIED: AGENTS.md:18]
- Preserve export, backup, and recovery verification for long-lived content. [VERIFIED: AGENTS.md:20]
- Phase implementation must begin through a GSD workflow. [VERIFIED: AGENTS.md:56-66]

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STAT-05 | “管理员可在受认证保护且不缓存的后台查看 7、30、90 或 400 天的总浏览量、每日趋势、热门文章和粗粒度来源分布，所有数字明确标注为匿名 PV 趋势而非独立访客或计费依据。” [VERIFIED: .planning/REQUIREMENTS.md:14] | One authenticated read route, a bounded aggregate repository, strict Zod response parsing, no-store on API and SSR fetches, and range-specific zero-filled data. |
| ADMN-02 | “后台首页以分组卡片呈现内容工作概况、主要创作入口和访问趋势摘要，不再将所有操作平铺为同等权重的链接。” [VERIFIED: .planning/REQUIREMENTS.md:20] | Replace the flat `/admin` control row with grouped server-rendered content/workflow/trend cards and link to the dedicated statistics page. |
</phase_requirements>

## Summary

Phase 11 already provides one row per article and Shanghai calendar date, with counters for total PV and the five fixed source buckets. The table has a composite `(article_id, day)` primary key, a `(day, article_id)` index, non-negative counters, and a database constraint that preserves `total_pv = direct_pv + internal_pv + search_pv + social_pv + external_pv`. [VERIFIED: apps/api/src/db/schema.ts:97-110 — `article_daily_views`, `article_daily_views_pkey`, `article_daily_views_day_index`, and both counter checks]

Use that aggregate as the only analytics authority. Add a read-only, authenticated `GET` route and repository that calculate its date boundary in PostgreSQL with the same `Asia/Shanghai` authority as the writer, zero-fill the requested day series, and return strictly bounded totals, trend points, top currently-public articles, and the five source totals. The existing public predicate is exactly `status = "published"`, `deletedAt IS NULL`, `publishedAt IS NOT NULL`, and `publishedAt <= CURRENT_TIMESTAMP`; reuse it rather than copying a weaker lifecycle condition. [VERIFIED: apps/api/src/content/view-aggregation-repository.ts:20-28 — `(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date`; VERIFIED: apps/api/src/content/public-repository.ts:17-24 — `eq(schema.articles.status, "published")`, `isNull(schema.articles.deletedAt)`, `isNotNull(schema.articles.publishedAt)`, `lte(schema.articles.publishedAt, sql\`CURRENT_TIMESTAMP\`)`]

**Primary recommendation:** add no dependency and no migration; build one typed `/admin/insights?days=` read model on the existing day index, then render it on a new statistics page and as a seven-day summary in a card-based `/admin` dashboard. [ASSUMED]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Session authorization and non-cacheable insights API | API / Backend | Frontend Server | The existing `requireAdministrator` read guard resolves the server-side session and applies `cache-control: no-store`. [VERIFIED: apps/api/src/security/mutation-guard.ts:45-57] |
| Calendar boundary, aggregate grouping, zero-fill, source totals, top articles | Database / Storage | API / Backend | PostgreSQL already owns the Shanghai write day and indexed daily aggregate relation. [VERIFIED: apps/api/src/content/view-aggregation-repository.ts:20-28; apps/api/src/db/schema.ts:97-110] |
| Contract validation and same-origin API rewrite | Frontend Server (SSR) | API / Backend | Existing server components forward the request cookie to `INTERNAL_API_ORIGIN`, use `cache: "no-store"`, and parse the response with contracts; browser-visible `/api/*` routes are rewritten through the Web app. [VERIFIED: apps/web/app/lib/api.ts:50-61, apps/web/app/lib/api.ts:91-119; apps/web/next.config.ts:14-19] |
| Dashboard cards, range links, honest empty/error states | Browser / Client | Frontend Server (SSR) | Server-rendered admin pages already obtain cookies and render semantic elements; the new UI should remain SSR and not add client analytics state. [VERIFIED: apps/web/app/admin/page.tsx:1-25; apps/web/app/admin/layout.tsx:1-17] |
| Aggregate-only privacy boundary | Database / Storage | API / Backend | The existing schema carries only article/day/source counters, and its source domain is the fixed five-value tuple. [VERIFIED: apps/api/src/db/schema.ts:97-110; packages/contracts/src/analytics.ts:3-4 — `["direct", "internal", "search", "social", "external"]`] |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `fastify` | `5.11.2` | Authenticated `GET` route registration and replies. [VERIFIED: apps/api/package.json:18-33] | It is the existing API server and has the established session guard integration. [VERIFIED: apps/api/src/app.ts:146-177] |
| `drizzle-orm` | `0.45.2` | Typed database access plus parameterized `sql` for aggregate CTEs. [VERIFIED: apps/api/package.json:18-33] | Existing analytics writing already uses this exact seam. [VERIFIED: apps/api/src/content/view-aggregation-repository.ts:1-28] |
| PostgreSQL via `pg` | `8.22.0` | Date series, aggregate sums, joins, and consistent read transaction. [VERIFIED: apps/api/package.json:18-33] | The aggregate schema and SQL-time authority already live here. [VERIFIED: apps/api/src/db/schema.ts:97-110; apps/api/src/content/view-aggregation-repository.ts:20-28] |
| `zod` | `4.4.3` | Strict request-query and response contracts shared across API and Web. [VERIFIED: packages/contracts/package.json:14-20] | Existing API helpers validate JSON through exported contract schemas. [VERIFIED: apps/web/app/lib/api.ts:50-61, apps/web/app/lib/api.ts:105-119] |
| Next.js / React | `16.3.0` / `19.2.8` | SSR admin dashboard and lightweight semantic rendering. [VERIFIED: apps/web/package.json:13-24] | Existing admin pages are server components using `cookies()`. [VERIFIED: apps/web/app/admin/page.tsx:1-25] |

### Supporting

| Existing component | Purpose | When to Use |
|--------------------|---------|-------------|
| `requireAdministrator` | Authenticate safe reads and set `cache-control: no-store`; it returns `401 { error: "unauthorized" }` without a valid session. [VERIFIED: apps/api/src/security/mutation-guard.ts:45-57] | Use for the analytics `GET`; do not use the mutation/Origin/CSRF guard. |
| `publicPredicate` | Apply the canonical current-public lifecycle condition. [VERIFIED: apps/api/src/content/public-repository.ts:17-24] | Use inside every analytics aggregate/top query. |
| `admin.module.css` | Existing admin CSS-module styling and mobile breakpoint. [VERIFIED: apps/web/app/admin/admin.module.css:1-130] | Extend only with dashboard/stat classes in this phase; shared workspace-shell normalization belongs to Phase 13. [VERIFIED: .planning/REQUIREMENTS.md:19-23] |
| `scripts/test-inventory.mjs` | Exact ownership for all package tests. [VERIFIED: scripts/test-inventory.mjs:8-56, scripts/test-inventory.mjs:111-125] | Register each new unit, integration, and browser test rather than leaving tests unowned. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Semantic daily trend rows or CSS bars | A charting package | Rejected: the requirement rules out a heavy chart library, while a max of 400 zero-filled rows is suitable for accessible HTML/CSS. [VERIFIED: .planning/REQUIREMENTS.md:36, .planning/REQUIREMENTS.md:53] |
| One aggregate read model | A third-party analytics service or event stream | Rejected: the milestone prohibits third-party/independent analytics services and real-time event pipelines. [VERIFIED: .planning/REQUIREMENTS.md:49-52] |
| Existing day index | A new analytics index/migration | Rejected for the initial bounded 400-day scope: the existing `(day, article_id)` index starts with the range predicate and the table retention is 400 days. [VERIFIED: apps/api/src/db/schema.ts:107-110; .planning/REQUIREMENTS.md:13] |

**Installation:** none. No external package is needed or permitted by the phase constraints. [VERIFIED: .planning/REQUIREMENTS.md:36, .planning/REQUIREMENTS.md:53]

## Package Legitimacy Audit

No package installation is planned; the package-legitimacy gate is not applicable.

## Architecture Patterns

### System Architecture Diagram

```text
Authenticated administrator request
       |
       v
Next /admin dashboard or /admin/insights page
  cookies() -> SSR fetch(INTERNAL_API_ORIGIN, Cookie, cache: no-store)
       |
       v
same-origin Web rewrite: /api/admin/insights?days=N
       |
       v
Fastify GET /admin/insights
  |-- no active session --> 401 + cache-control: no-store
  `-- active session --> bounded query parse
                            |
                            v
                  read-only PostgreSQL transaction
                   |- Shanghai end/start date
                   |- eligible current-public aggregate rows
                   |- total + five source sums
                   |- generate_series zero-filled daily trend
                   |- top <= 10 public articles
                   `- content/workflow counts
                            |
                            v
                  strict InsightsResponse Zod parse
                            |
                            v
         dashboard cards / statistics table-or-CSS-bar trend
         (anonymous best-effort PV label; empty/error recovery)
```

### Exact Query Semantics

| Concern | Required implementation semantics |
|---------|-----------------------------------|
| Allowed ranges | Accept only `7`, `30`, `90`, and `400`, as required verbatim by STAT-05. [VERIFIED: .planning/REQUIREMENTS.md:14 — `7、30、90 或 400 天`] |
| Boundaries | Compute `endDay = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date` in SQL and `startDay = endDay - (days - 1)`; both endpoints are inclusive, so a 7-day selection returns exactly 7 dates including today. [ASSUMED] |
| Trend zero-fill | Generate one `date` for every day in the inclusive range, left join eligible aggregate rows, and `COALESCE` the PV to zero; response length must equal selected days. [ASSUMED] |
| Current-public filter | Build a single eligible-row CTE by joining `article_daily_views` to `articles` and applying the existing `publicPredicate`: `status = "published"`, `deletedAt IS NULL`, `publishedAt IS NOT NULL`, and `publishedAt <= CURRENT_TIMESTAMP`. This excludes currently draft, unpublished, soft-deleted, and not-yet-public articles from totals, trends, source distribution, and the top list. [VERIFIED: apps/api/src/content/public-repository.ts:17-24 — `eq(schema.articles.status, "published")`, `isNull(schema.articles.deletedAt)`, `isNotNull(schema.articles.publishedAt)`, `lte(schema.articles.publishedAt, sql\`CURRENT_TIMESTAMP\`)`; ASSUMED: applying it uniformly to all insights outputs is the recommended Phase 12 policy] |
| Total and sources | Sum `total_pv` for total PV and sum each persisted source column independently. The database already guarantees `total_pv = direct_pv + internal_pv + search_pv + social_pv + external_pv`, so the returned source totals must add to returned total. [VERIFIED: apps/api/src/db/schema.ts:100-110 — `totalPv`, `directPv`, `internalPv`, `searchPv`, `socialPv`, `externalPv`, and the equality check] |
| Source output | Always return all five categories in fixed order: `"direct"`, `"internal"`, `"search"`, `"social"`, `"external"`, with zero values when absent. [VERIFIED: packages/contracts/src/analytics.ts:3-4 — `["direct", "internal", "search", "social", "external"]`; ASSUMED: fixed-order zero-fill response policy] |
| Top articles | Aggregate eligible rows by article id/title/slug, order by `totalPv DESC`, then `slug ASC` (and `id ASC` only if needed for deterministic duplicate slugs), and return at most 10 rows. Never return markdown, raw request attributes, or deleted/non-public article metadata. [ASSUMED] |
| Content/workflow cards | Return compact, aggregate counts for retained drafts, scheduled drafts, and currently public articles from `articles`; do not reuse the current unbounded full-post list, which includes article markdown. [VERIFIED: apps/api/src/content/admin-repository.ts:108-111 — `listRetained()` selects retained posts and then hydrates full stored records; ASSUMED: a dedicated compact count query is recommended] |
| Resource bound | Run the query in a read-only transaction and set a local statement timeout consistent with existing bounded public search (`SET LOCAL statement_timeout = '2000ms'`). [VERIFIED: apps/api/src/content/public-repository.ts:153-205; ASSUMED: reuse this timeout for insights] |

### Contract Shape

Define one strict query schema and one strict response schema in `packages/contracts/src/analytics.ts`; keep it in the existing analytics module exported by `packages/contracts/src/index.ts`. [VERIFIED: packages/contracts/src/analytics.ts:1-20; packages/contracts/src/index.ts:1-11]

Recommended response shape (names and route are a plan-level recommendation, not an existing public contract):

```ts
// [ASSUMED] Proposed Phase 12 contract; all literal range/source values are
// already stated verbatim above from the requirement and analytics source contract.
{
  days: 7 | 30 | 90 | 400,
  startDay: "YYYY-MM-DD",
  endDay: "YYYY-MM-DD",
  totalPv: number,
  trend: Array<{ day: "YYYY-MM-DD", totalPv: number }>, // exact selected length
  sources: Array<{ source: "direct" | "internal" | "search" | "social" | "external", totalPv: number }>,
  topArticles: Array<{ title: string, slug: string, totalPv: number }>, // <= 10
  content: { drafts: number, scheduledDrafts: number, publicArticles: number }
}
```

Use `GET /admin/insights?days=<allowed literal>` and return `400 { error: "invalid_query" }` for malformed, duplicated, unknown, or out-of-set parameters. This exact route/error naming is [ASSUMED]; the required security behavior is protected, non-cacheable aggregate reading. [VERIFIED: .planning/REQUIREMENTS.md:14; apps/api/src/routes/admin-audit.ts:9-24 shows the existing authenticated-read/query-validation pattern]

### UI Integration Pattern

- Keep both pages as server components. `AdminLayout` already gates every `/admin/*` page through `getSessionStatus(cookieHeader)` and redirects unauthenticated users to `/login`. [VERIFIED: apps/web/app/admin/layout.tsx:7-16]
- Add `getAdminInsights(cookieHeader, days)` in `apps/web/app/lib/api.ts`, forwarding the cookie only to `INTERNAL_API_ORIGIN`, using `cache: "no-store"`, and returning a discriminated `ok | error` result. Existing helpers demonstrate cookie forwarding/no-store parsing but `getAdminPosts` collapses upstream failure to `[]`, so do not use it for insights states. [VERIFIED: apps/web/app/lib/api.ts:91-119; ASSUMED: new discriminated result recommendation]
- Make `/admin` the hierarchical dashboard: content/workflow cards first (new draft, posts, taxonomy, about, audit/export links), then a clearly secondary 7-day anonymous PV summary and a link to `/admin/insights?days=7`. This meets the home-page scope without implementing Phase 13's shared responsive navigation. [VERIFIED: .planning/REQUIREMENTS.md:20-23; ASSUMED]
- Add `/admin/insights` with four native range links/buttons that serialize only the approved values, a semantic daily `<ol>`/table or CSS bars, a top-public-articles list, and source totals. Use no client fetching or chart dependency. [VERIFIED: .planning/REQUIREMENTS.md:14, .planning/REQUIREMENTS.md:36, .planning/REQUIREMENTS.md:53; ASSUMED]
- Place the same visible disclosure near the dashboard summary and detailed statistics: “匿名、尽力而为的 PV 趋势；不是独立访客，也不用于计费。” Exact Chinese copy is [ASSUMED], but it must communicate all three STAT-05 boundaries. [VERIFIED: .planning/REQUIREMENTS.md:14]
- For successful all-zero data, say that the selected range has no anonymous PV yet; for an upstream/contract error, render `role="alert"` with a normal reload/return path. Do not silently substitute zero data for failure. [ASSUMED]

### Anti-Patterns to Avoid

- **Reusing the anonymous beacon endpoint or policy:** analytics reads are administrator-authorized `GET`s, not anonymous writes; never add a session identity to the aggregate writer. [VERIFIED: apps/api/src/routes/public-views.ts:22-47; .planning/REQUIREMENTS.md:35]
- **Using `requireAdministratorMutation` for a GET:** that guard adds Origin and mutation rate checks intended for unsafe methods. Use `requireAdministrator`, which already authorizes a safe read and applies no-store. [VERIFIED: apps/api/src/security/mutation-guard.ts:49-76]
- **Filtering only the top list:** lifecycle filtering must be shared by total, trend, source, and top queries so totals cannot contain inaccessible content. [ASSUMED]
- **Client-only charts or request polling:** it adds state, can create stale/error ambiguity, and conflicts with the lightweight/server-rendered constraints. [VERIFIED: .planning/REQUIREMENTS.md:36, .planning/REQUIREMENTS.md:53; ASSUMED]
- **Treating a failed fetch as an empty data set:** existing `getAdminPosts` does this, but insights must distinguish failure from a legitimate zero-PV range. [VERIFIED: apps/web/app/lib/api.ts:91-102; ASSUMED]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Visitor analytics / UV logic | Browser identifiers, cookies, IP hashing, event rows, anti-fraud or billing model | Existing anonymous article/day/source counters | The project explicitly disallows raw identity data and independent-visitor claims. [VERIFIED: .planning/REQUIREMENTS.md:11, .planning/REQUIREMENTS.md:34] |
| Counter reconciliation | JavaScript recomputation from events | Existing database equality constraint and aggregate columns | The source total invariant is already database-enforced. [VERIFIED: apps/api/src/db/schema.ts:100-110] |
| New chart subsystem | Canvas/chart library/client data store | Semantic HTML plus CSS-only visual hierarchy | Heavy chart libraries are out of scope. [VERIFIED: .planning/REQUIREMENTS.md:36, .planning/REQUIREMENTS.md:53] |
| Authorization / cache policy | New ad hoc cookie parser or cache headers | `requireAdministrator` plus SSR `cache: "no-store"` | The guard already verifies a non-revoked/unexpired session and sets no-store. [VERIFIED: apps/api/src/auth/sessions.ts:26-37; apps/api/src/security/mutation-guard.ts:45-57] |
| Public lifecycle eligibility | A copied `status` test | Shared `publicPredicate` | It includes publication time and deletion conditions in addition to `published` status. [VERIFIED: apps/api/src/content/public-repository.ts:17-24] |

## Common Pitfalls

### Pitfall 1: Off-by-one range or host-time boundary

**What goes wrong:** a seven-day choice returns six/eight rows or flips day at the API host's timezone. [ASSUMED]

**How to avoid:** calculate inclusive SQL bounds from `CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai'`, then assert `trend.length === days` for all four values. The writer already uses that SQL time expression. [VERIFIED: apps/api/src/content/view-aggregation-repository.ts:20-28; ASSUMED]

### Pitfall 2: Source total drifts from total PV

**What goes wrong:** a query sums one source subset or omits absent categories, yielding a UI source total that differs from headline PV. [ASSUMED]

**How to avoid:** sum each of the six persisted counters from exactly the same eligible CTE, return all five source categories, and test equality. The persisted invariant is already explicit. [VERIFIED: apps/api/src/db/schema.ts:100-110; ASSUMED]

### Pitfall 3: Hidden/deleted article leakage

**What goes wrong:** a soft-deleted, unpublished, draft, or future article title appears in top content or silently changes only one view of the dashboard. [ASSUMED]

**How to avoid:** apply the exact shared public predicate before every output aggregation. It already excludes non-public/deleted/future rows for public reads. [VERIFIED: apps/api/src/content/public-repository.ts:17-24]

### Pitfall 4: Cache or CSRF-boundary regression

**What goes wrong:** protected insights are cached or a safe read is routed through the mutation/Origin policy. [ASSUMED]

**How to avoid:** call `requireAdministrator` at the route boundary; it sets `cache-control: no-store` before session lookup. Keep SSR fetches `cache: "no-store"`; do not make analytics reads unsafe requests. [VERIFIED: apps/api/src/security/mutation-guard.ts:45-57; apps/web/app/lib/api.ts:50-61]

### Pitfall 5: Honest empty/error states are conflated

**What goes wrong:** upstream failure appears as a valid zero-PV range, leading the administrator to infer a traffic result that was never read. [ASSUMED]

**How to avoid:** make the Web helper return a discriminated result and test zero-data and malformed/upstream-response states separately. [ASSUMED]

### Pitfall 6: Test ownership drift

**What goes wrong:** new tests run ad hoc but fail the exact inventory or are omitted from canonical local integration. [ASSUMED]

**How to avoid:** update `scripts/test-inventory.mjs`, `scripts/default-test.mjs` if adding default tests, hard-coded canonical inventory counts/owner groups in `scripts/local-verify.mjs`, and the generated local acceptance route/suite selection in the same verification plan. [VERIFIED: scripts/test-inventory.mjs:8-56, scripts/test-inventory.mjs:111-125; scripts/default-test.mjs:19-37; scripts/local-verify.mjs:65-80, scripts/local-verify.mjs:354-374]

## Code Examples

### Authenticated read route pattern

```ts
// Existing pattern: apps/api/src/routes/admin-audit.ts:9-24
app.get("/admin/insights", async (request, reply) => {
  if (!await requireAdministrator(request, reply, { sessionAuth: options.sessionAuth })) return;
  const query = adminInsightsQuerySchema.safeParse(request.query);
  if (!query.success) return reply.code(400).send({ error: "invalid_query" });
  return adminInsightsResponseSchema.parse(await options.repository.read(query.data.days));
});
```

`"/admin/insights"`, `adminInsightsQuerySchema`, and `adminInsightsResponseSchema` are [ASSUMED] proposed names. The authorization, query validation, `400 { error: "invalid_query" }`, and no-store route pattern are [VERIFIED: apps/api/src/routes/admin-audit.ts:9-24; apps/api/src/security/mutation-guard.ts:45-57].

### Zero-filled trend CTE skeleton

```sql
-- [ASSUMED] Keep the literal timezone and current-public predicate aligned
-- with the existing verified writer/predicate cited below.
WITH bounds AS (
  SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date AS end_day
), days AS (
  SELECT generate_series(end_day - ($1 - 1), end_day, interval '1 day')::date AS day
  FROM bounds
), eligible AS (
  SELECT views.*
  FROM article_daily_views views
  JOIN articles ON articles.id = views.article_id
  CROSS JOIN bounds
  WHERE views.day BETWEEN bounds.end_day - ($1 - 1) AND bounds.end_day
    AND /* shared publicPredicate */
)
SELECT days.day::text AS day, COALESCE(SUM(eligible.total_pv), 0)::int AS total_pv
FROM days LEFT JOIN eligible ON eligible.day = days.day
GROUP BY days.day
ORDER BY days.day;
```

The exact persisted values are: `"Asia/Shanghai"`, `"article_daily_views"`, `"article_id"`, `"day"`, `"total_pv"`, `"direct_pv"`, `"internal_pv"`, `"search_pv"`, `"social_pv"`, and `"external_pv"`. [VERIFIED: apps/api/src/content/view-aggregation-repository.ts:20-28; apps/api/src/db/schema.ts:97-110] The exact shared public predicate values are quoted in **Exact Query Semantics**. [VERIFIED: apps/api/src/content/public-repository.ts:17-24]

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Phase 11 provided only a privacy-safe write path and aggregate retention. [VERIFIED: apps/api/src/routes/public-views.ts:22-47; apps/api/src/content/view-aggregation-repository.ts:17-59] | Phase 12 consumes the existing aggregate through an administrator-only, non-cacheable read model. [ASSUMED] | No new event storage, identifier, or analytics service is necessary. [VERIFIED: .planning/REQUIREMENTS.md:11, .planning/REQUIREMENTS.md:49-53] |
| `/admin` currently presents links and an unbounded list of retained hydrated posts. [VERIFIED: apps/web/app/admin/page.tsx:6-23; apps/api/src/content/admin-repository.ts:108-111] | Phase 12 should prioritize grouped summary cards and creation flow; Phase 13 owns the full shared workspace/navigation refinement. [VERIFIED: .planning/REQUIREMENTS.md:19-23; ASSUMED] | Keeps the present phase scoped to insights and hierarchy. [ASSUMED] |

## Test Plan and Local Verification

`.planning/config.json` sets `workflow.nyquist_validation` to `false`, so the formal Nyquist Validation Architecture section is intentionally omitted. [VERIFIED: .planning/config.json:18-29]

| Layer | Required proof | Planned files / command |
|-------|----------------|-------------------------|
| Contract unit | Query accepts only all four values; response rejects a sixth source, source/total mismatch, bad dates, excessive top rows, or wrong trend length. [ASSUMED] | Extend `packages/contracts/src/tracer.test.ts` or add `packages/contracts/src/analytics.test.ts`; register it as `contracts-unit` default in `scripts/test-inventory.mjs`; run `corepack pnpm test`. [VERIFIED: packages/contracts/src/tracer.test.ts:29-60; scripts/test-inventory.mjs:8-20; package.json:13] |
| API/database integration | Unauthorized route is `401` + `cache-control: no-store`; authorized route is no-store; SQL dates are zero-filled; 7/30/90/400 are exact; invalid range is `400`; top ordering/cap, current-public filtering, source equality, content counts, and empty result are deterministic. [ASSUMED] | Add `apps/api/test/admin-insights.test.ts`, register integration owner `database`, and run it through the generated disposable database fixture. Existing auth/audit tests establish the no-store protected-read expectation. [VERIFIED: apps/api/test/auth-session.test.ts:112-128; scripts/test-inventory.mjs:21-34] |
| API failure handling | Repository failure produces a non-success response that the SSR helper converts to error, never a forged zero payload. [ASSUMED] | Test Fastify repository injection or a route-level fake repository; test `getAdminInsights` parser/result branch. |
| Web SSR / accessibility | `/admin` is card-hierarchical, exposes new-draft/statistics workflows and an anonymous-PV disclosure; `/admin/insights` switches all four ranges, renders a real zero state, a `role="alert"` failure state, and no client-visible API origin. [ASSUMED] | Add `apps/web/e2e/admin-insights.spec.ts` under `main-browser`; use the existing generated-session environment and login flow. [VERIFIED: apps/web/e2e/auth-session.spec.ts:1-35; scripts/test-inventory.mjs:35-51] |
| Regression / topology | Browser requests remain relative `/api/*`; no credentials, server origin, or public data-plane exposure are introduced. [ASSUMED] | `corepack pnpm check:boundaries`, `corepack pnpm -r typecheck`, `corepack pnpm test`, and the canonical generated integration run. [VERIFIED: package.json:11-17; apps/web/next.config.ts:14-19] |
| Local delivery gate | Expand the local verifier only after application tests are registered: update inventory-derived/hard-coded canonical counts and add a sealed Phase 12 selection if the workflow needs a dedicated receipt. [ASSUMED] | `corepack pnpm local:verify -- --canonical-integration --interruption-check --parallel-check`; a dedicated Phase 12 command name is [ASSUMED]. Existing Phase 11 selection proves the required sealed pattern. [VERIFIED: scripts/local-verify.mjs:354-374, scripts/local-verify.mjs:1532-1555] |

### Required test data matrix

1. Seed multiple public articles with aggregates inside and outside every range; include source-only rows for all five categories. [ASSUMED]
2. Seed one each of draft, unpublished, soft-deleted, future-published, and null-`published_at` article with aggregate rows; assert none affects any output. The public predicate's exact lifecycle conditions are [VERIFIED: apps/api/src/content/public-repository.ts:17-24].
3. Seed a missing calendar day; assert the response includes it at zero and returns exactly `days` points. [ASSUMED]
4. Give two public articles equal PV; assert deterministic secondary sort and a maximum of ten top rows. [ASSUMED]
5. Test an all-zero eligible range separately from injected database/contract failure. [ASSUMED]
6. Assert every API and SSR request path has `no-store`, unauthorized `/api/admin/insights` is `401`, and the browser never needs a direct backend address. [VERIFIED: apps/api/src/security/mutation-guard.ts:45-57; apps/web/next.config.ts:14-19; ASSUMED: exact new-route assertions]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | Yes | `requireAdministrator` checks a session digest that is not revoked and has not expired. [VERIFIED: apps/api/src/auth/sessions.ts:26-37; apps/api/src/security/mutation-guard.ts:49-57] |
| V3 Session Management | Yes | HTTP-only, `SameSite=Lax`, path-root session cookie and server-side token digest. [VERIFIED: apps/api/src/auth/sessions.ts:9-23, apps/api/src/auth/sessions.ts:40-58] |
| V4 Access Control | Yes | Do not register a public insights route; use only the authenticated admin route and SSR admin layout gate. [VERIFIED: apps/api/src/routes/admin-audit.ts:9-24; apps/web/app/admin/layout.tsx:7-16; ASSUMED: mirror this for insights] |
| V5 Input Validation | Yes | Strict query schema with only four permitted values and strict response schema before UI rendering. [ASSUMED] |
| V8 Data Protection | Yes | Return aggregate counters and current-public title/slug only; never add raw IP, User-Agent, referrer URL, cookie, session, or visitor identifier. [VERIFIED: .planning/REQUIREMENTS.md:11, .planning/REQUIREMENTS.md:34] |
| V13 API Security | Yes | `cache-control: no-store`, server-side cookie forwarding, same-origin `/api` rewrite, bounded query/rows/time. [VERIFIED: apps/api/src/security/mutation-guard.ts:45-57; apps/web/app/lib/api.ts:50-61; apps/web/next.config.ts:14-19; ASSUMED: bounds/time implementation] |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthenticated analytics disclosure | Information disclosure | Invoke `requireAdministrator` before parsing/querying and prove `401` + no-store. [VERIFIED: apps/api/src/security/mutation-guard.ts:49-57; ASSUMED: new-route test] |
| Cached administrative metrics | Information disclosure | Reuse guard-issued `cache-control: no-store` and SSR fetch `cache: "no-store"`. [VERIFIED: apps/api/src/security/mutation-guard.ts:45-57; apps/web/app/lib/api.ts:50-61] |
| Query resource exhaustion | Denial of service | Four literal ranges, top cap, exact trend cap, current day-indexed storage, and local statement timeout. [VERIFIED: .planning/REQUIREMENTS.md:36; apps/api/src/db/schema.ts:107-110; ASSUMED: response/timeout caps] |
| Privacy regression via read model | Information disclosure | Contract contains aggregates only; static/test scan rejects identifiers/raw headers and UI language rejects UV/billing claims. [VERIFIED: .planning/REQUIREMENTS.md:11, .planning/REQUIREMENTS.md:34; ASSUMED: added static assertions] |
| CSRF policy confusion | Tampering | Insights stays a safe `GET` under `requireAdministrator`; mutations continue using `requireAdministratorMutation`. [VERIFIED: apps/api/src/security/mutation-guard.ts:49-76] |

## Recommended Plan Split and File Ownership

| Plan | Depends on | Owned files / responsibility | Verification |
|------|------------|------------------------------|--------------|
| 12-01 — Contract and aggregate read API | Phase 11 | `packages/contracts/src/analytics.ts`, `packages/contracts/src/index.ts` only if export changes, new `apps/api/src/content/admin-insights-repository.ts`, new `apps/api/src/routes/admin-insights.ts`, `apps/api/src/app.ts`, new API/contract tests. Define strict range/response schemas, read-only SQL, zero fill, public filter, auth/no-store route, and content counts. No migration. [ASSUMED] | Focused contract/API test plus `corepack pnpm -r typecheck`. [ASSUMED] |
| 12-02 — SSR insights and dashboard cards | 12-01 | `apps/web/app/lib/api.ts`, `apps/web/app/admin/page.tsx`, new `apps/web/app/admin/insights/page.tsx`, `apps/web/app/admin/admin.module.css`, new Web helper/unit/E2E tests. Render grouped workflow/content cards, a 7-day trend summary, dedicated range page, disclosure, and honest states. [ASSUMED] | Focused SSR/E2E test, accessibility roles, and same-origin request assertions. [ASSUMED] |
| 12-03 — Guarded test inventory and local acceptance | 12-01, 12-02 | `scripts/test-inventory.mjs`, `scripts/default-test.mjs` if a default contract test is added, `scripts/local-verify.mjs`, its tests, and any local fixture manifest/acceptance selector. Update exact inventory/canonical counts rather than bypassing the gate. [ASSUMED] | `corepack pnpm test`, `corepack pnpm -r typecheck`, `corepack pnpm check:boundaries`, then the sealed local-only canonical integration command. [VERIFIED: package.json:11-17; scripts/local-verify.mjs:65-80] |

**Parallelism guidance:** 12-01 is the tracer and must land first because it defines the contract. 12-02 can begin once response names/types are fixed. 12-03 should follow both, because it owns shared inventory and exact verifier counts; do not edit those shared scripts concurrently with the feature plans. [ASSUMED]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Typecheck, tests, SSR build | ✓ | `v24.15.0` [VERIFIED: local command `node --version`] | — |
| pnpm through Corepack | Workspace scripts | ✓ | `11.20.0` [VERIFIED: local command `corepack pnpm --version`] | — |
| Docker Engine (local Colima context) | Generated local database/browser acceptance only | ✓ | `29.7.1` [VERIFIED: local command `docker info`] | Focused unit/type checks can run without it. [ASSUMED] |
| Docker Compose | Generated local acceptance | ✓ | `5.4.0` [VERIFIED: local command `docker-compose --version`] | Focused unit/type checks can run without it. [ASSUMED] |
| External service / package | Phase implementation | Not required | — | No third-party analytics service, external API, or new dependency. [VERIFIED: .planning/REQUIREMENTS.md:49-53] |

**Missing dependencies with no fallback:** none found locally. [VERIFIED: local availability audit]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The new API should be named `GET /admin/insights?days=` and expose the proposed `AdminInsightsResponse` shape. | Contract Shape | Planner/executor must rename all API/Web/test seams consistently. |
| A2 | All insight outputs should filter to articles that are currently public, not merely articles that were public when a PV was written. | Exact Query Semantics | Historical totals for later-unpublished content would be hidden; this is a product policy to lock in the plan. |
| A3 | A semantic HTML/CSS trend display is sufficient and more appropriate than a chart dependency. | UI Integration | Final visual density needs phase execution/UAT confirmation. |
| A4 | A local `2000ms` SQL statement timeout and top-ten cap fit the 2C4G footprint. | Exact Query Semantics | Real-content volume may require a measured adjustment, while remaining bounded. |
| A5 | The dashboard should include compact retained draft/scheduled/current-public counts in the insights read model. | Exact Query Semantics | Product may want a different workflow-count vocabulary, but loading all article markdown is not appropriate. |
| A6 | Add a sealed Phase 12 local-verifier selection in addition to canonical integration. | Test Plan | The planner can instead rely on a correctly updated canonical integration if a dedicated receipt adds disproportionate maintenance. |

## Open Questions (RESOLVED)

1. **Should historic PV from an article that is later unpublished or soft-deleted remain in sitewide total/trend/source figures?**
   - What we know: top articles must be public, and the shared public predicate reliably excludes non-public/current-future content. [VERIFIED: .planning/REQUIREMENTS.md:14; apps/api/src/content/public-repository.ts:17-24]
   - Recommendation: use the same current-public filter for every output in this phase (A2), so all numbers and top links describe currently readable public content. [ASSUMED]
   - **RESOLVED:** Phase 12 applies the shared current-public predicate to totals, trend, sources, and top articles. If an article is later unpublished or soft-deleted, its historic aggregates remain stored for recovery but are hidden from every administrator insight output; republishing makes the same history visible again.

2. **What exact label text should the administrator see?**
   - What we know: it must explicitly say anonymous, best-effort PV trend; it must not imply independent visitors or billing. [VERIFIED: .planning/REQUIREMENTS.md:14, .planning/REQUIREMENTS.md:34]
   - Recommendation: lock the proposed concise Chinese disclosure during planning and assert it in the browser test. [ASSUMED]
   - **RESOLVED:** Use the persistent short label `仅表示匿名、尽力而为的浏览趋势，不是独立访客数。` together with the detailed disclosure from `12-UI-SPEC.md`: no IP, Cookie, fingerprint, raw User-Agent or Referrer URL; results are trend-only and not for billing or precise anti-abuse claims.

3. **Do we need a dedicated `--phase12-data` local receipt?**
   - What we know: the verifier already seals per-phase selection/inventory for Phase 11 and has a canonical all-integration route. [VERIFIED: scripts/local-verify.mjs:354-374, scripts/local-verify.mjs:1572-1575]
   - Recommendation: prefer the dedicated receipt only if it can select exact API + dashboard suites without duplicating the Phase 11 ingress-only machinery. [ASSUMED]
   - **RESOLVED:** Add a sealed zero-option `--phase12-data` receipt that owns the exact Phase 12 API, SSR/browser, and verifier suites while reusing the current runtime-authority and generated-namespace machinery. It must not duplicate or weaken the Phase 11 ingress checks.

## Sources

### Primary (HIGH confidence)

- [VERIFIED: `.planning/REQUIREMENTS.md:10-37`] — Phase requirements, privacy/no-identity boundary, resource limits, and local-only constraints.
- [VERIFIED: `apps/api/src/db/schema.ts:97-110`] — aggregate table columns, index, and source-sum constraint.
- [VERIFIED: `apps/api/src/content/public-repository.ts:17-24`] — canonical current-public predicate.
- [VERIFIED: `apps/api/src/security/mutation-guard.ts:45-76`] — authenticated read and mutation guard boundaries/no-store behavior.
- [VERIFIED: `apps/web/app/lib/api.ts:50-119`] and [VERIFIED: `apps/web/next.config.ts:14-19`] — SSR cookie forwarding/no-store and same-origin rewrite pattern.
- [VERIFIED: `scripts/test-inventory.mjs:8-125`] and [VERIFIED: `scripts/local-verify.mjs:354-374`] — guarded test/local verification ownership.

### Secondary (MEDIUM confidence)

- None. This phase uses the existing repository stack and adds no external library or service.

### Tertiary (LOW confidence)

- None. All forward-looking implementation choices are explicitly labeled `[ASSUMED]` above rather than presented as sourced facts.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all runtime components, versions, and seams were read in this repository. [VERIFIED: apps/api/package.json:18-40; apps/web/package.json:13-25; packages/contracts/package.json:14-20]
- Architecture: HIGH for the existing auth/aggregate/proxy seams; MEDIUM for the new combined response and current-public historical policy. [VERIFIED: apps/api/src/security/mutation-guard.ts:45-76; apps/api/src/db/schema.ts:97-110; ASSUMED: A1-A2]
- Pitfalls: HIGH where inherited from source constraints; MEDIUM where they describe proposed UI/query behavior. [VERIFIED: .planning/REQUIREMENTS.md:32-37; ASSUMED]

**Research date:** 2026-09-05  
**Valid until:** Phase 12 planning begins, or the Phase 11 aggregate/auth/proxy seams change.
