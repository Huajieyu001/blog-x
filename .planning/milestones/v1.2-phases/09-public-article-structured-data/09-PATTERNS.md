# Phase 9 Pattern Map: Public Article Structured Data

**Mapped:** 2026-09-04
**Scope:** Existing Web-only analogs for `BlogPosting` JSON-LD and regression coverage
**Inventory decision:** Extend existing owned files; add no new test file, package, service, API contract, or database change.

## Recommended Change Surface

| Responsibility | Existing owner | Phase 9 change |
|---|---|---|
| Canonical public URL and SEO primitives | `apps/web/app/lib/site-metadata.ts` | Add a narrow `BlogPosting` builder and one controlled serializer beside `publicUrl` / `pageMetadata`. |
| Pure Web regression coverage | `apps/web/app/lib/site-metadata.test.ts` | Extend the existing default Web unit suite with exact-key, URL, privacy, and escaping assertions. |
| Public article SSR | `apps/web/app/posts/[slug]/page.tsx` | After the existing valid-detail guard, build once from four explicit fields and render one native JSON-LD `<script>`. |
| Generated-loopback fixture | `apps/web/e2e/public-discovery-fixture.ts` | Add one strict public detail response containing hostile title/summary plus distinct accepted-but-excluded field markers; optionally add a separate intentionally malformed detail response to exercise the strict DTO failure branch. |
| Isolated Web browser coverage | `apps/web/e2e/public-discovery.spec.ts` | Parse the SSR script, compare it with visible/canonical values, prove injection containment, and prove zero article scripts on non-article pages. |
| Real publication lifecycle coverage | `apps/web/e2e/public-reading.spec.ts` | Extend the existing published/draft/unpublished/deleted/unknown journey with positive and zero-script assertions. |

This is the complete intended implementation surface. `scripts/test-inventory.mjs` already owns all three test suites, so it must remain unchanged unless a planner creates a new test file (which is unnecessary here).

## Existing Runtime Analogs

### 1. Public article page is the only emission point

`apps/web/app/posts/[slug]/page.tsx` is already an async App Router Server Component. Its control flow is the desired fail-closed boundary:

1. Await `params.slug`.
2. Call `getPublicPost(slug)`.
3. Call `notFound()` for `kind === "not_found"`.
4. Throw for `kind === "upstream_error"`.
5. Only then assign `const article = result.data` and return article JSX.

Put the JSON-LD element in that returned JSX, after step 5. Do not put it in `app/layout.tsx`, a shared public component, `generateMetadata`, or a client component. This preserves the existing reachability proof: a draft, unpublished, deleted, unknown, or malformed detail can never reach the script branch.

The page already supplies every accepted fact from the same resolved article object:

- visible headline: `article.title` in `<h1>`;
- visible description: `article.summary` in `.articleSummary`;
- machine publication time: `article.publishedAt` in `<time dateTime>`;
- canonical route: ``/posts/${encodeURIComponent(article.slug)}`` in `generateMetadata`.

The JSON-LD must use these exact values. In particular, use `summary`, not `seoDescription`, because the latter can intentionally differ from the visible summary.

### 2. Existing URL authority must be reused

`apps/web/app/lib/site-metadata.ts` already centralizes the public-origin boundary:

- `publicOrigin` accepts only an absolute HTTP(S) origin without credentials, path, query, or fragment and fails closed when production lacks `PUBLIC_ORIGIN`.
- `publicUrl` accepts only same-origin root-relative paths and rejects protocol-relative and backslash-bearing input.
- `pageMetadata` derives canonical and Open Graph URLs through `publicUrl`.
- `renderRss` establishes the existing post permalink pattern: `publicUrl(`/posts/${encodeURIComponent(article.slug)}`, origin)`.

The builder should call that same expression rather than concatenate strings, inspect request headers, or read the internal API origin. The result should be used for both `mainEntityOfPage` and `url`.

### 3. Strict public DTO is already the data boundary

The end-to-end public projection is already strict:

- `apps/api/src/content/public-repository.ts` defines `publicPredicate` as published status, non-deleted, and non-null `publishedAt`.
- `findDetailBySlug` applies that predicate and returns public metadata plus Markdown for server-side rendering.
- `apps/api/src/routes/public-posts.ts` destructures `markdown` away before constructing the response and parses the response through `publicPostDetailSchema`.
- `packages/contracts/src/public-posts.ts` declares a `.strict()` public list item (`title`, `summary`, `slug`, `publishedAt`, literal `status: "published"`, category, tags) and a `.strict()` detail extension (`seoDescription`, `renderedHtml`, `toc`, optional cover).
- `apps/web/app/lib/api.ts` parses the response again with `publicPostDetailSchema`; malformed extra or missing fields become `upstream_error` rather than page data.

Do not change this DTO for Phase 9. The JSON-LD helper should narrow it further by accepting only these four fields:

```ts
type PublicBlogPostingInput = Readonly<{
  title: string;
  summary: string;
  slug: string;
  publishedAt: string;
}>;
```

