# Phase 02 Pattern Mapping — Complete Reading Experience

**Purpose:** map Phase 02 work to the closest proven Phase 01 patterns. This is an implementation routing document, not new product design. Preserve the Web → relative `/api` → Fastify → PostgreSQL boundary and do not contact either server.

## Reusable Assets

| Phase 02 role | Closest existing asset | Exact reusable symbol/pattern | Intended extension |
|---|---|---|---|
| Public visibility | `apps/api/src/content/public-repository.ts` | `const publicPredicate = and(eq(...status, "published"), isNull(...deletedAt), isNotNull(...publishedAt))` | Export/factor the predicate or use it within the same repository for taxonomy, archive and About. Do not recreate it in route handlers. |
| Stable public pagination | `public-repository.ts` | `db.transaction(..., { isolationLevel: "repeatable read", accessMode: "read only" })`, `orderBy(desc(publishedAt), desc(id))` | Filtered category/tag pages keep the fixed 10-item contract and same deterministic tie breaker. |
| Public route plugin | `apps/api/src/routes/public-posts.ts` | `publicPostRoutes: FastifyPluginAsync<...>` and `safeParse(request.query)` | Add taxonomy/archive/About/media GET plugins; return parsed public DTOs only. |
| Admin protection/Origin | `apps/api/src/routes/admin-posts.ts` | local `guard()` + `trustedOrigin()` before every unsafe route | Reuse/extract for taxonomy, About and upload mutations; do not let Next enforce authorization. |
| Admin field errors | `admin-posts.ts` | `fieldErrors(error)` → `fieldErrorResponseSchema.parse(...)` | Taxonomy and media metadata failures retain identical shape/ARIA consumption. |
| Admin update atomics | `apps/api/src/content/admin-repository.ts` | `transactRetained(id, operation)` with `.for("update")` | Model term/About mutations with repository/service layers and transactions where association counts/change must agree. |
| Service/state translation | `apps/api/src/content/article-service.ts` | `serialize(post)` uses contract parse; `ArticleServiceResult` is explicit union | Create focused taxonomy/page/media services; return explicit domain errors rather than leaking driver errors. |
| Strict wire DTOs | `packages/contracts/src/admin-posts.ts`, `public-posts.ts` | `z.object(...).strict()` and `z.infer` types | Create `taxonomy.ts`, `pages.ts`, `media.ts`; public DTOs exclude source paths/EXIF/raw Markdown/session values. |
| Shared renderer | `apps/api/src/content/markdown.ts` | `renderMarkdown(markdown)`; parse → HAST → highlight → final sanitizer | Return `{ html, toc }` through a new renderer result/helper. Heading IDs must arise here, not in Web. |
| Safe HTML boundary | `apps/web/app/_components/ArticleBody.tsx` | only `dangerouslySetInnerHTML` uses API-provided `renderedHtml` | Keep ToC outside this component; extend its CSS only for sanitizer-produced heading anchors/media. |
| Article screen | `apps/web/app/posts/[slug]/page.tsx` | server component fetch then `notFound()` | Replace null-only fetch result with discriminated outcome; compose article metadata and ToC around `ArticleBody`. |
| Public cards/pagination | `apps/web/app/_components/PostCard.tsx`, `Pagination.tsx` | `PublicPostListItem`, `pageHref(page)` and `visiblePages()` | Extend card metadata with category/tags; make `pageHref` accept a route base/filter so taxonomy pagination is not home-only. |
| Public shell/styles | `apps/web/app/page.tsx`, `public.module.css` | `siteHeader`, `page`, `empty`, `articleShell`, `@media (max-width: 700px)` | Extract shared public header; add taxonomy/archive/About/ToC/theme selectors without creating another visual system. |
| Editor upload/insertion | `apps/web/app/admin/_components/ArticleEditor.tsx` | local state, `safeParse`, `fetch("/api/admin/...", { credentials:"same-origin" })`, `role="status"` | Add category/tags and a media panel, preserving unsaved Markdown and debounced preview behavior. |
| Theme root | `apps/web/app/layout.tsx` | root owns `<html lang="zh-CN"><body>` | Add pre-paint script and `data-theme`; client selector is isolated from SSR content. |

## Schema and Migration Patterns

