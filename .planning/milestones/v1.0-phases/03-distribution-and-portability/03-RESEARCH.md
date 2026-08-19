# Phase 3: Distribution and Portability - Research

**Researched:** 2026-08-09
**Domain:** Next.js 16 App Router metadata files and Route Handlers; Fastify public/admin boundaries; portable Markdown export
**Confidence:** HIGH

## User Constraints

- Phase 3 has no `CONTEXT.md`; implementation design is agent discretion, constrained by the requirements, roadmap, and existing Phase 1/2 decisions. [VERIFIED: `.planning/phases/03-distribution-and-portability` from `init.phase-op`]
- Do not contact, deploy to, or modify either cloud server. Keep development and verification local. [VERIFIED: `AGENTS.md:12-20`]
- The browser must use the same-origin Web entrypoint only; do not expose or use a server public IP in browser code. [VERIFIED: `apps/web/next.config.ts:6-11`]
- Only public pages and articles that satisfy the established publication predicate may enter metadata-derived discovery output (Sitemap/RSS); drafts, unpublished, soft-deleted, and no-publication-time rows must be absent. The source quote is `eq(schema.articles.status, "published"), isNull(schema.articles.deletedAt), isNotNull(schema.articles.publishedAt)`. [VERIFIED: `apps/api/src/content/public-repository.ts:8-12`]
- Do not add a CDN, external service, heavyweight search system, or a new always-on component. Raw Markdown remains the content authority. [VERIFIED: `AGENTS.md:15-19`; `.planning/STATE.md` accumulated Phase 1 decisions]

## Phase Requirements

| ID | Description | Research Support |
|---|---|---|
| PORT-01 | 管理员可导出文章 Markdown 原文和必要元数据，导出结果可用于迁移。 | Use a authenticated, same-origin API download of a versioned JSON manifest containing every retained article's original Markdown and the metadata/taxonomy references necessary to recreate it. |
| SEO-01 | 每个公开页面具有正确的唯一标题、描述、规范链接和 Open Graph 分享元数据。 | Use root static metadata plus page-level static or `generateMetadata` functions backed by the existing server-side API client. |
| SEO-02 | 站点提供可抓取的 `robots.txt` 和仅包含公开页面及已发布文章的 Sitemap。 | Use Next `robots.ts` and `sitemap.ts`, supplied solely by a public-only distribution DTO. |
| FEED-01 | 访客可订阅包含最新已发布文章及永久链接的 RSS 或 Atom 源。 | Use a Next Route Handler at the conventional RSS path, supplied solely by the same public-only distribution DTO. |

Requirement text is quoted verbatim from [VERIFIED: `.planning/REQUIREMENTS.md:26-32`].

## Summary

Implement Phase 3 in four independently verifiable slices. Plan 03-01 owns the public distribution/RSS contract and establishes a Phase-3-scoped disposable-database runner. Plan 03-02 owns page metadata, `robots.txt`, and `sitemap.xml` and extends that runner with a managed Web/API/PostgreSQL browser journey. Plan 03-03 hardens the canonical verifier and public-origin/outbound safety gates. Plan 03-04 owns the authenticated logical export and extends the same runner rather than depending on an ambient database or manually started services. This keeps the browser on its Web origin while making it impossible for Next's SEO/feed code to query PostgreSQL, render Markdown, or accidentally read admin fields. [VERIFIED: `apps/web/app/lib/api.ts:22-39`; `apps/api/src/app.ts:65-83`; `scripts/local-verify.mjs`]

The export is a documented, versioned JSON archive with raw `markdown` strings, retained article metadata, category/tag identities, page data, and a manifest format/version; include soft-deleted and unpublished articles because portability is an administrator asset operation, not a public-discovery operation. It must not render or transform Markdown. **Resolved scope decision:** Phase 3 exports media references and metadata but no binary media; Phase 4 remains responsible for media backup/restore. The existing retained admin source already contains the required article authority fields: `"title"`, `"summary"`, `"slug"`, `"markdown"`, `"publishedAt"`, `"seoDescription"`, `"status"`, category and tags. [VERIFIED: `apps/api/src/content/admin-repository.ts:9-47`; `.planning/REQUIREMENTS.md:25-26`]

