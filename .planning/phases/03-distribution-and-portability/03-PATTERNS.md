# Phase 3: Distribution and Portability — Pattern Mapping

**Mapped:** 2026-08-09
**Phase:** 03 — Distribution and Portability
**Scope:** `PORT-01`, `SEO-01`, `SEO-02`, `FEED-01`

## Guardrails Carried into Every Change

- Work stays local. Do not contact, deploy to, or modify either cloud server; in particular the primary server remains frozen.
- Browser-visible requests remain relative to the Web origin (`/api`, `/media`, public pages). `INTERNAL_API_ORIGIN` is server-only and must never become a canonical, Open Graph, RSS, Sitemap, or browser URL.
- Keep the existing Web → Fastify → repository → PostgreSQL ownership split. Web must not import `pg`, Drizzle, API services, media storage, or raw Markdown rendering.
- Public distribution starts at the database predicate, never from filtering an admin response in Next:

  ```ts
  export const publicPredicate = and(
    eq(schema.articles.status, "published"),
    isNull(schema.articles.deletedAt),
    isNotNull(schema.articles.publishedAt),
  );
  ```

  Source: `apps/api/src/content/public-repository.ts`.
- Shared wire contracts are Zod strict allowlists. Validate API output in both Fastify and the Web server consumer; use schema parsing instead of casts.
- No dependency, CDN, new service, or static build-time content snapshot is required.

## Proposed File Inventory and Data Flow

| File | Change | Role / data flow | Closest existing analog |
|---|---|---|---|
| `packages/contracts/src/distribution.ts` | Create | Strict public discovery DTO and versioned logical-export manifest DTO. API serializes only this allowlist; Web parses the public portion. | `packages/contracts/src/public-posts.ts`, `packages/contracts/src/pages.ts` |
| `packages/contracts/src/index.ts` | Modify | Re-export distribution contracts to both apps. | Existing one-line `export * from "./public-posts";` pattern |
| `apps/api/src/content/public-repository.ts` | Modify | Add a one-query/repository-owned public discovery projection, selected with `publicPredicate`; feeds Sitemap/RSS and possibly metadata helpers. | `listPage()` / `findDetailBySlug()` in the same file |
| `apps/api/src/content/export-repository.ts` | Create | Read all portability-owned source rows (including lifecycle/soft-deleted rows as planned), taxonomies, associations, and About without rendering Markdown. | `apps/api/src/content/admin-repository.ts`; `apps/api/src/content/page-repository.ts` |
| `apps/api/src/routes/public-posts.ts` | Modify | Add unauthenticated Fastify GET `/public/distribution` returning only the parsed public discovery DTO; retaining the already-registered plugin keeps the first slice within five files. | Existing public-post routes in the same plugin |
| `apps/api/src/routes/admin-export.ts` | Create | Authenticated same-origin archive attachment; calls export repository and serializes the manifest. | `apps/api/src/routes/admin-posts.ts` guard and mutation pattern |
| `apps/api/src/app.ts` | Modify | Create/register the two repositories/routes in the application composition root. | Existing `createPublicRepository` + `publicPostRoutes` registration |
| `apps/web/app/lib/api.ts` | Modify | Add strict `getPublicDistribution()` server fetch; optionally add an admin export UI helper only if needed. | `getPublicPosts()`, `getPublicPost()`, generic `getPublic()` |
| `apps/web/app/lib/site-metadata.ts` | Create | Server-only validated public-origin, URL construction, metadata composition and RSS XML escaping. | No direct analog; use `app/lib/api.ts` as the server-only helper placement/style analog. |
| `apps/web/app/layout.tsx` | Modify | Root `metadataBase`, shared site description/OG defaults and title template. | Existing typed `Metadata` export in this file |
| `apps/web/app/{page,about/page,archives/page,categories/page,tags/page}.tsx` | Modify | Static route-specific metadata (or helpers) for all public static pages. | Existing SSR public pages and `export const dynamic = "force-dynamic"` |
| `apps/web/app/{posts,categories,tags}/[slug]/page.tsx` | Modify | Dynamic `generateMetadata` from the same public result as page rendering; preserve absence vs outage behavior. | `apps/web/app/posts/[slug]/page.tsx` and taxonomy route pages |
| `apps/web/app/robots.ts` | Create | Next metadata-file response for crawl policy and canonical Sitemap URL. | No repository analog; use Next metadata-file convention as specified by research. |
| `apps/web/app/sitemap.ts` | Create | Next metadata-file response driven only by public distribution DTO. | No direct project analog; public API helper is the integration analog. |
| `apps/web/app/rss.xml/route.ts` | Create | Next Route Handler turns parsed public distribution DTO into escaped RSS XML. | No direct project analog; existing public server components and API helper establish data/error semantics. |
| `apps/web/app/admin/page.tsx` plus a small client component if an explicit button is required | Modify/Create | Initiates a relative same-origin archive download; receives no archive data through an SSR API fetch. | `apps/web/app/admin/_components/ArticleActions.tsx` client fetch pattern |
| `apps/api/test/public-distribution.test.ts` / `distribution-export.test.ts` | Create | Disposable-DB `app.inject` tests for public secrecy and authenticated export round trip; task-boundary execution always comes from the Phase 3 runner and may not pass via skip. | `apps/api/test/phase2-public-visibility.test.ts`, `pages-archive.test.ts` |
| `apps/web/e2e/phase3-distribution.spec.ts` | Create | Full same-origin browser assertion of rendered head, robots, Sitemap, RSS and export download. | `apps/web/e2e/phase2-reading.spec.ts` |
| `scripts/local-verify.mjs` | Modify | Add a Phase-3 full flag/suites without weakening generated namespace, loopback and cleanup controls. | Existing `phase2Full`, `databaseSuites`, `journey` branching |
| `scripts/local-verify.test.mjs` / `scripts/check-boundaries.mjs` | Usually unchanged; extend only if a new regression cannot be expressed by current checks | Continue static boundary validation for all new `apps/web/app/**` files. | Existing audit fixture and `webRuntimeSurface()` |

