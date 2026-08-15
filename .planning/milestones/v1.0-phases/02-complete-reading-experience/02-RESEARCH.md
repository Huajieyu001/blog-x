# Phase 02 Research — Complete Reading Experience

**Phase scope:** READ-03..07, TAXO-01, MEDIA-01  
**Research date:** 2026-08-08  
**Constraints carried forward:** browser traffic stays same-origin; Fastify alone owns data, sessions, media and Markdown rendering; PostgreSQL is never public; no contact with frozen main server `47.99.80.8`; target remains a small 2C2G/2C4G deployment.

## Existing Baseline and Non-negotiable Boundaries

Phase 1 already provides a sound seam to extend:

- `apps/api/src/content/public-repository.ts` owns the fixed predicate `published AND deletedAt IS NULL AND publishedAt IS NOT NULL`, stable newest-first ordering, and repeatable-read pagination. Taxonomy, archive and public about queries must reuse this predicate rather than independently reconstruct visibility checks.
- `apps/api/src/content/markdown.ts` is the only Markdown-to-HTML boundary. It already disables raw HTML, uses bounded Shiki languages, and applies a final sanitizer. Heading identifiers and ToC metadata belong here (or in a small API-owned helper called by it), never in browser string parsing.
- `packages/contracts` has strict Zod wire allowlists, and both Web/API parse them. New public/admin/media DTOs must follow this model, exposing only presentation fields—not raw source storage paths, filesystem paths, session data, internal errors, or database rows.
- `apps/web/app/lib/api.ts` currently converts all failed internal fetches to `null`; this would turn an API outage into `notFound()` in `posts/[slug]/page.tsx`. Change its result model before adding more public pages.
- Current Markdown images permit only external `http`/`https`. Phase 2 must extend the sanitizer protocol/URL policy to admit same-origin `/media/<id>` while continuing to reject `data:`, `file:`, SVG and arbitrary local paths.

## Recommended Delivery Slices

1. Add schema/migration foundations plus strict taxonomy/page/media contracts and API repository tests.
2. Add taxonomy management and public category/tag/archive/about routes and SSR pages using reusable cards/pagination.
3. Extend Markdown rendering with deterministic heading IDs/ToC and route layout, then add the responsive theme/navigation/recovery shell.
4. Add controlled media upload, processing, same-origin streaming and editor insertion; finish with browser, hostile-upload and responsive/error regression coverage.

This sequencing keeps the publish/read path valid after each slice and avoids coupling image processing to taxonomy or theme work.

## Architecture and Data Model

### Taxonomy and pages

Use normalized tables and DB constraints, not JSON arrays on `articles`:

| Table | Essential fields / constraints | Reason |
|---|---|---|
| `categories` | UUID, `name`, globally unique canonical `slug`, timestamps | One optional category per article and stable public URL. |
| `tags` | UUID, `name`, globally unique canonical `slug`, timestamps | Reusable many-to-many tag vocabulary. |
| `article_tags` | `article_id`, `tag_id`, composite primary key and FKs | Prevent duplicate relations and support indexed public joins. |
| `site_pages` | UUID, immutable `key` constrained to `about`, title, Markdown, status draft/published, timestamps/version | A singleton is a content record, not a special Web-only string. Enforce unique key. |
| `media` | random UUID/public ID, source and derivative storage keys (not public URLs), declared/detected MIME, byte size, dimensions, timestamps | Keeps storage movable while exposing stable `/media/<publicId>` only. |

Add nullable `articles.category_id` FK with an index. Preserve retained article slug semantics. Category/tag deletion must first query the relationship count and return a conflict contract if non-zero; never cascade or silently null/reassign content. A category may be empty administratively, but public indices/list pages filter through the existing publication predicate and show only terms with at least one public relation.

Generate a reviewed Drizzle SQL migration and extend `schema:verify` for all new tables/columns/indexes. Add indexes for public taxonomy navigation: `(category_id, published_at DESC, id DESC)` and `article_tags(tag_id, article_id)`, plus the existing published predicate filters in query plans. Archive can be an indexed/public-article query grouped in SQL or a bounded result set grouped by UTC/Asia-Shanghai display rules; it must use deterministic article ordering and not introduce new state.

### Contract/API surface