**Primary recommendation:** add no package. Extend the existing Fastify repositories/routes and strict Zod contracts; use Next's installed metadata-file APIs plus a small, tested XML-escaping function for the RSS text boundary. [VERIFIED: `apps/web/package.json:12-24`; CITED: `https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots`; CITED: `https://nextjs.org/docs/app/api-reference/file-conventions/route`]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Metadata/title/canonical/OG tags | Frontend Server (SSR) | API | Metadata is rendered by Next Server Components; API supplies validated public facts. |
| `robots.txt` and Sitemap | Frontend Server (metadata handlers) | API | Next owns the conventional public files; API applies the single public predicate. |
| RSS XML | Frontend Server (Route Handler) | API | Next owns the same-origin `/rss.xml` response; API supplies only published feed records. |
| Public visibility selection | API / Backend | Database | One repository predicate protects every public consumer. |
| Markdown archive/export | API / Backend | Database / browser download | Fastify authenticates and serializes source data; Web merely initiates a same-origin download. |
| Archive reconstruction verification | API / Backend tests | Node test runner | Tests parse exported data and compare raw authority values; no production import route is needed. |

## Project Constraints (from AGENTS.md)

- Production remains frozen until explicit user release: do not connect to, deploy to, or modify `47.99.80.8`. [VERIFIED: `AGENTS.md:12-14`]
- Use the local workspace for Web/entry/E2E work; the secondary API host must never be a browser dependency. [VERIFIED: `AGENTS.md:14-16`]
- Avoid heavy search, microservices, and resident high-memory services on the 2C2G + 2C4G topology. [VERIFIED: `AGENTS.md:15-16`]
- Never commit credentials; do not expose the database publicly. [VERIFIED: `AGENTS.md:16-17`]
- Content, metadata, media, and configuration must ultimately be exportable/backed up/restored; the public site must serve pages, API, and media from one domain. [VERIFIED: `AGENTS.md:17-19`]
- Before application changes, use the GSD phase workflow; this research artifact is the only file changed here. [VERIFIED: `AGENTS.md:31-37`]
- For Web implementation, read installed Next 16 documentation first because version-sensitive APIs may differ. [VERIFIED: `apps/web/AGENTS.md:1-8`]

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---|---:|---|---|
| `next` | `16.3.0` | Server metadata, metadata files, and RSS Route Handler | Already installed; official App Router APIs generate metadata, `robots.txt`, and Sitemap without a second server. [VERIFIED: `apps/web/package.json:12-16`; CITED: `https://nextjs.org/docs/app/getting-started/metadata-and-og-images`] |
| `fastify` + existing Drizzle/PostgreSQL repositories | `5.11.2` / existing | Public visibility and admin export authority | Preserves the implemented API → repository → database boundary. [VERIFIED: `apps/api/package.json:12-26`; `apps/api/src/app.ts:65-83`] |
| `zod` | `4.4.3` | Strict wire/export schemas | Existing contracts make both response and reconstruction payloads explicit allowlists. [VERIFIED: `packages/contracts/package.json:8-16`; `packages/contracts/src/public-posts.ts:19-35`] |

### Supporting

| Library | Version | Purpose | When to Use |
|---|---:|---|---|
| Web `Response` / `Headers` | platform | RSS `application/xml` response and export attachment | Use native response headers; do not add a feed/ZIP dependency. [CITED: `https://nextjs.org/docs/app/api-reference/file-conventions/route`] |
| Node `node:test` + Playwright | existing | API secrecy/reconstruction and browser-visible discovery checks | Extend the existing disposable PostgreSQL and same-origin Chromium harnesses. [VERIFIED: `apps/api/package.json:6-10`; `apps/web/e2e/phase2-reading.spec.ts:47-57`] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|---|---|---|
| Next metadata files | Handwritten static `public/robots.txt`/`sitemap.xml` | Static files cannot safely track publication lifecycle without a separate regeneration pipeline. |
| Versioned JSON export | ZIP of individual Markdown files | ZIP improves human browsing but requires archive tooling and a path/filename policy; it is unnecessary to prove lossless migration in this low-resource MVP. |
| Fixed canonical RSS item window | Feed package | A package would add an unneeded supply-chain surface; the standard requires a small fixed XML format and the framework documents native XML responses. |

