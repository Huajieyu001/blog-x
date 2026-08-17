# Phase 7: Responsive Discovery Experience - Codebase Patterns

**Mapped:** 2026-08-17
**Inputs:** `07-CONTEXT.md`, approved `07-UI-SPEC.md`, `07-RESEARCH.md`
**Scope:** local repository only; no Docker, network, server access, dependency change, or business-code edit

## Mapping Summary

Phase 7 should be an extension of the existing public Web path, not a parallel frontend architecture. The closest existing end-to-end chain is:

```text
decoded App Router searchParams
  -> shared strict @blog-x/contracts schema
  -> apps/web/app/lib/api.ts getPublic(...)
  -> server component outcome branch
  -> shared PostCard / Pagination / public.module.css
  -> metadata from site-metadata.ts
  -> Playwright observation from the Web origin
```

The new search path adds one narrow pre-render seam for raw percent-encoding validity and one scoped related-content branch after the primary article succeeds. Every other concern already has a concrete analog in the repository.

## Planned File Inventory and Roles

| Planned file | Change | Role | Data flow | Closest existing analog |
|---|---|---|---|---|
| `apps/web/lib/search-encoding.ts` | create | Pure edge-safe validation helper | raw URL search string -> valid/invalid marker | `apps/web/app/lib/site-metadata.ts` pure URL validators; no direct raw-query analog |
| `apps/web/lib/search-encoding.test.ts` | create | Node unit test | hostile/valid encodings -> helper assertions | `apps/web/app/lib/site-metadata.test.ts` |
| `apps/web/proxy.ts` | create | Narrow Next request preflight | `/search` raw URL -> overwritten request-only header | no existing Proxy; routing boundary analog is `apps/web/next.config.ts` |
| `apps/web/app/lib/search-discovery.ts` | create | Pure request/outcome/href/canonical authority | decoded params + marker + strict API outcome -> presentation resolution | `apps/web/app/page.tsx` `homeResult`; `site-metadata.ts` `resolveCanonicalPage` |
| `apps/web/app/lib/search-discovery.test.ts` | create | Node unit test | complete query shapes/outcomes -> exact unions/URLs | `site-metadata.test.ts`; `public-discovery.test.ts` |
| `apps/web/app/lib/api.ts` | modify | Server-only internal API adapter | normalized q/page or slug -> strict `PublicResult<T>` | existing `getPublicPosts`, `getPublicPost`, `getPublicTaxonomyPosts` |
| `apps/web/app/lib/site-metadata.ts` | modify | Canonical/robots authority | safe public path + independent canonical/index decisions -> Next Metadata | existing `pageMetadata`, `resolveCanonicalPage` |
| `apps/web/app/lib/site-metadata.test.ts` | modify | SEO regression unit test | option matrix -> canonical/robots/Open Graph assertions | existing metadata test cases |
| `apps/web/app/_components/SearchForm.tsx` | create | Shared native presentation | accepted query + compact tab state -> labelled GET form | native controls in `PublicHeader.tsx`; recovery actions in `ServiceUnavailable.tsx` |
| `apps/web/app/_components/PublicHeader.tsx` | modify | Existing client interaction island | path/media/menu state -> nav visibility/focus/tab order | current file itself |
| `apps/web/app/_components/PostCard.tsx` | modify | Single public-card renderer | strict `PublicPostListItem` + variant -> default/compact article markup | current file itself |
| `apps/web/app/_components/Pagination.tsx` | modify | Single pagination renderer | page totals + preserved params -> canonical internal links | current file itself |
| `apps/web/app/search/page.tsx` | create | Server route and metadata | request resolution -> API -> one honest state | `apps/web/app/page.tsx`; taxonomy detail pages |
| `apps/web/app/posts/[slug]/page.tsx` | modify | Primary article plus isolated secondary discovery | article outcome -> article; independent related outcome -> grid/hidden/recovery | current primary outcome branch plus `ServiceUnavailable` copy pattern |
| `apps/web/app/public.module.css` | modify | Public visual system | semantic class names -> theme/responsive/focus/overflow layout | existing header/card/feed/recovery/article/media rules |
| `apps/web/e2e/public-discovery-fixture.ts` | create | Strict local HTTP fixture | symbolic local request -> strict response/failure variant | `apps/web/e2e/public-error-fixture.ts` |
| `apps/web/e2e/public-discovery.spec.ts` | create | Browser acceptance | Web-origin journey -> tracer/related/responsive/state/SEO/privacy assertions | `public-shell.spec.ts`, `public-errors.spec.ts`, `phase3-distribution.spec.ts`, `public-reading.spec.ts` |
| `scripts/phase7-browser-verify.mjs` | create (selected) | Exact-child local runner | free ports + fixture/Web processes -> focused or full Playwright exit with nonzero enforcement | `scripts/local-verify.mjs` `startManaged`/`stopManaged`/`runFailureRecoveryJourney` |