- **Schema home:** `apps/api/src/db/schema.ts` declares tables with `pgTable`, UUID primary keys, timestamp defaults, `uniqueIndex` and `index`. Match its style for `categories`, `tags`, `article_tags`, `site_pages`, `media` and nullable `articles.categoryId`.
- **Generated migration flow:** `apps/api/drizzle.config.ts` has `strict: true`; latest committed artifacts are `apps/api/drizzle/0001_vengeful_trish_tilby.sql`, `meta/0001_snapshot.json`, and `_journal.json`. Change schema, use Drizzle generation, commit SQL/snapshot/journal together, then ensure the API migration runner sees the new numbered file.
- **Existing migration application:** `apps/api/src/app.ts` discovers `/drizzle/*.sql`, serializes with advisory lock and records a fingerprint. Do not add a runtime `push` path or hand-edit historical migration/snapshot files.
- **Contract-first bridge:** `adminPostInputSchema` is parsed client-side before `fetch` and server-side in `adminPostRoutes`; `adminPostSchema` is parsed on the client after a successful response. Phase 02 request, success and error schemas require the same dual-consumer sequence.
- **Versioning:** `ArticleService.nextVersion()` ensures a monotonic public/admin version; a singleton About editor needs equivalent optimistic/version behavior if edits/publish can race.

## Data-flow Mapping

```text
Admin client /api/admin/taxonomy|about|media
  -> Fastify route guard + exact Origin
  -> Zod strict request schema
  -> service/repository + Drizzle transaction/filesystem adapter
  -> strict admin/media DTO

Visitor Web SSR -> app/lib/api.ts INTERNAL_API_ORIGIN
  -> /public/categories|tags|archives|about|articles/:slug or /media/:id
  -> public repository fixed visibility predicate + renderer
  -> strict public DTO -> Server Component / ArticleBody / cards / ToC
```

The media browser path is `/media/<UUID>` through the same domain; it is not an SSR API URL exposed as a server IP. The media storage key/source asset must never cross either DTO boundary.

## Exact Integration Points

| Concern | Existing file / symbol | Change class |
|---|---|---|
| Register new Fastify plugins | `apps/api/src/app.ts`, `await app.register(publicPostRoutes, ...)` | Add route registration/options; retain logger redaction and cookie plugin setup. |
| Public list/detail shape | `packages/contracts/src/public-posts.ts`, `publicPostListItemSchema`, `publicPostDetailSchema` | Add category/tags/ToC or compose imported nested schemas; preserve `.strict()` and response parse. |
| Admin article assignments/cover | `packages/contracts/src/admin-posts.ts`, `adminPostInputSchema`; `ArticleEditor.initialFields/save` | Add category ID/tag IDs and cover media reference/alt/decorative DTO fields; preserve existing slug confirmation. |
| Renderer | `markdown.ts`, `markdownSanitizeSchema`, `highlightCode`, `renderMarkdown` | Add deterministic HAST heading pass and allowed same-origin media rule before final sanitize. Do not enable raw HTML. |
| Posts APIs | `public-repository.ts` / `public-posts.ts` | Add public taxonomy/archive selectors with explicit field selections, never `select()` full rows. |
| About lifecycle | `admin-posts.ts` preview pattern and `article-service.ts` transition pattern | New focused route/service/repository; reuse preview renderer and session/Origin checks. |
| Media streaming | `app.ts` Fastify instance, Fastify local docs `Reference/Reply.md#send-streams` | New route sends API-owned derivative stream with known content type; uses DB lookup, not request-derived file path. |
| SSR error semantics | `apps/web/app/lib/api.ts`, `getPublicPosts`; `posts/[slug]/page.tsx`, `getPublicPost` | Return `{kind:"ok"|"not_found"|"upstream_error"}`. Only 404 calls `notFound`; failure throws to segment error UI. |
| 404/error UI | new `apps/web/app/not-found.tsx`, `error.tsx` | Root 404 and public error recovery screen. Existing public pages must stop presenting fetch failure as normal empty/404. |
| Header/theme | `layout.tsx`, home/post repeated `<header className={styles.siteHeader}>` | Extract `PublicHeader` plus isolated client menu/theme control; preserve page-level SSR. |

## Testing Analogs