**Installation:** none. Phase 3 must not add a dependency.

## Package Legitimacy Audit

Not applicable: the recommended plan adds no external package. Existing packages are not a Phase 3 installation decision.

## Architecture Patterns

### System Architecture Diagram

```text
request to same Web origin
  ├─ public page -> Next Server Component / generateMetadata
  │                 -> app/lib/api.ts -> INTERNAL_API_ORIGIN -> Fastify public repository
  │                                                        -> publicPredicate -> PostgreSQL
  ├─ /robots.txt -> Next robots.ts -> configured canonical site origin
  ├─ /sitemap.xml -> Next sitemap.ts -> same public distribution DTO -> publicPredicate
  ├─ /rss.xml -> Next Route Handler -> same public distribution DTO -> XML escape -> Response
  └─ admin Export button -> relative /api/admin/export -> Fastify auth + exact Origin
                                                   -> retained repository -> JSON attachment
```

### Recommended Project Structure

```text
packages/contracts/src/
├── distribution.ts       # [ASSUMED] public listing + export manifest schemas
apps/api/src/content/
├── public-repository.ts  # extend with public-only distribution query
├── export-repository.ts  # [ASSUMED] retained-source export selection
apps/api/src/routes/
├── public-posts.ts        # extend already-registered public plugin with distribution DTO route
├── admin-export.ts        # [ASSUMED] authenticated attachment route
apps/web/app/
├── sitemap.ts             # Next metadata convention
├── robots.ts              # Next metadata convention
├── rss.xml/route.ts       # Next XML Route Handler convention
└── lib/site-metadata.ts   # [ASSUMED] pure page metadata helpers
```

### Pattern 1: One public-distribution projection

**What:** Add a narrowly selected API projection for all discovery output: public article slug/title/summary/published time/update time, visible terms, and whether About is published. Apply `publicPredicate` in the query, not after loading rows. The current quote `"status: \"published\" as const"` is already the DTO invariant. [VERIFIED: `apps/api/src/content/public-repository.ts:53-73`]

**When to use:** Sitemap, RSS, and dynamic article metadata all consume this projection. They must never use the authenticated retained repository or detail `markdown` selection merely to determine visibility.

**Anti-pattern:** calling `/admin/posts` from Web metadata or filtering draft rows in Next. The admin list is protected but returns retained records; the public list is the verified confidentiality boundary. [VERIFIED: `apps/api/src/routes/admin-posts.ts:117-128`; `apps/api/src/routes/public-posts.ts:15-35`]

### Pattern 2: Canonical origin as validated server configuration

**What:** Add one server-only Web helper that accepts a configured absolute `PUBLIC_ORIGIN` [ASSUMED: exact Web helper/variable validation shape], trims its trailing slash, and returns `URL` instances for canonical, OG, robots Sitemap, and RSS links. The API already uses the exact public origin for unsafe-request Origin checks. [VERIFIED: `apps/api/src/app.ts:44-46`; `apps/api/src/routes/admin-posts.ts:74-86`]

**When to use:** root metadata sets `metadataBase`; each page emits one canonical relative path and page-specific `openGraph.url`. Pass this same origin into Web compose/Docker/run configuration rather than hardcoding the frozen production hostname. Next documents that `metadataBase` composes relative canonical and OG URLs. [CITED: `https://nextjs.org/docs/app/api-reference/functions/generate-metadata`]

### Pattern 3: Static versus dynamic metadata