Add focused modules such as `taxonomy.ts`, `pages.ts`, `media.ts`, and extend `public-posts.ts`. Every object schema should use `.strict()` and route parameter/query schemas should reject malformed slugs/pages.

Public contract examples: post list item gains `category: {name, slug} | null` and `tags: Array<{name, slug}>`; category/tag index and detail pagination response; archive year/month groups; public About `{title, renderedHtml, updatedAt}`; article detail `{..., toc: Array<{id, depth: 2|3, text}>}`; media response `{id, url: '/media/<id>', width, height, mimeType}`. Keep raw Markdown, source keys, EXIF, upload filename, administrator IDs and internal processing errors out of public contracts.

Administrative requests use action-specific schemas: create/update term, article category/tag assignment, About draft/save/publish/preview, and multipart media metadata response. Retain existing Fastify session guard plus exact Origin check for every unsafe route. Public media GET is same-origin but needs no cookie.

Suggested routes are `/public/categories`, `/public/categories/:slug/articles?page=`, `/public/tags`, `/public/tags/:slug/articles?page=`, `/public/archives`, `/public/about`, `/admin/categories`, `/admin/tags`, `/admin/about/*`, `POST /admin/media`, and `GET /media/:id`. Mount them as Fastify plugins from `app.ts`; keep Web browser writes relative `/api/...` and SSR fetches through `INTERNAL_API_ORIGIN`.

## Markdown Headings and ToC

Build heading IDs from the parsed HAST before sanitization/stringification. Only `h2` and `h3` produce ToC entries; preserve all heading rendering but do not emit a ToC when the list is empty. Use a deterministic Unicode-safe slugger:

1. Extract plain text from each heading's HAST children (not serialized HTML).
2. Normalize NFKC, trim, case-fold with locale-independent rules, collapse whitespace/punctuation to `-`, and retain Unicode letters/numbers plus `-`.
3. If normalization is empty, use a deterministic `section` base; maintain a per-document counter and suffix repeats as `-2`, `-3`, etc.
4. Assign the final value as the HAST heading `id`, return the same ordered `{id, depth, text}` list in the API DTO, and allow the sanitizer's `id` attribute only through the established final boundary.

This makes `#id` navigation work without JS. Render ordinary anchors plus visually/assistively labelled heading permalink links. On desktop, place ToC in a sticky `<nav aria-label="文章目录">`; below the chosen narrow breakpoint use native `<details><summary>` or an explicitly controlled button with `aria-expanded`, both keyboard-operable. A tiny client component may update `aria-current` using `IntersectionObserver`, but it must be optional and must not create/rename IDs.

Test Chinese, Latin, punctuation-only, duplicate, nested heading and hostile-heading fixtures; assert unique IDs in returned sanitized HTML and exact ToC order/depth. Do not use a browser-only library which can drift from SSR output.

## Media Upload, Processing and Delivery

Use a Fastify multipart parser with streaming/strict limits, then a single image processor in the API process. The installed Fastify docs explicitly recommend `@fastify/multipart` for file upload handling; Fastify route `bodyLimit` and streaming limits must be set at both plugin and route level. No multipart/image package is currently pinned, so adding one requires the existing package-legitimacy and lockfile policy gate.

Recommended minimal approved candidates after verification:

- `@fastify/multipart` compatible with Fastify 5 for bounded multipart parsing.
- `sharp` for decode, metadata inspection, EXIF orientation correction, resize and static WebP/JPEG/PNG output. Its native libvips footprint is materially preferable to introducing a separate conversion service on this deployment, but conversion should be serialized or concurrency-capped on the 2-core node.

Upload flow:

1. Require administrator session and trusted Origin; accept exactly one named file, reject missing/extra fields and interrupt/clean temporary files on every failure.
2. Enforce raw stream limit at 5 MiB before buffering; check declared type against JPEG/PNG/WebP but treat it only as a hint.
3. Inspect magic bytes and successfully decode using the processor. Reject SVG, GIF/animated content, decode failures, pixels above an explicit conservative limit (for example 40 megapixels) and excessive dimensions/aspect ratios. A 5 MiB file can decompress into a memory-exhaustion image, hence byte limit alone is insufficient.
4. Correct orientation, strip metadata, resize only down to max 2400px longest edge, and encode a static derivative. Generate the UUID independently from the user filename; atomically write source and derivative under an API-owned configured media root, then persist the DB record. If DB write fails, remove only the exact just-created paths.
5. Return only the strict media DTO. Editor insertion writes Markdown `![](\/media\/<id>)`; cover selection stores the same stable relative URL. Do not ever expose the source asset or storage key.