No API route, database, migration, Compose, sitemap, RSS, operations document, or production evidence file belongs in this phase.

## Pattern 1: Search Parameters and Request Resolution

### Authority to reuse

`packages/contracts/src/public-discovery.ts` already owns every query literal and limit:

```ts
export const publicSearchPageSize = 10;
export const publicSearchMaxPage = 100;
export const publicSearchMaxQueryCodePoints = 80;
export const publicSearchMaxRawCodeUnits = 256;

export const publicSearchQuerySchema = z.object({
  q: publicSearchQueryValueSchema,
  page: publicSearchPageSchema,
}).strict();
```

Its transforms are the required normalization order: raw code-unit limit, NFC normalization, trim, code-point limit; page parsing defaults to `1` and accepts only `/^[1-9]\d*$/` through `100`. `packages/contracts/src/public-discovery.test.ts` already proves duplicate arrays, unknown keys, signs, decimals and out-of-range pages are rejected.

### Closest current page loader

`apps/web/app/page.tsx` establishes the App Router shape and shared loader reuse:

```ts
type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function homeResult(searchParams: Record<string, string | string[] | undefined>) {
  const rawPage = searchParams.page;
  const query = publicPostPageQuerySchema.safeParse({ page: rawPage });
  const outcome = query.success ? await getPublicPosts(query.data.page) : null;
  // ...
}
```

Reuse the Promise-based `searchParams` signature and the single shared loader concept. Do **not** copy the partial-object parse (`{ page: rawPage }`) for search: it intentionally drops unknown keys. Phase 7 must pass the complete decoded object to `publicSearchQuerySchema.safeParse(searchParams)` so `.strict()` can reject `extra=x`, duplicate arrays, and all unsupported shapes.

### New helper placement

`apps/web/app/lib/search-discovery.ts` should be the sole decoded request resolver, href builder, presentation-outcome resolver and search-canonical decision point. Its result should be a discriminated union, matching the repository's existing `PublicResult` style:

```ts
type SearchRequestResolution =
  | { kind: "invalid" }
  | { kind: "accepted"; query: string; page: number };
```

Keep parsing pure and perform no fetch for `invalid`. The page and `generateMetadata()` should call the same loader/resolver rather than maintain independent interpretations.

### Raw encoding seam

There is no existing repository analog that can recover malformed percent encoding after Next has decoded `searchParams`. Keep the exception narrow:

- `apps/web/lib/search-encoding.ts` has no React, contracts, environment, fetch, or app imports.
- `apps/web/proxy.ts` matches only `/search` and overwrites one internal request header from the helper result.
- The marker is passed with request headers only, never a response header.
- The Proxy must not rewrite the URL, perform I/O, derive origins, or trust an inbound marker.
- The downstream resolver treats any absent/untrusted/invalid marker as fail-closed according to the research contract.

The nearest style analog is the fail-closed URL validation in `apps/web/app/lib/site-metadata.ts`:

```ts
try {
  origin = new URL(value);
} catch {
  throw new Error("PUBLIC_ORIGIN must be an absolute HTTP(S) origin");
}
if (!/^https?:$/.test(origin.protocol) || origin.username || origin.password || /* ... */) {
  throw new Error(/* ... */);
}
```

Apply the same principle: validate the full structure first, expose only a small typed result, and never repair an invalid input silently.

### Avoid

- Do not redefine `80`, `256`, `100`, `10`, query normalization, or page regex in the Web layer.
- Do not pick only `q` and `page` before `.strict()` parsing.
- Do not use `useSearchParams`, client effects, route handlers, or live fetch for request admission.
- Do not infer raw validity from the decoded `"%ZZ"` value.