**What:** Root layout establishes site defaults and title template; static public pages export local `metadata`; `posts/[slug]`, `categories/[slug]`, and `tags/[slug]` use `generateMetadata` with the same server API result as the page. Use React `cache` around the data getter if the internal `fetch(..., { cache: "no-store" })` does not obtain request deduplication. The quote `fetch(\`${internalApiOrigin}${path}\`, { cache: "no-store" })` identifies the current dynamic fetch mode. [VERIFIED: `apps/web/app/lib/api.ts:22-39`; CITED: `https://nextjs.org/docs/app/getting-started/metadata-and-og-images`]

**When to use:** Every public route receives a non-empty, route-specific title, description (prefer `seoDescription`, then summary, then safe site fallback), canonical URL, and Open Graph `website`/`article` fields. A page result that is verified absent must call `notFound()` in both page and metadata path; an upstream error remains an error, not a misleading canonical page. [VERIFIED: `apps/web/app/posts/[slug]/page.tsx:8-14`; `apps/web/app/lib/api.ts:25-39`]

### Pattern 4: Framework-owned discovery endpoints, one API source

**What:** Use `app/robots.ts` and `app/sitemap.ts`; both are Next metadata-file conventions. Use `app/rss.xml/route.ts` for the feed, returning XML with an explicit `Content-Type`. [CITED: `https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots`; CITED: `https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap`; CITED: `https://nextjs.org/docs/app/api-reference/file-conventions/route`]

**When to use:** Make these endpoints dynamic/no-store because current pages already force runtime public data and lifecycle changes must not wait for a build. Do not claim long-lived caching until Phase 4 has a validated invalidation policy. The installed docs state metadata files are cached by default unless they use runtime APIs/dynamic configuration. [CITED: `https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap`]

### Pattern 5: Versioned, lossless logical export

**What:** Use a single JSON attachment with a top-level, literal format marker [ASSUMED: e.g. a documented `format`/`version` pair] and arrays for articles, taxonomy, and the About record. Articles preserve raw `markdown`, lifecycle `status`, `publishedAt`, `seoDescription`, category/tag relation, cover URL/media reference, and timestamps; do not serialize rendered HTML as authority. The existing source schema stores `markdown`, `seoDescription`, `status`, `publishedAt`, and `deletedAt`. [VERIFIED: `apps/api/src/db/schema.ts:40-62`]

**When to use:** The API route uses the existing `guard()` semantics and exact Origin check for the GET-like export download (prefer POST if retaining the established mutation/Origin convention), returns `cache-control: no-store`, and supplies `content-disposition: attachment`. Export test fixtures must prove an archive rehydrates the original source fields exactly, including non-public rows.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Head-tag serialization | JSX `<head>` tags scattered across pages | Next `Metadata` / `generateMetadata` | Correct canonical, description, OG and inherited title emission are framework responsibilities. |
| Sitemap/robots serialization | Custom text/XML generators | Next `robots.ts` / `sitemap.ts` metadata files | Framework provides the route/file convention and typed response shapes. |
| RSS transport | A second HTTP service | Next `Response` Route Handler | RSS is a same-origin non-UI response; Next documents this exact route pattern. |
| Visibility policy | Separate filters in feed/Sitemap/Web | `publicPredicate` at the API repository | One predicate is already verified against all lifecycle states. |
| Export filename/path archive | ZIP/tar path construction | A JSON download with a versioned manifest | No path traversal or archive dependency; JSON is enough to reconstruct raw Markdown and metadata. |
| XML character handling | Direct template interpolation | A tiny pure XML-text escaping function with hostile-input tests | Next's RSS example explicitly requires sanitizing markup input; titles/summaries are untrusted content. [CITED: `https://nextjs.org/docs/app/guides/backend-for-frontend`] |

## Common Pitfalls

### Pitfall 1: A Sitemap/RSS leaks a lifecycle state

**What goes wrong:** a new query omits `deletedAt IS NULL` or `publishedAt IS NOT NULL`, exposing a draft, unpublished, deleted, or scheduled-null article.

**How to avoid:** export/reuse `publicPredicate`, add one all-states integration fixture, and assert no hidden slug/title/summary/raw Markdown exists in Sitemap, RSS, or public distribution response. [VERIFIED: `apps/api/src/content/public-repository.ts:8-12`; `apps/api/test/phase2-public-visibility.test.ts:42-65`]