`GET /media/:id` validates UUID/public ID, looks up a derivative record, returns 404 for unknown/deleted records, and streams the exact derivative with a DB-known MIME type, `X-Content-Type-Options: nosniff`, immutable cache policy only because IDs are immutable, and no directory traversal. Use `createReadStream`/Fastify stream reply; do not proxy to a public secondary IP or make Next's image optimizer fetch private assets. Plain same-origin `<img>` is sufficient for this phase and avoids an extra Next image-processing process; include explicit width/height from the media DTO to prevent layout shift. `next/image` is optional later, not required for the single derivative/no-srcset decision.

Storage is an interface (`putSource`, `putDerivative`, `openDerivative`, cleanup exact keys) with a local filesystem implementation now. Its configured root must lie outside source/served static assets and be ignored by Git. A later secondary-server adapter implements the same interface, preserving `/media/<id>` in Markdown and pages.

## Theme, Navigation and Responsive UX

Keep global CSS variables in the root layout and expose `data-theme="light|dark"` on `<html>`. The default stylesheet uses `prefers-color-scheme`, which remains readable without JS. A small inline bootstrap script placed before visible content reads a narrowly named localStorage preference (`light|dark|system` only), resolves `system`, sets `data-theme`, and handles unavailable storage safely; a client theme control persists only the three allowlisted values. Include `color-scheme: light dark`, visible focus rings, and an accessible label for the control.

Add a shared public header/navigation component used by home, post, taxonomy, archive and About. On wide layout show Article/Category/Tag/Archive/About links. On narrow layout use a real `<button>` that controls a menu (`aria-expanded`, `aria-controls`, Escape-to-close and focus behaviour), not hover-only CSS or a bottom navigation. Breakpoints should follow the current 700px baseline plus a deliberate tablet range; verify 375px, 768px and desktop widths. Preserve content-first typography, readable line length and all keyboard paths.

## Correct 404 Versus Upstream Failure

Replace nullable `getPublicPosts`/detail helpers with a discriminated result, e.g. `{kind:'ok', data}`, `{kind:'not_found'}`, `{kind:'upstream_error'}`. Only a parsed API HTTP 404 maps to `notFound()`. Network errors, 5xx, malformed successful JSON, and invalid contracts are upstream errors and must throw a safe error to the route error boundary (or render an explicit recovery component); never turn them into an empty list/404.

Installed Next 16 documentation confirms `notFound()` terminates the segment and renders `not-found.tsx`, while unexpected errors go to client `error.tsx` boundaries with `reset()` retry. Add root/public `not-found.tsx` plus a public route `error.tsx` that provides retry and home navigation without disclosing internal message/configuration. Do not catch-and-swallow `notFound()` around a broad fetch. If streaming/Suspense is introduced, make the existence check before streaming when a real HTTP 404 is required; the local Next docs note a late notFound becomes a soft 404 (200). Global error must define its own HTML/body and theme styles, so a segment error boundary is preferred for API availability errors.

## Validation Architecture

Tests should prove contracts, security and user-visible behavior at the narrowest suitable layer, then retain one full browser journey:

| Layer | Essential tests |
|---|---|
| Contracts | strict rejection of unknown/internal fields; taxonomy/page/media IDs, slugs, pagination, ToC DTO and all error responses. |
| API repositories/routes | public predicate applied to category/tag/archive/about; empty terms hidden publicly; retained-associated term delete returns conflict; admin auth/Origin failures; 404 public media; API 500/network-classified separately by Web helper. |
| Migration/schema | generated SQL clean; FK/unique constraints, join duplicate prevention, singleton About key, indexes and no cascade deletion of associated taxonomy. |
| Markdown unit tests | deterministic multilingual/duplicate heading IDs, exactly h2/h3 ToC selection, no-ToC case, safe output after sanitizer, `/media/<uuid>` survives while `data:`/`file:`/unsafe URLs fail. |
| Media unit/integration | declared-MIME mismatch, bad signatures, SVG/GIF/animation, malformed decoder input, byte/pixel limit, EXIF removal/orientation, max-2400 resize, derived-only GET, traversal attempt, cleanup on DB/processing error. |
| Web SSR/component | public nav/active state, post metadata categories/tags, page-aware pagination URLs, archive/about, genuine not-found vs recoverable API error UI, no empty ToC. |
| Playwright | admin creates terms and attaches them; visitor navigates term/archive/About and follows ToC; upload/insert image reads from same-origin `/media`; keyboard mobile menu/theme switch; 404 and injected/unavailable API paths render distinct recovery states. Run one Chromium worker and existing isolated namespace runner. |