### Intended request paths

```text
Web SSR metadata / sitemap.ts / rss.xml/route.ts
  -> app/lib/api.ts (INTERNAL_API_ORIGIN, no-store, strict parse)
  -> GET /public/distribution
  -> PublicRepository.discovery() + publicPredicate
  -> PostgreSQL

Browser admin Export control
  -> POST /api/admin/export (same Web origin rewrite, cookie + Origin)
  -> Fastify guard + exact Origin + ExportRepository.archive()
  -> versioned JSON attachment containing raw Markdown and source metadata
```

The browser must not call `GET /public/distribution` directly as a substitute for SSR, and it must never call the internal API host.

## Shared Patterns to Reuse Exactly

### Imports and shared contracts

Use package imports and type-only framework imports, with `.js` only for local API ESM imports:

```ts
import { publicPostListResponseSchema, publicPostPageSize } from "@blog-x/contracts";
import type { FastifyPluginAsync } from "fastify";
import type { PublicRepository } from "../content/public-repository.js";
```

Sources: `apps/api/src/content/public-repository.ts`, `apps/api/src/routes/public-posts.ts`.

New `distribution.ts` should follow the existing strict boundary shape—not an open `z.record` archive:

```ts
export const publicPostListItemSchema = z.object({
  title: z.string(),
  summary: z.string(),
  slug: z.string(),
  publishedAt: z.string().datetime({ offset: true }),
  status: z.literal("published"),
  // ...
}).strict();
```

Source: `packages/contracts/src/public-posts.ts`. Dates cross the wire as offset ISO strings, UUIDs use `z.uuid()`, status uses a literal/enum, and every nested object is strict. The export manifest needs a literal format marker and numeric/literal version, explicit article/category/tag/about arrays, and raw `markdown: z.string()`—not rendered HTML or persistence `select *` output. Export every required authority field that exists in `articles`: identity, title, summary, cover URL/media reference/alt intent, slug, raw Markdown, SEO description, status, publication/deletion/creation/update times, category reference and ordered tag references. Include category/tag identities and About source. Binary media is not part of this Phase-3 logical archive.

### Repository selection and transactions

Repository factories accept a typed Drizzle database and return narrow methods:

```ts
type Database = NodePgDatabase<typeof schema>;

export function createPublicRepository(db: Database) {
  async function listPage(page: number) { /* query then parse */ }
  async function findDetailBySlug(slug: string) { /* query then map */ }
  return { findDetailBySlug, listPage };
}
```

Source: `apps/api/src/content/public-repository.ts`.

For a stable multi-table distribution/archive snapshot, follow the existing read-only snapshot option:

```ts
return db.transaction(async (tx) => {
  // select narrow columns; resolve relations deterministically
}, { isolationLevel: "repeatable read", accessMode: "read only" });
```

Source: `listPage()` in `apps/api/src/content/public-repository.ts` and `archive()` in `apps/api/src/content/page-repository.ts`.

Do not reuse `createAdminPostRepository().listRetained()` for export without an explicit decision: it filters `isNull(deletedAt)`, whereas the Phase-3 research recommendation is to preserve soft-deleted source in the archive. A dedicated `ExportRepository` is the cleanest way to make that divergence conspicuous and tested. It should select source data directly and not run `renderMarkdown`.