### Pitfall 2: Canonicals point at the loopback/internal API host

**What goes wrong:** use `INTERNAL_API_ORIGIN` for an externally visible link.

**How to avoid:** internal origin is only for Web server fetches (`"http://127.0.0.1:3001"` locally); canonical/OG/RSS/Sitemap URLs derive only from validated public origin. [VERIFIED: `apps/web/app/lib/api.ts:22-39`; `apps/web/next.config.ts:6-11`]

### Pitfall 3: Page metadata and page UI disagree

**What goes wrong:** dynamic metadata fetches a different unvalidated path, maps an outage to 404, or reads a draft.

**How to avoid:** expose one cached page-data helper over existing `PublicResult`; only a parsed `{"error":"not_found"}` is absence. [VERIFIED: `apps/web/app/lib/api.ts:25-39`; `packages/contracts/src/public-posts.ts:54-60`]

### Pitfall 4: RSS becomes malformed or an injection surface

**What goes wrong:** `&`, `<`, quotes, or control characters in title/summary are concatenated into XML; Markdown HTML is emitted as feed description.

**How to avoid:** XML-escape every interpolated text/URL, use `summary` as the description, emit `title`, `link`, permanent-link `guid`, and RFC 822 `pubDate`, then parse the response with local `xmllint --noout`. RSS specifies required channel `title`, `link`, `description`; item `guid` can identify a permanent link. [CITED: `https://www.rssboard.org/rss-specification`]

### Pitfall 5: Export cannot recreate the original work

**What goes wrong:** export only includes public posts, rendered HTML, or term display names; it loses draft/unpublished/deleted source or association identity.

**How to avoid:** export every retained article (not `publicPredicate`), raw Markdown, explicit status/dates, category/tag definitions and stable IDs/slugs. Validate a schema, reconstruct a deterministic normalized object, and compare it to seeded source rows. The source status union is exactly `"draft", "published", "unpublished"`. [VERIFIED: `packages/contracts/src/admin-posts.ts:33-39`]

## Code Examples

### Next metadata-file convention

```ts
// Source: Next 16 official docs
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/" }, sitemap: siteUrl("/sitemap.xml") };
}
```

The Next-provided values `"*"`, `"/"`, `MetadataRoute.Robots`, and `sitemap` occur in its documented example. [CITED: `https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots`] `siteUrl` is a proposed local helper [ASSUMED].

### RSS non-UI response boundary

```ts
// Source: Next 16 official docs; `xml` is already escaped XML [ASSUMED].
export async function GET() {
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
```

The documented Route Handler uses `GET`, `new Response`, and a `Content-Type` header to return RSS XML. [CITED: `https://nextjs.org/docs/app/api-reference/file-conventions/route`] The exact MIME parameter choice is implementation discretion [ASSUMED].

### Existing public boundary to extend

```ts
export const publicPredicate = and(
  eq(schema.articles.status, "published"),
  isNull(schema.articles.deletedAt),
  isNotNull(schema.articles.publishedAt),
);
```

This is copied verbatim from [VERIFIED: `apps/api/src/content/public-repository.ts:8-12`]. New public distribution repository queries must begin from this boundary.

## State of the Art