Add structural checks that `apps/web` still has no Drizzle/pg/filesystem/media processor imports and browser source contains no server IP. Extend existing local verification to examine exact temporary storage namespaces and remove only generated assets. Keep unit conversion fixtures tiny to fit the resource budget; one over-limit fixture can be generated in test setup rather than committed.

## Threat Register for Planning

| Threat | Mitigation required in Phase 02 |
|---|---|
| Upload polyglot/decompression bomb/path traversal | stream byte limit + magic/decode/pixel checks, random IDs, DB lookup only, fixed storage root, no original filename paths, cleanup tests. |
| EXIF/privacy or source exposure | strip derivative metadata; only derivative route public; source keys never in DTO/log/API. |
| Stored XSS/unsafe media URL | retain raw-HTML-disabled Markdown and final sanitizer; allow only explicit same-origin `/media/<UUID>` plus approved web URLs; never allow SVG/data/file. |
| Taxonomy disclosure | all public joins inherit one published predicate; separate admin repository/DTO; tests include draft/unpublished/deleted links. |
| CSRF/admin mutation | existing session guard + exact Origin required on taxonomy/About/media writes. |
| TOC link instability | freeze specified Unicode slugger, unique suffixes and regression fixtures before public use. |
| Error misclassification/information disclosure | only API 404 becomes Next 404; opaque public recovery UI, server logs redacted, malformed API response treated as failure. |
| Resource exhaustion | 5 MiB, pixel/dimension caps, limited image work concurrency, fixed pagination, no heavyweight service/CDN/srcset in this phase. |

## Concrete Integration Map

- Extend `apps/api/src/db/schema.ts`, create generated migration under `apps/api/drizzle/`, and update migration/schema verification.
- Add API modules under `content/` for taxonomy, pages, media storage and media processing; add route plugins under `routes/`; register them in `apps/api/src/app.ts`.
- Extend `apps/api/src/content/markdown.ts` and `routes/public-posts.ts` so rendered HTML and ToC come from the same parse; never parse rendered HTML in Web.
- Add contracts in `packages/contracts/src/` and export through `index.ts`; update Phase 1 DTO tests rather than weakening strictness.
- Replace `apps/web/app/lib/api.ts` null-only public fetch helpers; add public pages for categories/tags/archive/about, `not-found.tsx`/`error.tsx`, shared site header/theme/menu and ToC component.
- Extend `PostCard`, `Pagination`, `ArticleBody`, `posts/[slug]/page.tsx`, `public.module.css`, root `layout.tsx`, and `admin/_components/ArticleEditor.tsx` for the supplied DTOs and accessible UI.

## Pitfalls to Avoid

- Do not put categories/tags in client-only state, JSON columns, or a Web-side query: it breaks public visibility and future deployment separation.
- Do not use raw filename URLs, Next public directory, SVG allowlists, browser image decoding, or MIME headers as security validation.
- Do not have the UI assign heading IDs from `innerText`: it causes SSR/client drift and unstable external anchors.
- Do not use a catch-all `null` from SSR fetching. It silently violates D-15 by presenting outage as absence.
- Do not make an associated taxonomy deletion silently detach articles, nor implement permanent media delete/garbage collection in this phase.
- Do not introduce an image CDN, dedicated worker/service, or multiple responsive derivatives before evidence requires them; the single immutable derivative meets the present low-resource scope.

## Sources Consulted

- Phase 02 context, requirements, roadmap/state/project, Phase 01 verification/security and infrastructure policy in this repository.
- Current API/Web/contracts source and generated migrations.
- Installed Next 16 docs: App Router error handling, `notFound`, `error` conventions, Image component, and `transpilePackages`; key implications above are version-local.
- Installed Fastify 5 docs: content-type parsing, per-route `bodyLimit`, stream replies and its ecosystem recommendation for `@fastify/multipart`.