## Pattern 2: Internal API and Strict Contracts

### Existing transport boundary

`apps/web/app/lib/api.ts` is the only server-side public fetch adapter:

```ts
export type PublicResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "not_found" }
  | { kind: "upstream_error" };

async function getPublic<T>(path: string, schema: Parser<T>, allowNotFound = false) {
  const response = await fetch(`${internalApiOrigin}${path}`, { cache: "no-store" });
  // 404 is accepted only with the exact public not-found DTO
  // non-2xx, invalid JSON/schema, and exceptions -> upstream_error
}
```

New functions should mirror the existing signatures:

```ts
export function getPublicPosts(page: number): Promise<PublicResult<PublicPostListResponse>>;
export function getPublicPost(slug: string): Promise<PublicResult<PublicPostDetail>>;
export function getPublicTaxonomyPosts(kind, slug, page);
```

Add `getPublicSearch(query, page)` with `publicSearchResponseSchema` and `getPublicRelatedPosts(slug)` with `publicRelatedPostsResponseSchema`. Encode query components with `URLSearchParams` and slug path segments with `encodeURIComponent`; then delegate to `getPublic()`. Do not add browser fetches, return raw `Response`, or weaken schema failure into empty data.

### Public projection authority

`packages/contracts/src/public-posts.ts` defines the only card DTO:

```ts
export const publicPostListItemSchema = z.object({
  title: z.string(),
  summary: z.string(),
  slug: z.string(),
  publishedAt: z.string().datetime({ offset: true }),
  status: z.literal("published"),
  category: publicTaxonomyTermSchema.pick({ name: true, slug: true }).nullable().optional(),
  tags: z.array(publicTaxonomyTermSchema.pick({ name: true, slug: true })),
}).strict();
```

`publicSearchResponseSchema` and `publicRelatedPostsResponseSchema` already nest this schema and reject extra `markdown`, `id`, `score`, `sharedTagCount`, source/candidate IDs, draft status, and internal fields. UI code should accept `PublicPostListItem`, never a locally widened object.

### Same-origin boundary

`apps/web/next.config.ts` owns browser-to-API routing:

```ts
async rewrites() {
  const apiOrigin = process.env.INTERNAL_API_ORIGIN ?? "http://127.0.0.1:3001";
  return [
    { source: "/api/:path*", destination: `${apiOrigin}/:path*` },
    { source: "/media/:path*", destination: `${apiOrigin}/media/:path*` },
  ];
}
```

Server components call `getPublic*`; any browser/API smoke test calls relative `/api/public/...`. No component, page href, metadata, error copy, test fixture response, or browser request may expose `internalApiOrigin` or either cloud IP.

## Pattern 3: Metadata and Canonical Decisions

### Existing authority

`apps/web/app/lib/site-metadata.ts` centralizes external origin and page metadata:

```ts
export function publicUrl(path: string, origin = publicOrigin()) {
  if (!path.startsWith("/")) throw new Error("public URL paths must begin with /");
  return new URL(path, origin).toString();
}

export function pageMetadata({ title, description, path, type = "website",
  origin = publicOrigin(), index = true }: PageMetadataOptions): Metadata {
  const url = publicUrl(path, origin);
  return {
    title,
    description,
    ...(index
      ? { alternates: { canonical: url, types: { "application/rss+xml": "/rss.xml" } } }
      : { robots: { index: false, follow: true } }),
    openGraph: { title, description, type, url, siteName: "Blog X" },
  };
}
```

This is the correct authority but its current `index` boolean couples canonical emission to robots. Extend its options backward-compatibly so existing callers remain equivalent while search can request both `robots: {index:false, follow:true}` and an optional safe canonical. Do not add a search-only origin helper or read `Host`/forwarded headers.

### Existing exact-shape canonical pattern

`resolveCanonicalPage()` inspects all keys, rejects arrays/unknown keys, removes `page=1`, and bounds pages by real `totalPages`. That exact-shape style is the analog for the search canonical matrix. Search's matrix differs in one important way: every outcome remains noindex, and canonical depends on the normalized accepted query plus actual API state.

### Test pattern

`apps/web/app/lib/site-metadata.test.ts` uses Node's built-in test runner and explicit object assertions:

```ts
assert.equal(metadata.alternates?.canonical, "https://blog.example/posts/example");
assert.deepEqual(
  pageMetadata({ title: "无效", description: "无效", path: "/", origin, index: false }).robots,
  { index: false, follow: true },
);
```

Extend this suite to prove four independent outputs: existing indexed+canonical behavior unchanged, search noindex+canonical, search noindex+no-canonical, and safe Open Graph URL. Resolver tests should cover every UI-SPEC canonical truth-table row.

### Distribution guardrail

`apps/web/app/sitemap.ts` enumerates fixed public/taxonomy/article URLs from distribution data. It has no search entry and should remain untouched. The Phase 7 browser suite should assert `/search` is absent rather than edit this file.

## Pattern 4: Public Header and Native Search Form

### Existing interaction island

`apps/web/app/_components/PublicHeader.tsx` is already the sole client owner for menu behavior:

```tsx
const media = window.matchMedia("(max-width: 1023px)");
// ...
if (event.key === "Escape") {
  setOpen(false);
  window.requestAnimationFrame(() => toggleRef.current?.focus());
}
// ...
<Link ... tabIndex={compact && !open ? -1 : undefined}>{link.label}</Link>
```

Insert one shared `SearchForm` after public links and before the existing 管理 link. Pass the same `compact && !open` state so its input and button leave the tab order with the hidden navigation. Preserve the current `usePathname()` route-close effect, Escape focus restoration, private-surface early return, `aria-controls`, and `data-open` CSS contract.

### New SearchForm shape

Follow native markup rather than adding state:

```tsx
<form action="/search" method="get">
  <label htmlFor={id}>搜索文章</label>
  <input id={id} name="q" type="search" maxLength={256} defaultValue={query} />
  <button type="submit">搜索</button>
</form>
```

The shared contract should take presentation context (`header`/`page`), accepted default value, and optional closed-menu tab state. Use stable distinct IDs when two forms can appear in the same document. No `onChange`, debounce, fetch, auto-focus, dialog, suggestion list, or JS-only submit.

### Existing semantic/focus analogs

- `ThemeControl` and `menuToggle` already provide native labelled controls and 44px targets.
- `ServiceUnavailable.tsx` uses native button/link recovery actions within `.recoveryActions`.
- `public-shell.spec.ts` already tests Enter activation, Escape, focus restoration, mobile visibility, and no-JS navigation.

## Pattern 5: One PostCard Renderer with a Compact Variant

`apps/web/app/_components/PostCard.tsx` already owns all public-card formatting:

```tsx
export default function PostCard({ post, position }: { post: PublicPostListItem; position: number }) {
  // fixed Asia/Shanghai date formatter
  // linked title, summary || "暂无摘要"
  // category/tag links with encodeURIComponent
  // "阅读文章 →" and article-specific aria-label
}
```

Extend its props compatibly, for example with `variant?: "default" | "compact"` and an optional/defaulted position. Preserve existing default callers byte-for-behavior. The compact branch may suppress only decorative ordinal and the redundant 已发布 badge; it must share the same date formatter, title/permalink, summary fallback, taxonomy links, read link, DTO type and DOM information order.

Use variant classes on the existing semantic `<article>` rather than create `SearchCard`/`RelatedCard`. Do not spread DTOs into DOM attributes or inspect undocumented fields.

CSS analogs:

- `.postCard { grid-template-columns: 52px minmax(0, 1fr); ... }`
- `.termCard h2 { font-size: clamp(1.35rem, 3vw, 2rem); overflow-wrap:anywhere; }`
- `.taxonomy { display:flex; flex-wrap:wrap; ... }`
- `.readLink` owns the established editorial action language.

## Pattern 6: Query-Preserving Pagination

`apps/web/app/_components/Pagination.tsx` already owns the visible-page algorithm and semantics:

```tsx
function visiblePages(current: number, total: number) {
  return [...new Set([1, current - 1, current, current + 1, total])]
    .filter((page) => page >= 1 && page <= total)
    .sort((left, right) => left - right);
}

<nav className={styles.pagination} aria-label="文章分页">
  // previous, numbered links with aria-current, next
</nav>
```

Retain this algorithm and default props for home/taxonomy callers. Extend href construction with normalized preserved parameters and a custom `ariaLabel`. Use `URLSearchParams`, insert accepted `q`, and add `page` only for page 2+. Expected search links are:

```text
page 1: /search?q=%E4%B8%AD%E6%96%87
page 2: /search?q=%E4%B8%AD%E6%96%87&page=2
```

Do not concatenate a second `?`, retain raw invalid values, include `page=1`, or allow callers to preserve unknown keys. Preserve home previous-page behavior (`/?page=2` -> `/`) and taxonomy base paths.

The existing numeric targets are 36px; Phase 7's CSS work must raise all pagination actions to at least 44px without losing `aria-current`, disabled text, centered ellipses, or narrow-grid ordering.

## Pattern 7: Search Page State Rendering

`apps/web/app/page.tsx` provides the closest server-page skeleton: dynamic route, Promise search params, shared async loader used by body/metadata, `.page`/`.feed` shell, public-card list and Pagination. Taxonomy pages provide the `.discoveryHeader` pattern.

The search route should preserve this structure while replacing truth inference with an exhaustive state union:

```text
invalid
upstream_error
empty_query
no_results
page_out_of_range
results
```

Render exactly one branch with the approved UI-SPEC copy. `results` alone renders cards; pagination appears only when applicable. Empty, no-result, invalid and out-of-range are distinct and make no false availability claim. Upstream failure is local search recovery, not a thrown generic boundary.

Reuse normal `Link` actions and native form navigation. Query text stays React text; never use `dangerouslySetInnerHTML` for search input, echoed query, card title, summary or taxonomy.

## Pattern 8: Related Articles as an Isolated Secondary Outcome

`apps/web/app/posts/[slug]/page.tsx` establishes primary authority:

```tsx
const result = await getPublicPost(slug);
if (result.kind === "not_found") notFound();
if (result.kind === "upstream_error") throw new Error("public content unavailable");
const article = result.data;
```

Keep this logic unchanged for the article itself. Only after `result.kind === "ok"`, resolve related data independently:

```text
related ok + items       -> render “继续阅读” + compact card grid
related ok + empty items -> render null (no heading, separator, placeholder, filler)
related not_found/error/malformed/non-2xx -> local subordinate recovery block
```

There is no existing secondary-fetch component to copy exactly. Combine two repository patterns carefully:

- Use `api.ts` strict `PublicResult` to keep empty distinct from failure.
- Borrow safe, opaque recovery language/normal controls from `ServiceUnavailable.tsx`, but do not throw to `apps/web/app/error.tsx`; that global path would replace the readable article.

Render the related section after the existing `.articleContent` body flow and inside `.articleShell`. Preserve API order, exclude all explanations/scores/shared counts, and reuse compact `PostCard` only.

## Pattern 9: CSS Theme, Responsive and Accessibility Rules

All Phase 7 styles belong in `apps/web/app/public.module.css`. Existing authorities:

```css
:global(html) {
  --paper: #f7f3eb;
  --surface: #fffdf8;
  --ink: #191b1a;
  --muted: #6b6d68;
  --line: #d8d3c8;
  --accent: #2d5e52;
}

@media (max-width: 700px) { /* content/card/pagination reflow */ }
@media (max-width: 1023px) { /* header menu and article ToC */ }
@media (prefers-reduced-motion: reduce) { /* suppress motion */ }
```

### Reuse map

| New surface | Existing CSS analog | Guidance |
|---|---|---|
| Header search form | `.publicNav`, `.menuToggle`, `.themeOptions span` | desktop inline; at <=1023 inherit menu grid; input/button 44px |
| Page heading/form | `.feed`, `.discoveryHeader`, `.recoveryActions` | 1120px shell, 28/18px gutters, horizontal then <=700 stacked |
| Compact card | `.postCard`, `.termCard`, `.taxonomy`, `.readLink` | 24px vertical rhythm, smaller heading, all metadata retained |
| Search state | `.empty`, `.recovery`, `.recoveryActions` | exact state copy, normal actions, no color-only meaning |
| Related grid | `.termGrid`, `.articleShell`, article width rules | 2 columns >=1024; auto-fit tablet; exactly 1 <=700 |
| Focus | `.page a:focus-visible`, header control focus | extend same 2px accent/4px offset to inputs/buttons |
| Overflow | `minmax(0, 1fr)`, `.articleBody { min-width:0; overflow-wrap:anywhere; }` | add `min-width:0`, safe wrapping; never hide mobile metadata |