| Need | Closest test pattern | Phase 02 application |
|---|---|---|
| Disposable database API test | `apps/api/test/public-list.test.ts` | Env-var-gated disposable DB; `truncate ... cascade` in before/after; direct `app.inject`; deterministic seeded rows. |
| Public confidentiality | `apps/api/test/public-visibility.test.ts` | Seed published/draft/unpublished/deleted rows connected to terms/pages; assert public index/detail count/DTO omit hidden records. |
| Strict validation/Origin/auth | `apps/api/test/article-draft-preview.test.ts` | Assert 401 before session, 403 wrong Origin, 400 exact fields, 409 constraint and success response key set. |
| Renderer safety/parity | `apps/api/test/markdown-renderer.test.ts` and preview/public parity assertion in `article-draft-preview.test.ts` | Heading ID/ToC fixture tests plus media URL allowlist/rejection and About/article shared renderer parity. |
| Browser public reading | `apps/web/e2e/public-reading.spec.ts`, `public-list.spec.ts` | Same isolated launcher and one worker for ToC anchors, taxonomy/archive/About, true 404 vs availability screen and responsive header/theme. |
| Browser editor | `apps/web/e2e/draft-preview.spec.ts` | Reuse response interception, viewport switch and unsaved text assertion for media insert/alt/decorative and taxonomy edit focus/status. |
| Full journey | `apps/web/e2e/phase1-publishing.spec.ts` | Extend only when it remains a readable Phase 2 visitor/admin journey; otherwise keep focused specs. |
| Operations isolation | `scripts/local-verify.mjs`, `scripts/local-verify.test.mjs` | Follow generated namespace and cleanup-only-owned-resource pattern for media test roots; no broad filesystem cleanup. |

## Next 16 Documentation Gate

Read these installed docs before implementation decisions touching their areas:

| Change | Required local Next document |
|---|---|
| Root shell/theme script/layout semantics | `apps/web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/layout.md` |
| Internal links/navigation | `apps/web/node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md` |
| Expected 404 / exact status implications | `apps/web/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/not-found.md` and `.../03-file-conventions/not-found.md` |
| Recoverable upstream errors/retry | `apps/web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md` and `.../01-getting-started/10-error-handling.md` |
| Optional image component choice | `apps/web/node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md` |
| Workspace source package compilation | `apps/web/node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/transpilePackages.md` |

## Known Traps

1. `getPublicPosts()` and local `getPublicPost()` currently catch all non-OK/network/schema cases as `null`; existing home/detail then render empty/404. Replace before claiming D-15.
2. `markdownSanitizeSchema.protocols.src` currently permits `http`/`https` only. Adding `/media` requires a narrowly tested sanitizer/URL policy change; never widen to `data`, `file`, SVG or arbitrary paths.
3. `PostCard` and `Pagination.pageHref()` are home-specific. Copying them unchanged loses taxonomy filter/query state.
4. `adminPostInputSchema` accepts external `coverUrl`; Phase 02 must change this carefully to a strict same-origin media reference with alt/decorative fields without allowing DB/source fields into the client.
5. A term association count, delete check and deletion require one consistent transaction; a UI-disabled delete control is not authorization/integrity.
6. Do not use `notFound()` for an API 500 or catch the thrown Next interrupt. Installed docs state it terminates a route; a broad catch suppresses the intended 404 UI.
7. Public API repository currently uses exact selected fields and fixed predicate. A convenient `select()` join can leak raw Markdown/admin state or duplicate posts on tag joins; aggregate/deduplicate deliberately before strict DTO parse.
8. Theme code cannot rely on Server Component `localStorage`; the bootstrap must be synchronous client-side and failure-safe. Root layouts are cached during navigation, so pathname/current nav needs a Client Component or page-provided state.
9. Media files and image conversion are not present dependencies. A package install is a supply-chain decision, not an auto-fix; preserve pnpm policy and avoid background worker services.
10. Existing integration tests intentionally skip without disposable database env vars. The canonical local verifier supplies isolated values; do not treat an unconfigured local skip as coverage.

## Summary for Planners

Build Phase 02 as additive route/repository/contract modules around the existing renderer and fixed public predicate. Prefer focused new files (`taxonomy`, `pages`, `media`) over expanding `app.ts` or turning Web into a data owner. Reuse Fastify route guard/Origin/contract parsing and the existing API-test + Playwright fixture patterns; introduce only narrowly bounded media-processing/storage pieces.