The discovery method may live on `PublicRepository` because it shares the public predicate. It should select only title, summary, slug, publication/update time and public taxonomy/availability fields needed by feeds and URLs. It must not select `markdown`, `deletedAt`, storage keys, sessions, or admin-only IDs merely for discovery.

### Fastify registration and route responses

`app.ts` owns all composition. Copy the registration rhythm:

```ts
await app.register(publicPostRoutes, {
  publicRepository: createPublicRepository(db),
});
```

Source: `apps/api/src/app.ts`.

Public route handlers do not authenticate, validate only relevant input, and return parsed DTOs:

```ts
app.get<{ Params: { slug: string } }>("/public/articles/:slug", async (request, reply) => {
  const article = await options.publicRepository.findDetailBySlug(request.params.slug);
  if (!article) {
    return reply.code(404).send(publicPostNotFoundResponseSchema.parse({ error: "not_found" }));
  }
  return publicPostDetailSchema.parse({ /* explicit public fields */ });
});
```

Source: `apps/api/src/routes/public-posts.ts`.

`/public/distribution` should use this pattern, return a strict DTO, and have no cookie/origin requirement. Its query itself—not Next—enforces public visibility.

### Auth, exact Origin, and attachment behavior

Protected routes first set no-store and then authenticate with the opaque HttpOnly session cookie:

```ts
async function guard(request: FastifyRequest, reply: /* reply subset */) {
  reply.header("cache-control", "no-store");
  if (!await options.sessionAuth.administratorIdForToken(request.cookies[sessionCookieName])) {
    reply.code(401).send({ error: "unauthorized" });
    return false;
  }
  return true;
}

function trustedOrigin(request: FastifyRequest) {
  return Boolean(options.publicOrigin) && request.headers.origin === options.publicOrigin;
}
```

Source: `apps/api/src/routes/admin-posts.ts`.

The export endpoint is a sensitive, browser-initiated download and should mirror protected mutations: `POST /admin/export`, `guard()`, exact `Origin`, then strict archive serialization. Send `403 { error: "forbidden" }` for an absent/mismatched origin and `401 { error: "unauthorized" }` before access. Use `cache-control: no-store`, `content-type: application/json; charset=utf-8`, and a safe constant `content-disposition: attachment; filename="blog-x-export-v1.json"`; do not put a user-provided title/slug in the header. Unhandled database errors should still throw to Fastify's error handling rather than silently returning a partial archive.

The UI request follows the existing client-side same-origin mutation shape:

```ts
const response = await fetch(`/api/admin/posts/${post.id}/${action}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}",
  credentials: "same-origin",
});
```

Source: `apps/web/app/admin/_components/ArticleActions.tsx`. For an actual download, a normal same-origin form POST or a `fetch` that validates headers and turns the response into a Blob are both compatible; no secret/token belongs in URL parameters or browser storage.

### Web server API integration and error classification

Public server fetches use the private origin, bypass response caching, and parse before returning data:

```ts
const internalApiOrigin = process.env.INTERNAL_API_ORIGIN ?? "http://127.0.0.1:3001";

const response = await fetch(`${internalApiOrigin}${path}`, { cache: "no-store" });
const parsed = schema.safeParse(await response.json());
return parsed.success ? { kind: "ok", data: parsed.data } : { kind: "upstream_error" };
```

Source: `apps/web/app/lib/api.ts`.

Add `getPublicDistribution()` through the same generic helper and new strict schema. Maintain the established three-way public result: only a parsed `{ error: "not_found" }` can become `not_found`; malformed data, non-OK data and connection errors are `upstream_error`. For discovery endpoints that cannot be absent, errors remain errors. Never make an API failure look indexable or feedable.

### Next App Router pages, metadata, and discovery routes

Current App Router pages are async server components with typed promise params and clear not-found/upstream separation:

```ts
export default async function PublicArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const result = await getPublicPost((await params).slug);
  if (result.kind === "not_found") notFound();
  if (result.kind === "upstream_error") throw new Error("public content unavailable");
  const article = result.data;
  // render
}
```

Source: `apps/web/app/posts/[slug]/page.tsx`.

`generateMetadata` in each dynamic public page must call the same cached data helper/result semantics as the page. Preserve `notFound()` for verified absence and throw on upstream error. Static public pages can export `metadata`; the root currently establishes the precedent:

```ts
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Blog X", description: "个人技术博客" };
```

Source: `apps/web/app/layout.tsx`.

Extend it with validated public `metadataBase`, a title template and site-wide Open Graph defaults. Local page metadata must choose a non-empty description using the documented order `seoDescription`, then summary, then a safe site fallback. Metadata URLs derive only from a single canonical Web origin helper, never `INTERNAL_API_ORIGIN`.

Keep dynamic pages dynamic where content lifecycle is fetched at request time. Existing static public listing pages already use:

```ts
export const dynamic = "force-dynamic";
```

Sources: `apps/web/app/page.tsx`, `about/page.tsx`, `categories/page.tsx`.

Use the Next conventions proposed by research—not JSX `<head>` tags or a static `public/robots.txt`:

- `app/robots.ts`: typed metadata-file default function; robot allow policy and canonical `/sitemap.xml` URL.
- `app/sitemap.ts`: typed metadata-file default function, dynamic/no-store, maps only the parsed distribution DTO into canonical URLs and `lastModified` values.
- `app/rss.xml/route.ts`: `export async function GET()` returning `new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } })`.

RSS should interpolate only escaped text/URLs into a small fixed XML skeleton. Escape `&`, `<`, `>`, `"`, and `'`; reject/remove disallowed XML control characters before interpolation. Emit channel title/link/description and each item's title, permanent `link`, permanent-link `guid`, summary description, and RFC-822 `pubDate`. Do not include Markdown HTML.