| Old Approach | Current Approach | Impact |
|---|---|---|
| Manually construct duplicated `<head>` tags | Next Metadata API / `generateMetadata` | Server-rendered unique metadata with framework serialization. [CITED: `https://nextjs.org/docs/app/api-reference/functions/generate-metadata`] |
| Static checked-in crawler files | `robots.ts` and `sitemap.ts` metadata handlers | Discovery stays consistent with runtime publication state. [CITED: `https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap`] |
| Nullable Web public fetch result | `ok` / `not_found` / `upstream_error` union | Metadata must preserve true absence versus upstream failure. [VERIFIED: `apps/web/app/lib/api.ts:24-39`] |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | RESOLVED: the logical export is JSON and excludes binary media; it retains nonbinary media references, while Phase 4 owns media backup/restore. | Summary, Pattern 5 | Locked Phase 3 scope; PORT-01 requires Markdown and necessary metadata, not media bytes. |
| A2 | A Web server helper can validate/use `PUBLIC_ORIGIN` for public absolute URLs and compose/Docker verification will pass it through. | Pattern 2 | Build/runtime configuration needs an additional explicit variable or a different deployment-safe source. |
| A3 | RESOLVED: absent `page` and exact scalar `page=1` canonicalize to the query-free base; exact single base-10 pages `2..totalPages` self-canonicalize as `?page=N`; arrays, extra parameters, leading zeroes, invalid, and out-of-range values are `noindex,follow` and excluded from Sitemap. | Pattern 4 | Locked Phase 3 URL policy. |
| A4 | A small tested XML escaping function is adequate in place of a package. | Primary recommendation | Incorrect escaping would make feeds malformed or unsafe. |

## Resolved Questions

1. **Binary media is excluded from Phase 3 export.** The manifest retains safe media UUID/public references and necessary metadata, but no bytes, base64, blob/archive members, source keys, derivative keys, or storage paths. Phase 4 owns binary media backup/restore. [VERIFIED: `.planning/REQUIREMENTS.md:25-26`; `.planning/phases/02-complete-reading-experience/02-04-SUMMARY.md:48-66`]

2. **Canonical and Sitemap pagination policy is locked.** For every paginated public base route, absent `page` and exact scalar `page=1` use the query-free canonical. Only an exact single base-10 scalar `page=N` in `2..totalPages` self-canonicalizes to `?page=N` and may enter Sitemap. Arrays/repeated values, any extra query key, leading zeroes, empty/non-base-10/invalid values, and values outside `1..totalPages` are `noindex,follow` and excluded from Sitemap. [VERIFIED: `packages/contracts/src/public-posts.ts:5-17`; `apps/web/app/categories/[slug]/page.tsx:17-30`]

## Environment Availability

No new external runtime dependency is required. Node `v24.15.0`, npm `11.12.1`, pnpm `11.20.0`, and local `xmllint` are available in this workspace [VERIFIED: command probes on 2026-08-09]. `xmllint` is a local verification helper, not an application dependency.

## Validation Architecture

`workflow.nyquist_validation` is explicitly `false` in `.planning/config.json`; this section is retained because Phase 3 must extend the already-established verification architecture. [VERIFIED: `.planning/config.json:22-28`]

### Test Framework

| Property | Value |
|---|---|
| API framework | Node built-in `node:test` via `tsx --test test/*.test.ts` |
| Browser framework | Playwright `@playwright/test@1.62.1` |
| API quick run | `corepack pnpm --filter @blog-x/api test` |
| Full local gate | `corepack pnpm local:verify -- --phase2-full` extended to a Phase 3 flag [ASSUMED: exact flag] |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| SEO-01 | Each public route emits unique title/description/canonical/OG URL; absent post remains 404 and outage remains recovery error. | Managed Playwright + HTML head assertions | `corepack pnpm local:verify -- --phase3-metadata` | ❌ Plan 03-02 |
| SEO-02 | `robots.txt` names Sitemap; Sitemap contains only static public routes, public terms/about, and published posts. | Managed API/Web/PostgreSQL journey + XML checks | `corepack pnpm local:verify -- --phase3-metadata` | ❌ Plan 03-02 |
| FEED-01 | RSS is XML, has latest published permanent links, and excludes hidden records. | Disposable-database API suite + managed Web request/XML parse | `corepack pnpm local:verify -- --phase3-api` then `corepack pnpm local:verify -- --phase3-metadata` | ❌ Plans 03-01/03-02 |
| PORT-01 | Authenticated same-origin export validates and reconstructs raw Markdown/metadata for all retained lifecycle states. | Disposable-database Fastify suite + managed browser download | `corepack pnpm local:verify -- --phase3-export-api` then `corepack pnpm local:verify -- --phase3-full` | ❌ Plan 03-04 |

### Wave 0 Gaps