Use existing variables in both explicit and system dark mode. Do not add a third breakpoint, hard-code a light-only surface, reduce touch targets, ellipsize accepted content, or reorder/hide information at narrow widths.

## Pattern 10: Playwright, Local Fixture, Same-Origin and No-JS

### Local fixture analog

`apps/web/e2e/public-error-fixture.ts` is a dependency-light Node HTTP server:

```ts
const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  if (url.pathname === "/health") return json(response, 200, { ok: true });
  // exact strict JSON, 500, malformed response, or socket refusal
});

server.listen(port, "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
```

`public-discovery-fixture.ts` should retain loopback binding, `/health`, strict JSON helper and clean signal shutdown. Add bounded symbolic scenarios for six search states, malformed/HTTP/refusal modes, article detail, nonempty/empty/failed related results, and baseline distribution. Control endpoints must expose no secret/arbitrary proxy/file capability.

### Responsive and keyboard analog

`apps/web/e2e/public-shell.spec.ts` already exercises exact viewports, semantic locators and overflow:

```ts
for (const viewport of [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1280, height: 900 },
]) {
  await page.setViewportSize(viewport);
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth
  )).toBe(true);
}
```

It also proves `Enter`, `Escape`, `aria-expanded`, nav visibility and restored toggle focus. Extend that assertion style to the search form, closed-menu tab order, card information parity, 44px bounding boxes and related columns.

### No-JS analog

Reuse the explicit BrowserContext pattern from `public-shell.spec.ts`:

```ts
const noScript = await browser.newContext({
  javaScriptEnabled: false,
  colorScheme: "dark",
  viewport: { width: 375, height: 812 },
});
```

Under no JS, CSS deliberately leaves `.publicNav` visible because hiding is scoped to `html[data-js="true"]`. Verify the complete search form is visible and native fill+Enter submission reaches a server-rendered state; do not merely assert the homepage loaded.

### Same-origin analog

`apps/web/e2e/phase3-distribution.spec.ts` validates the runner-provided origin and every HTTP(S) request:

```ts
const origin = new URL(webOrigin).origin;
if (origin !== webOrigin || !/^http:\/\/127\.0\.0\.1:\d+$/.test(webOrigin)) throw new Error(/* ... */);

page.on("request", (request) => {
  if (!/^https?:/.test(request.url())) return;
  expect(new URL(request.url()).origin).toBe(webOrigin);
});
```

Use the same listener for all discovery journeys and inspect rendered body/head/hrefs for forbidden backend identifiers. Browser API smoke must target `${webOrigin}/api/public/search` and `${webOrigin}/api/public/articles/:slug/related`, never the fixture origin.

### Honest error and privacy analogs

`public-errors.spec.ts` distinguishes valid 404 from 500/refusal/malformed DTO and asserts the page omits `ECONNREFUSED`, `INTERNAL_API_ORIGIN`, Zod details and the fixture address. `public-list.spec.ts` and `public-reading.spec.ts` assert draft/downline/deleted material never renders. Reuse exact negative assertions for:

- hidden fixture titles and slugs;
- `markdown`, `score`, rank/shared/admin/ID fields;
- stack, contract or network diagnostics;
- `124.222.91.230`, `47.99.80.8`, fixture origin/port and `INTERNAL_API_ORIGIN`.

### SEO analog

`phase3-distribution.spec.ts` asserts canonical count/href, `meta[name="robots"]`, sitemap locations and RSS/sitemap privacy. Add search cases without altering distribution files: every search state has `noindex, follow`; only the exact normalized supported result shapes have one canonical; `/search` is absent from sitemap and RSS remains unchanged.

### Optional runner analog

If a dedicated runner is needed, lift the exact lifecycle from `scripts/local-verify.mjs`:

```js
function startManaged(context, label, commandName, args, env) {
  const child = spawn(commandName, args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  context.children.push(child);
  return child;
}

async function stopManaged(context) {
  const children = context.children.splice(0).reverse();
  // SIGTERM exact child, bounded fallback SIGKILL
}
```

Reuse generated loopback ports, health polling, exact child references and `finally` cleanup. Do not kill by name/port, use fixed production ports, download browsers, invoke Docker, or connect to cloud servers. Phase 8—not this runner—owns fixed `3100` refresh integration.