### Metadata coverage and URL policy

The implementation plan must touch each current public route, not only posts:

| Public route | File | Metadata data source | Sitemap decision |
|---|---|---|---|
| `/` | `app/page.tsx` | static site copy | include root canonical only; do not enumerate transient query variants |
| `/posts/[slug]` | `app/posts/[slug]/page.tsx` | public article/detail or discovery item | include each public article only |
| `/categories` and `/categories/[slug]` | category pages | static copy / public taxonomy | include list; include terms that have public articles |
| `/tags` and `/tags/[slug]` | tag pages | static copy / public taxonomy | include list; include terms that have public articles |
| `/archives` | `app/archives/page.tsx` | static copy | include |
| `/about` | `app/about/page.tsx` | public About result | include only when the About page is published |

Pagination policy is resolved and must be implemented exactly. Current UI may continue serving query variants, but indexability is determined as follows: absent `page` and exact scalar `page=1` canonicalize to the query-free base; only one exact base-10 scalar `page=N` within `2..totalPages` self-canonicalizes as `?page=N`. Repeated/array values, any extra parameter, leading zeroes, empty/non-base-10/invalid values, and values outside `1..totalPages` receive `noindex,follow` and are excluded from Sitemap. Sitemap enumerates only the query-free base plus real pages `2..totalPages`.

### API integration-test pattern

Use disposable database configuration, setup/teardown and `app.inject`; do not test an external running server:

```ts
const databaseUrl = process.env.PHASE2_TEST_DATABASE_URL;

test("...", async (context) => {
  if (!databaseUrl) throw new Error("PHASE3_TEST_DATABASE_URL must name the runner-owned disposable migrated database");
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  await pool.query("truncate table sessions, article_tags, articles, categories, tags, site_pages, media, administrators cascade");
  context.after(async () => { /* truncate + pool.end */ });
  const app = await buildApp({ publicOrigin: origin });
  context.after(async () => { await app.close(); });
});
```

Source: `apps/api/test/phase2-public-visibility.test.ts`.

`public-distribution.test.ts` and `distribution-export.test.ts` may retain a defensive missing-URL failure message for direct invocation, but the plan's automated verification must never invoke them without a database. `scripts/local-verify.mjs` establishes a Phase-3-scoped path that creates and migrates a generated database, injects the exact test URL, captures TAP output, and fails if the semantic suite is skipped or reports zero executed tests. `distribution-export.test.ts` needs fixtures for published, draft, unpublished, soft-deleted and null-publication rows, public/nonpublic terms, plus draft/published About. Assert:

- public distribution JSON contains only predicate-matching content and never raw Markdown, source/derivative keys, admin IDs, or hidden titles/summaries/slugs;
- wrong/missing login gets `401`, authenticated wrong/missing Origin gets `403`, correct session+origin receives attachment and `no-store`;
- parse archive with the exported manifest schema, normalize date/relation ordering, and compare each source field—including raw Markdown, state and soft-deleted row—to seeded data;
- no route calls Markdown renderer while exporting (observable archive has raw source, not `renderedHtml`).

### Playwright pattern

Use an isolated full-journey test, required generated credentials/run id, and origin spying from the established Phase 2 test:

```ts
const webOrigin = process.env.E2E_WEB_ORIGIN ?? "http://127.0.0.1:3100";

page.on("request", (request) => {
  if (!/^https?:/.test(request.url())) return;
  const url = new URL(request.url());
  expect(url.origin).toBe(webOrigin);
});
```

Source: `apps/web/e2e/phase2-reading.spec.ts`.

The Phase 3 E2E must require, not default or skip on, a runner-generated Web origin, administrator username/password, and run ID. The scoped verifier owns PostgreSQL migration, API/Web lifecycle, credentials, and `PUBLIC_ORIGIN`; it captures Playwright output and fails on skipped journeys or zero matching tests. The E2E should publish enough data through visible UI, then inspect `page.locator("head")` / response text for route-specific title, description, canonical and OG URL; request `/robots.txt`, `/sitemap.xml`, and `/rss.xml` through `context.request`; parse/check XML and assert published permanent links exist while hidden lifecycle fixture strings do not. Download the admin archive through the same Web origin and verify its content type/disposition and parsed manifest. Do not invoke the database or cloud hosts from the browser test.

### Local verifier and boundary checks

`local-verify.mjs` already has the correct phased extension seam:

```ts
const databaseSuites = [
  ["AUTH_TEST_DATABASE_URL", "apps/api/test/auth-session.test.ts"],
  // ...
  ...(phase2Full ? [["PHASE2_TEST_DATABASE_URL", "apps/api/test/phase2-public-visibility.test.ts"]] : []),
];
```

Source: `scripts/local-verify.mjs`.

Add `phase3Full` alongside `phase2Full`; include the new API suite and run `phase3-distribution.spec.ts` under the existing generated Compose namespace/loopback `webOrigin`. Preserve: generated namespace validation, image build, concurrent migrations, schema verification, generated credentials, secret redaction, `docker-compose down --volumes` only for the validated namespace, and final cleanup. No server address should enter a test fixture or config.

Existing boundary audit automatically covers a new `apps/web/app/**` file:

```ts
function webRuntimeSurface(path) {
  return path === "apps/web/next.config.ts" || path.startsWith("apps/web/app/");
}
```

Source: `scripts/check-boundaries.mjs`. It rejects Web imports of `pg`/Drizzle/API code, database URLs, filesystem/media-processing imports, media storage keys, and server public addresses. Do not loosen the regexes to accommodate Phase 3. Extend the static fixture only if the new public-origin helper or RSS route reveals a concrete blind spot.

## No Analog Found — Decisions That Need Deliberate Implementation

| Item | Why no direct analog exists | Required decision/constraint |
|---|---|---|
| Versioned export manifest | Existing contracts model requests/responses, not a portable archival format | Define and document literal format/version, exact included fields, stable relation representation/order, and explicit exclusion of media binaries. Schema parse the final manifest. |
| Export repository including soft-deleted rows | `AdminPostRepository.listRetained()` deliberately excludes deleted rows | Dedicated read-only archive query must intentionally include recoverable soft-deleted content while keeping its API admin-only. |
| Admin archive attachment/download UI | Existing mutations return JSON; no attachment flow exists | Keep POST + exact Origin + opaque cookie; constant filename; no cache; browser receives it only through `/api`. |
| Validated canonical public-origin helper | API has raw `PUBLIC_ORIGIN` equality for CSRF, but Web has no public URL helper | Validate absolute HTTP(S) URL once, remove trailing slash, reject a path/query/hash, and use it for every external-facing URL. Never reuse internal origin. |
| App Router `robots.ts` / `sitemap.ts` | The repository has no Next metadata-file implementation | Read installed Next 16 metadata-file docs immediately before coding, export the exact supported type/signature, and force dynamic/no-store behavior. |
| RSS XML serializer / XML hostile-input test | There is no XML generation in the project | Keep a small pure escaped-text helper, test control characters and `&<>\"'`, and validate response with a parser/local `xmllint`; do not add a feed package. |
| Comprehensive metadata coverage | Root has only a basic title/description | Apply shared helper to all seven public route families and decide pagination canonical/Sitemap policy before coding. |

## Completion Checks for Planning

1. Every new cross-app JSON shape is strict and exported from `@blog-x/contracts`.
2. Public discovery has exactly one API repository source using `publicPredicate`; admin archive has a separate retained-source source.
3. All externally visible URLs derive from Web `PUBLIC_ORIGIN`; all server fetches use `INTERNAL_API_ORIGIN`; browser requests remain same-origin.
4. Metadata, robots, Sitemap and RSS have explicit no-hidden-content tests; export has lossless raw-Markdown reconstruction tests.
5. The Phase 3 local verifier runs the new API and browser suites in its existing local isolated topology, while existing boundary checks remain passing.