- [ ] `apps/api/test/public-distribution.test.ts` and `apps/api/test/distribution-export.test.ts` — keep the tests fail-closed when their database URL is absent, and invoke them at task boundaries only through the generated/migrated Phase 3 runner. The runner must inspect test output and fail if either suite reports a skip.
- [ ] `apps/web/e2e/phase3-distribution.spec.ts` — require generated Web origin, administrator credentials, and run ID; missing values must fail rather than call `test.skip`. Use the existing one-origin listener pattern and inspect rendered metadata/RSS/Sitemap/robots/download behavior. [VERIFIED: `apps/web/e2e/phase2-reading.spec.ts:51-57`]
- [ ] Extend `scripts/local-verify.mjs` first in Plan 03-01 with local-only `--phase3-api` and managed-browser seams, then extend rather than replace them in Plans 03-02 through 03-04. It must create/migrate a disposable database, provide the exact suite URL/origin/credentials, reject skipped semantic tests, preserve generated namespace/loopback isolation, and never call a cloud address. [VERIFIED: `.planning/phases/02-complete-reading-experience/02-VERIFICATION.md:47-53`]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | Yes | Export route verifies the opaque session exactly as existing admin routes do. [VERIFIED: `apps/api/src/routes/admin-posts.ts:74-82`] |
| V3 Session Management | Yes | Forward admin cookies only server-side; no token in browser storage. [VERIFIED: `apps/web/app/lib/api.ts:42-53`] |
| V4 Access Control | Yes | Export is an admin-only route; feed/Sitemap stay public but API-selected. |
| V5 Input Validation | Yes | Zod strict schemas at API/Web DTO boundaries. [VERIFIED: `packages/contracts/src/admin-posts.ts:9-20`] |
| V6 Cryptography | No new crypto | Reuse existing session implementation; add no crypto protocol. |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| Draft/unpublished/deleted record disclosure via Sitemap/RSS/OG | Information disclosure | Query through `publicPredicate`; all-states regression fixtures. |
| Export download by an unauthenticated or cross-origin caller | Elevation / CSRF | Existing session guard, exact `Origin`, `no-store`, same-origin `/api` request. |
| XML injection/malformed feed | Tampering | Escape XML text/attributes; never interpolate rendered Markdown; parse output in tests. |
| Header injection / unsafe filename | Tampering | Fixed server-generated attachment name; no user supplied filename/header value. |
| Internal topology disclosure in canonical/feed links | Information disclosure | Separate validated public origin from `INTERNAL_API_ORIGIN`. |

## Sources

### Primary (HIGH confidence)

- [Next.js Metadata and OG Images](https://nextjs.org/docs/app/getting-started/metadata-and-og-images) — installed Next 16.3 documentation for static/dynamic metadata and server-only use.
- [Next.js generateMetadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata) — metadata fields, `metadataBase`, canonical and Open Graph composition.
- [Next.js robots.txt](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots) and [sitemap.xml](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap) — installed metadata-file conventions and caching behavior.
- [Next.js Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route) and [Backend for Frontend guide](https://nextjs.org/docs/app/guides/backend-for-frontend) — native non-UI RSS/XML responses and sanitization warning.
- In-repo sources cited inline, especially `apps/api/src/content/public-repository.ts`, `apps/web/app/lib/api.ts`, `apps/api/src/routes/admin-posts.ts`, and contracts/schema sources.

### Secondary (MEDIUM confidence)

- [RSS 2.0 Specification](https://www.rssboard.org/rss-specification) — current RSS Advisory Board publication inspected 2026-08-09; channel requirements, item permalink/guid/date semantics, and XML conformance.

### Tertiary (LOW confidence)

None.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — no new dependency; Next 16.3 APIs were read from the installed official documentation.
- Architecture: HIGH — follows the existing API/public-predicate/internal-origin boundary verified in Phase 2.
- Pitfalls: HIGH — lifecycle secrecy, same-origin, and error semantics are already covered by source and Phase 2 verification; RSS format details are backed by its current specification.

**Research date:** 2026-08-09
**Valid until:** 2026-09-08, or immediately after a Next.js version change.