Passing four properties explicitly is important. Do not accept or spread `PublicPostDetail`: that type includes `renderedHtml`, cover metadata, taxonomy, and administrative-looking `status`, even though all are public-safe today.

## Concrete Helper Pattern

Add the following shape near `publicUrl` / `pageMetadata` in `site-metadata.ts`:

```ts
export function buildBlogPosting(input: PublicBlogPostingInput, origin = publicOrigin()) {
  const canonical = publicUrl(`/posts/${encodeURIComponent(input.slug)}`, origin);
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: input.title,
    description: input.summary,
    datePublished: input.publishedAt,
    mainEntityOfPage: canonical,
    url: canonical,
  } as const;
}

export function serializeJsonLd(value: ReturnType<typeof buildBlogPosting>) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
```

The locally installed Next.js 16.3 guide at `apps/web/node_modules/next/dist/docs/01-app/02-guides/json-ld.md` is the governing framework pattern. It recommends a native `<script>` in the page (not `next/script`) and explicitly escapes `<` after `JSON.stringify` before using `dangerouslySetInnerHTML`. U+2028/U+2029 escaping tightens the same controlled raw-text boundary.

Render the result in the existing server page using the guide's native-script pattern:

```tsx
const jsonLd = buildBlogPosting({
  title: article.title,
  summary: article.summary,
  slug: article.slug,
  publishedAt: article.publishedAt,
});

<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
/>
```

There are existing raw-HTML call sites, but they are not serializers to copy:

- `app/layout.tsx` injects a constant, developer-authored theme bootstrap script.
- `ArticleBody.tsx` and the admin preview inject HTML that has already passed through the Markdown renderer/sanitizer.

Neither protects author-controlled JSON raw text. The Phase 9 serializer must therefore be a dedicated primitive, not reuse `escapeXml` (which would corrupt JSON values) and not rely on plain `JSON.stringify`.

## Existing Test Ownership and Exact Extensions

### Default unit suite: `site-metadata.test.ts`

This file already imports Node's strict assertions and exercises same-origin URL validation, exact metadata shapes, hostile XML text, and privacy sentinels. Extend it rather than create a sibling test.

Add two focused tests:

1. **Fixed shape and canonical parity**
   - use `publicOrigin("https://blog.example")`;
   - build with a slug containing characters that require encoding;
   - assert `Object.keys(result)` equals exactly `@context`, `@type`, `headline`, `description`, `datePublished`, `mainEntityOfPage`, `url` in builder order;
   - assert both URL fields equal the `publicUrl` result for the encoded post path;
   - assert the serialized/object form has no `markdown`, `renderedHtml`, `status`, internal-origin, storage-path, category, tag, cover, or `seoDescription` key.

2. **Raw-text script containment and round trip**
   - include `</script><script data-injected>` and literal U+2028/U+2029 in title/summary;
   - assert the serialized bytes contain no literal `<` or `</script>` and do contain `\\u003c`, `\\u2028`, and `\\u2029`;
   - assert `JSON.parse(serialized)` deep-equals the original fixed-shape object, proving escaping does not alter semantic content.

This suite is already a default test in both `scripts/test-inventory.mjs` and `scripts/default-test.mjs`.

### Isolated SSR/browser suite: `public-discovery-fixture.ts` + `public-discovery.spec.ts`

The Phase 7 harness already provides the closest browser-level analog:

- `public-discovery-fixture.ts` parses successful article fixtures through `publicPostDetailSchema` before serving them.
- `public-discovery.spec.ts` resolves generated loopback origins, records every browser request, compares them with the public origin, and scans rendered HTML for private/internal sentinels.
- Its existing `related populated zero and failure` tests load a real public article page, inspect the visible heading/body, and validate recovery behavior.
- `scripts/phase7-browser-verify.mjs` copies the Web app to an isolated root, starts a generated-loopback strict fixture and Next runtime, runs exactly `public-discovery.spec.ts`, forbids skip/fixme/only controls, and cleans up the exact child processes/root.

Extend the fixture with one dedicated public detail slug so existing related-reading titles and scenarios do not change. Give that detail:

- a title containing `</script><script data-json-ld-injected>`;
- a summary containing literal U+2028/U+2029 plus a unique public marker;
- a stable ISO `publishedAt`;
- strict valid detail fields (`status: "published"`, taxonomy, `seoDescription`, `renderedHtml`, `toc`, `cover`), with distinct markers in fields intentionally excluded from JSON-LD.

The valid response must still pass `publicPostDetailSchema.parse`; do not smuggle Markdown or arbitrary private keys through it. If browser coverage of the strict failure branch is desired, serve a second intentionally malformed raw response with extra `markdown` / internal / admin sentinel keys and verify that `getPublicPost` fails closed before any article script is rendered.

In a focused test in the existing spec:

1. Load the dedicated article route and require HTTP 200.
2. Locate `script[type="application/ld+json"]` and assert count exactly 1.
3. Read `textContent`, run `JSON.parse`, and assert the exact seven keys.
4. Compare `headline` with visible `h1`, `description` with `.articleSummary`, and `datePublished` with `article time[datetime]`.
5. Compare `url` and `mainEntityOfPage` with `link[rel="canonical"]` and the generated public origin.
6. Assert no injected sentinel element exists and no second script was created.
7. Assert the parsed JSON-LD and its script text omit `seoDescription`, `renderedHtml`, taxonomy, cover/storage, status, internal-origin, Markdown/source, and admin-state markers. Continue using the whole-page disclosure scan for values that should never cross the strict DTO at all.
8. Load `/` and `/search` and assert zero `script[type="application/ld+json"]` on both non-article pages.

The test can reuse `requireGeneratedOrigin` and `expectNoDiscoveryDisclosure`. If extra privacy markers are added, append them to the existing `hiddenSentinels` list rather than create a second disclosure helper.

### Real lifecycle suite: `public-reading.spec.ts`

This main-browser test already creates exactly the required visibility states through the real admin UI and API:

- one published article;
- one draft;
- one published-then-unpublished article;
- one published-then-soft-deleted article;
- one unknown slug.

It then verifies the public article at desktop/mobile sizes and verifies that all four unavailable paths produce the same 404 body. Extend this exact test:

- on the published page, parse the one JSON-LD script and compare headline, summary, machine time, and canonical link;
- after each unavailable `page.goto`, assert zero `script[type="application/ld+json"]` before storing the 404 body;
- keep the existing one-body 404 equality assertion.

This proves the real repository predicate and strict public route, while the isolated fixture proves hostile serialization. Avoid duplicating the full hostile payload in the real lifecycle test.

## Inventory and Delivery Consequences

`scripts/test-inventory.mjs` currently owns:

| File | Kind | Scope | Fixture owner |
|---|---|---|---|
| `apps/web/app/lib/site-metadata.test.ts` | `web-unit` | `default` | none |
| `apps/web/e2e/public-discovery.spec.ts` | `web-e2e` | `integration` | `phase7-browser` |
| `apps/web/e2e/public-reading.spec.ts` | `web-e2e` | `integration` | `main-browser` |

Adding assertions to these files changes test counts naturally but does not change inventory ownership. Do not add `structured-data.test.ts` or `structured-data.spec.ts`: the inventory validates an exact on-disk set, and new files would require coordinated updates to sealed counts and runner assertions.

Validation should follow the current owners, smallest first:

1. `corepack pnpm test` — includes the metadata unit suite and exact inventory checks.
2. `corepack pnpm -r typecheck` — validates the helper/page types across the workspace.
3. `node scripts/phase7-browser-verify.mjs` — isolated SSR hostile/non-article coverage, generated ports only.
4. `corepack pnpm local:deliver` — real generated integration including `public-reading.spec.ts`, fixed local refresh at `http://127.0.0.1:3100`, evidence generation, and `RELEASE BLOCKED` enforcement.

Do not update hard-coded test totals preemptively. Only adjust count assertions if an existing sealed runner explicitly fails because its canonical pass total changed; no inventory path or owner should change.

## Anti-Patterns to Reject During Review

- Spreading `article` into the JSON-LD object.
- Including `renderedHtml`, Markdown, `status`, cover/storage data, taxonomy, internal URLs, admin data, author/publisher/image guesses, or `seoDescription`.
- Constructing canonical URLs by string concatenation or from request headers.
- Emitting JSON-LD from the global layout, home/search pages, a client effect, or `next/script`.
- Using raw `JSON.stringify` directly in JSX, `escapeXml`, or HTML entity escaping.
- Rendering the script before the valid-detail guard.
- Creating a new package, API field, database migration, external validation call, or test file.
- Weak browser assertions that only search page HTML for `BlogPosting` without parsing the exact script and comparing it with visible content.

## Requirement-to-Pattern Traceability

| Requirement | Concrete proof path |
|---|---|
| SEO-03 | One server-rendered `BlogPosting` on the valid article page; unit exact-shape test; isolated and real browser parity against `h1`, summary, `time[datetime]`, and canonical link. |
| SEO-04 | Existing strict public API parse plus explicit four-field builder input; exact seven-key assertion; private sentinel scan in isolated browser coverage. |
| SEO-05 | Dedicated escaping round trip and hostile browser fixture; zero-script checks on `/`, `/search`, and all real draft/unpublished/deleted/unknown 404 paths. |

## Planner Handoff

Keep the research decomposition:

- **09-01:** Implement `buildBlogPosting` / `serializeJsonLd` and extend `site-metadata.test.ts`; run default tests and typecheck.
- **09-02:** Render after the valid public guard, extend the existing isolated fixture/spec and real lifecycle spec, then run isolated browser and local delivery gates.

The two plans have a clean dependency: browser assertions in 09-02 consume the primitive proven in 09-01. No work in either plan requires server access, deployment, production release, API/schema changes, or a new inventory owner.