## Unit-Test Pattern Map

| New/changed test | Existing pattern to copy | Required distinctive cases |
|---|---|---|
| `search-encoding.test.ts` | `site-metadata.test.ts`: `node:test` + `assert/strict` | valid CJK/emoji/literal `%25`; stray/truncated `%`; invalid UTF-8; no repair |
| `search-discovery.test.ts` | `public-discovery.test.ts`: table-driven `safeParse`; `site-metadata.test.ts`: exact URL/object asserts | whole-object strictness, arrays, q bounds/NFC, page bounds, href encoding, every outcome/canonical row, invalid makes no fetch |
| `site-metadata.test.ts` additions | current metadata object assertions | indexed+canonical unchanged; noindex+canonical; noindex without canonical; safe OG URL |
| `public-discovery.spec.ts` | semantic Playwright suites above | tracer, related RED/GREEN, 375/768/1280, JS/no-JS, themes, focus, 44px, state copy/actions, privacy, SEO, same-origin |

Use focused Node tests first, then workspace contracts/type/boundary checks, then the one generated-port browser journey. Screenshots may supplement but never replace semantic, request, head, privacy and overflow assertions.

## Cross-File Data Flow and Selected Four-Wave Order

Independent plan checking revised the advisory split to exactly four plans/waves and seven tasks. This is the selected dependency order:

```text
Wave 1 / 07-01 (1 task): real search tracer
  SearchForm -> PublicHeader -> SSR /search -> getPublicSearch -> strict result
  public-discovery-fixture -> generated-port Web -> public-discovery.spec.ts tracer

Wave 2 / 07-02 (2 tasks): strict query / SEO / complete search states
  search-encoding helper + proxy marker -> whole-object search-discovery resolver
  -> site-metadata independent robots/canonical -> exact states/cards/pagination

Wave 3 / 07-03 (2 tasks): related + responsive implementation
  getPublicRelatedPosts + publicRelatedPostsResponseSchema -> retained article + related branch
  -> focused 375/768/1280/44px/keyboard/theme/no-JS/overflow proof

Wave 4 / 07-04 (2 tasks): independent full browser gate
  finite public-discovery-fixture -> generated-port Web with INTERNAL_API_ORIGIN=fixture
  -> public-discovery.spec.ts exact edge/privacy matrix -> unfiltered gate
```

Do not invent local DTOs or URL rules. Each later wave consumes the production authority delivered by its dependency; browser tests consume the same public surface a visitor uses and never import helpers as acceptance authority.

## Planner Guardrails

1. Parse the complete decoded parameter object; no unknown-key erasure.
2. Make the raw-encoding check a `/search`-only request marker and overwrite spoofed input.
3. Keep all browser-visible discovery traffic on the Web origin; internal origin remains server-only.
4. Preserve strict `PublicResult` semantics: malformed/failed is never empty.
5. Keep `pageMetadata` as the only origin/metadata authority and separate canonical from indexability compatibly.
6. Extend `PublicHeader`, `PostCard` and `Pagination`; do not create second authorities.
7. Related failure is local and must never hide or reclassify the primary article.
8. Use the existing color variables, 700/1023 breakpoints, focus outline, reduced-motion rule and one DOM information order.
9. Test no-JS submission, menu tab exclusion, exact search states, responsive overflow/columns, SEO, hidden content and every request origin in real Chromium.
10. Keep production frozen and Phase 8 ownership intact: no server, Docker, fixed-3100 refresh receipt, sitemap/RSS implementation, or deployment work in Phase 7.

## Direct-Analog Gaps

Two proposed files have no direct existing sibling:

- `apps/web/proxy.ts`: justified only because decoded App Router params cannot distinguish malformed raw encoding from a legitimately encoded literal percent string. Keep it matcher-limited and dependency-light.
- `apps/web/app/lib/search-discovery.ts`: combines patterns already present separately in `homeResult`, `resolveCanonicalPage`, strict contracts and `PublicResult`. Its purpose is to prevent page/metadata drift, not to create a new service layer.

These gaps should receive the strongest focused unit coverage and remain small enough to inspect as pure boundary code.

---

*Pattern map for Phase 07 — planner should read together with `07-CONTEXT.md`, `07-UI-SPEC.md`, and `07-RESEARCH.md`.*
