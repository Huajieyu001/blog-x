# Phase 9: Public Article Structured Data - Research

**Researched:** 2026-09-04
**Domain:** Next.js App Router SSR, strict public DTOs, Schema.org JSON-LD
**Confidence:** MEDIUM

## User Constraints

- Develop and validate locally only; do not connect to or modify either cloud server, deploy production, or change `main`. Production remains `BLOCKED`. [VERIFIED: AGENTS.md, `.planning/REQUIREMENTS.md`]
- Keep the browser on the same public origin and do not expose internal API origins, storage paths, Markdown source, or administrative state. [VERIFIED: AGENTS.md, `.planning/REQUIREMENTS.md`]
- Do not add a service, external API, database migration, heavy process, or package for this phase. The established fixed local delivery route remains `http://127.0.0.1:3100`. [VERIFIED: `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`]
- Use the existing GSD workflow and existing test ownership; make no unrelated reversions. [VERIFIED: AGENTS.md]

## Project Constraints (from AGENTS.md)

- Before changing repository files, Phase execution must run through a GSD workflow. [VERIFIED: AGENTS.md]
- The user has authorized GSD subagents for local planning, research, implementation, review, testing, and verification only. Server operations, credentials, deployment, and external messages are not included. [VERIFIED: AGENTS.md]
- For any Web implementation, read the locally installed Next.js documentation first because this project uses a version with breaking changes. [VERIFIED: apps/web/AGENTS.md]

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|---|---|---|
| SEO-03 | A published article page emits `BlogPosting` JSON-LD matching visible content and canonical URL. | Reuse the public article server page, `pageMetadata`, and `publicUrl`; derive one minimal record from title, visible summary, `publishedAt`, and slug. |
| SEO-04 | JSON-LD is derived only from strict public fields and contains no Markdown, internal address, storage path, or admin status. | Build the record from a narrow input type rather than the full API result, and prove its exact key set in unit/browser tests. |
| SEO-05 | Non-public/unknown article paths and non-article pages emit no article JSON-LD; output is automatically parseable and injection-safe. | Extend existing main-browser lifecycle coverage and isolated Phase 7 fixture coverage with parser, negative-route, and hostile-value assertions. |
</phase_requirements>

## Summary

Phase 9 is a Web-only, server-rendered change. The public detail API already filters on exactly `status === "published"`, no `deletedAt`, and non-null `publishedAt`; its route removes the repository's Markdown field before parsing the strict public detail DTO. [VERIFIED: apps/api/src/content/public-repository.ts:17-21 — `eq(schema.articles.status, "published")`, `isNull(schema.articles.deletedAt)`, `isNotNull(schema.articles.publishedAt)`; apps/api/src/routes/public-posts.ts:65-76 — `const { markdown, ...metadata } = article`]

The public page already renders the exact visible title, summary, and `time` `dateTime`, then derives its canonical metadata with the same encoded post path. [VERIFIED: apps/web/app/posts/[slug]/page.tsx:37-41 — `<h1>{article.title}</h1>`, `<p className={styles.articleSummary}>{article.summary}</p>`, `<time dateTime={article.publishedAt}>`; apps/web/app/posts/[slug]/page.tsx:79-90 — `path: \`/posts/${encodeURIComponent(article.slug)}\``] The smallest safe implementation is therefore one pure helper in the existing metadata module plus one controlled `<script type="application/ld+json">` in this existing server page. No API, contract, schema, package, or deployment change is needed.

**Primary recommendation:** Emit only `{ "@context", "@type", "headline", "description", "datePublished", "mainEntityOfPage", "url" }`, use the existing `publicUrl` for both URL fields, set `description` from the visibly rendered `summary` (not the potentially different SEO meta description), and serialize it through a single helper that escapes `<`, U+2028, and U+2029 before the value reaches `dangerouslySetInnerHTML`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Determine whether a post is public | API / Backend | Database | The repository predicate is the existing visibility authority. [VERIFIED: apps/api/src/content/public-repository.ts:17-21] |
| Reject malformed/non-public detail responses | Frontend Server (SSR) | API / Backend | `getPublicPost` validates the strict contract and maps only a valid `not_found` response to the 404 branch. [VERIFIED: apps/web/app/lib/api.ts:35-46; apps/web/app/lib/api.ts:142-143] |
| Build canonical public URLs and JSON-LD object | Frontend Server (SSR) | — | The Web metadata helper already owns same-origin canonical URL construction. [VERIFIED: apps/web/app/lib/site-metadata.ts:24-33, 66-88] |
| Embed safe JSON-LD bytes | Frontend Server (SSR) | Browser / Client | The server owns serialization; the browser only receives inert `application/ld+json` data. [ASSUMED] |
| Assert parseability, parity, and negative routes | Local test harness | Browser / Client | Existing generated main-browser and isolated discovery fixtures already execute public pages locally. [VERIFIED: scripts/local-verify.mjs:1353-1389; scripts/phase7-browser-verify.mjs:333-381] |

## Standard Stack

### Core

| Library / facility | Version | Purpose | Why this phase uses it |
|---|---:|---|---|
| `next` | `16.3.0` | Existing App Router Server Component page and dynamic metadata | Existing runtime; local docs confirm `generateMetadata` is supported in Server Components and can share data-fetching helpers with its page. [VERIFIED: apps/web/package.json — `"next": "16.3.0"`; CITED: apps/web/node_modules/next/dist/docs/01-app/01-getting-started/14-metadata-and-og-images.md] |
| Native `JSON.stringify` plus a narrow escaping helper | Node runtime | Create inert JSON-LD script text | No external serializer is needed for a fixed plain-data object. [ASSUMED] |

### Supporting

| Existing facility | Purpose | Use in Phase 9 |
|---|---|---|
| `publicUrl` / `pageMetadata` | Validated same-origin URL and canonical metadata | Derive the JSON-LD `mainEntityOfPage` and `url` from exactly the same encoded post path. [VERIFIED: apps/web/app/lib/site-metadata.ts:24-33, 66-88] |
| `publicPostDetailSchema` | Strict public detail boundary | Keep JSON-LD inputs limited to contract data already accepted by Web. The schema's public status literal is `"published"`. [VERIFIED: packages/contracts/src/public-posts.ts:19-27 — `status: z.literal("published")`; packages/contracts/src/public-posts.ts:43-48] |
| Existing Playwright fixtures | Browser-level SSR and privacy checks | Extend existing files instead of adding a new test owner. [VERIFIED: scripts/test-inventory.mjs:42-45] |

### Alternatives Considered

| Instead of | Could Use | Decision |
|---|---|---|
| Minimal native JSON-LD helper | A third-party schema/JSON-LD library | Do not add one: this is a static seven-property object and an extra dependency creates package, audit, and upgrade cost without solving visibility provenance. [ASSUMED] |
| Rendering JSON-LD in the existing article server page | API endpoint, client-side injection, global layout markup | Do not use them: only the resolved public article page has the verified publication predicate and exact visible facts. [VERIFIED: apps/web/app/posts/[slug]/page.tsx:11-16; apps/api/src/routes/public-posts.ts:65-76] |
| Visible `summary` | `seoDescription` | Do not use SEO description for JSON-LD `description`, because the page visibly renders `summary` while metadata may choose `seoDescription` first. [VERIFIED: apps/web/app/posts/[slug]/page.tsx:37-41, 85-90] |

**Installation:** none. No package legitimacy audit is required because Phase 9 installs no packages.

## Architecture Patterns

### System Architecture Diagram

```text
Browser GET /posts/:slug
        |
        v
Next Server Component ── getPublicPost(slug) ──> Fastify public detail route
        |                                             |
        |                                             v
        |                                      publicPredicate + strict DTO
        |                                             |
        <──────── only a public, parsed detail ───────┘
        |
        +--> visible h1 / summary / time
        +--> pageMetadata(canonical post URL)
        +--> narrow BlogPosting builder
                 |
                 v
           safe JSON script text --> <script type="application/ld+json">

Missing, malformed, draft, unpublished, or deleted detail
        --> notFound/error branch --> no BlogPosting script
```

### Recommended Project Structure

```text
apps/web/app/
├── lib/site-metadata.ts          # add pure BlogPosting builder + JSON script serializer
├── lib/site-metadata.test.ts     # add pure parity/escaping/key-set tests
└── posts/[slug]/page.tsx         # render one script only after valid public detail
apps/web/e2e/
├── public-discovery-fixture.ts   # provide a hostile-but-valid public detail fixture
├── public-discovery.spec.ts      # parse/compare JSON-LD on an isolated SSR article route
└── public-reading.spec.ts        # real lifecycle/404/no-leak coverage
```

### Pattern 1: Narrow object builder before serialization

**What:** Accept only `title`, `summary`, `slug`, and `publishedAt`, then construct a fixed-shape JSON-LD object. Do not accept the complete `PublicPostDetail`; that would make accidental later use of `renderedHtml`, `cover`, tags, or a newly added field easier. [ASSUMED]

**When to use:** Only after `getPublicPost` returns `kind === "ok"` inside the public article server page. [VERIFIED: apps/web/app/posts/[slug]/page.tsx:11-16]

**Recommended skeleton:**

```ts
type PublicJsonLdInput = Readonly<{
  title: string;
  summary: string;
  slug: string;
  publishedAt: string;
}>;

export function buildBlogPosting(input: PublicJsonLdInput, origin = publicOrigin()) {
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

The type/property names are supported by Schema.org: `BlogPosting` is a type under `Article`; `headline` is the article headline; `datePublished` is the first-publication date; and the official example includes `mainEntityOfPage`, `description`, and `url`. [CITED: https://schema.org/BlogPosting] Google documents Article JSON-LD in a `script type="application/ld+json"` element and advises using applicable properties. [CITED: https://developers.google.com/search/docs/appearance/structured-data/article]

### Pattern 2: Same resolved object drives visible and structured representations

Pass the result's four allowed values explicitly to the builder in `PublicArticlePage`; do not refetch, read the database, parse Markdown, or derive a URL from request headers. The page's existing canonical path uses `encodeURIComponent(article.slug)` and the helper must use the identical construction. [VERIFIED: apps/web/app/posts/[slug]/page.tsx:79-90; apps/web/app/lib/site-metadata.ts:24-33]

### Pattern 3: Fail closed by component reachability

Place the JSON-LD element in `PublicArticlePage` after its valid-detail guard. The `notFound()` and upstream-error throws happen before JSX is returned, so no article-script branch is reachable for non-OK detail results. [VERIFIED: apps/web/app/posts/[slug]/page.tsx:11-16]

### Anti-Patterns to Avoid

- **Serializing the whole article DTO:** It currently includes `renderedHtml` and optional cover data; more importantly, the API's internal result carries Markdown before the route strips it. Keep an explicit four-field input. [VERIFIED: packages/contracts/src/public-posts.ts:43-48; apps/api/src/content/public-repository.ts:304-317; apps/api/src/routes/public-posts.ts:70-76]
- **Using `seoDescription` for JSON-LD description:** It can diverge from the visible summary. Use `summary` for parity; retain the existing `seoDescription || summary` behavior only for HTML metadata. [VERIFIED: apps/web/app/posts/[slug]/page.tsx:37-41, 85-90]
- **Passing raw `JSON.stringify` to an HTML raw-text script:** A literal `</script>` in title or summary can terminate the script element; escape every `<`, plus U+2028/U+2029 as required by the acceptance constraint. [ASSUMED]
- **Adding a new test file casually:** The repository's inventory fails if on-disk test files are not exactly owned. Extend the existing metadata and browser suites unless there is a strong reason to update inventory/coordinators. [VERIFIED: scripts/test-inventory.mjs:51-70; scripts/local-verify.mjs:56-75]
- **Embedding global JSON-LD in layout, homepage, taxonomy, or 404 UI:** Those routes do not have a valid article result and violate SEO-05. [VERIFIED: apps/web/app/layout.tsx:11-15; apps/web/app/not-found.tsx:4-12]

## Don't Hand-Roll

| Problem | Do not build | Use instead | Why |
|---|---|---|---|
| Canonical URL parsing/validation | A second URL concatenator | Existing `publicUrl` | It rejects non-root-relative, protocol-relative, backslash, and cross-origin paths. [VERIFIED: apps/web/app/lib/site-metadata.ts:24-33] |
| Publication authorization | New Web-side status checks | Existing API predicate plus strict DTO | It already excludes draft, unpublished, deleted, and null-date records. [VERIFIED: apps/api/src/content/public-repository.ts:17-21; apps/api/src/routes/public-posts.ts:65-76] |
| Markdown/body extraction for JSON-LD | HTML/Markdown parser or article-body serialization | Omit `articleBody` entirely | The feature only needs visible summary; omitting raw content protects SEO-04 and avoids duplicating the renderer. [ASSUMED] |
| Structured-data package/schema builder | New npm dependency | A tiny typed fixed-shape function | Only seven static fields are needed; no graph merging, remote vocabulary, or schema validation service is in scope. [ASSUMED] |

## Common Pitfalls

### Pitfall 1: Canonical and JSON-LD drift

**What goes wrong:** `generateMetadata` and the JSON-LD builder create paths separately and later diverge on encoded slugs or origin handling.
**Avoid:** Both paths must call `publicUrl(`/posts/${encodeURIComponent(slug)}`)` through one small helper or the same local path variable. Assert the JSON-LD `url` and `mainEntityOfPage` equal the rendered `link[rel="canonical"]`. [VERIFIED: apps/web/app/posts/[slug]/page.tsx:85-90; apps/web/app/lib/site-metadata.ts:24-33]

### Pitfall 2: An injected closing script tag

**What goes wrong:** Author-controlled title/summary includes `</script><script ...>` and becomes executable sibling markup.
**Avoid:** Serialize once, replace every `<` with the literal six-character JSON escape `\\u003c`, and also escape U+2028/U+2029. Browser tests must parse the JSON text, assert one JSON-LD script, assert no literal `</script>` in its text, and assert no injected sentinel node. [ASSUMED]

### Pitfall 3: Private-field regression hidden by a passing page

**What goes wrong:** The browser page works but a future public detail field such as Markdown or internal media metadata is spread into JSON-LD.
**Avoid:** Use a four-field input type and an exact `Object.keys` unit assertion; hostile fixtures include private sentinels and browser assertions reject them. [VERIFIED: apps/web/e2e/public-discovery.spec.ts:36-50; apps/web/e2e/public-discovery-fixture.ts:1-16]

### Pitfall 4: Weak negative-route coverage

**What goes wrong:** JSON-LD appears on article 404s or non-article pages because it was added globally.
**Avoid:** Add zero-count assertions to the real draft/unpublished/deleted/unknown loop and isolated `/`, `/search`, and invalid-detail flows. The existing real journey already visits all four unavailable article states. [VERIFIED: apps/web/e2e/public-reading.spec.ts:16-27, 84-99]

## Exact Validation Plan

1. Extend `apps/web/app/lib/site-metadata.test.ts` rather than add a test file. Test `buildBlogPosting` against a fixed HTTPS origin and assert exactly these keys: `"@context"`, `"@type"`, `"headline"`, `"description"`, `"datePublished"`, `"mainEntityOfPage"`, `"url"`; assert both URL values equal the expected canonical URL and that no Markdown/internal/admin key is present. [ASSUMED]
2. In that same unit suite, use hostile `title`/`summary` containing `</script>`, U+2028, U+2029, and private markers. Assert serialized text contains no literal `</script>`, contains the required escape sequences, and `JSON.parse(serialized)` exactly recovers the fixed object. [ASSUMED]
3. Extend `apps/web/e2e/public-discovery-fixture.ts` with one public article whose title/summary make parity and escaping observable. In `public-discovery.spec.ts`, load its article page, find exactly one `script[type="application/ld+json"]`, parse `textContent`, compare `headline`, `description`, `datePublished`, and both URL fields to the visible `h1`, summary, `time[datetime]`, and canonical link, then assert fixture origin/internal/private sentinels do not occur. The isolated runner already copies the app and launches a generated loopback Web plus fixture. [VERIFIED: apps/web/e2e/public-discovery-fixture.ts:1-16, 187-190; apps/web/e2e/public-discovery.spec.ts:153-189; scripts/phase7-browser-verify.mjs:333-381]
4. In the same isolated browser suite, assert zero JSON-LD article scripts for at least `/` and `/search`; in `public-reading.spec.ts`, assert zero after draft, unpublished, deleted, and unknown detail routes. This covers both non-article and real lifecycle 404 paths. [VERIFIED: apps/web/e2e/public-reading.spec.ts:84-99]
5. Run, in escalating scope: `corepack pnpm test`; `corepack pnpm -r typecheck`; `node scripts/phase7-browser-verify.mjs`; then the existing local delivery command `corepack pnpm local:deliver` for the fixed local `3100` refresh/evidence gate. The final command must still report `RELEASE BLOCKED`; it is local verification, not deployment. [VERIFIED: package.json scripts; scripts/phase7-browser-verify.mjs:333-381; `.planning/REQUIREMENTS.md`]

No inventory change is needed if tests are appended to these existing files. If a planner instead creates any new `*.test.ts`/`*.spec.ts`, it must update the exact inventory and all sealed count/ownership assertions in the same task. [VERIFIED: scripts/test-inventory.mjs:12-49; scripts/local-verify.mjs:56-75]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Control |
|---|---|---|
| V2 Authentication | No | Public read path must not receive admin data; no new auth surface. [VERIFIED: `.planning/REQUIREMENTS.md`] |
| V3 Session Management | No | No cookie/session behavior changes. [VERIFIED: `.planning/REQUIREMENTS.md`] |
| V4 Access Control | Yes | Rely on the existing API's public predicate and fail-closed `not_found` mapping. [VERIFIED: apps/api/src/content/public-repository.ts:17-21; apps/web/app/lib/api.ts:35-46] |
| V5 Input Validation | Yes | Strict public DTO parse plus a narrow fixed input object before serialization. [VERIFIED: packages/contracts/src/public-posts.ts:19-48; ASSUMED] |
| V6 Cryptography | No | No cryptographic material or protocol changes. [VERIFIED: `.planning/REQUIREMENTS.md`] |

### Known Threat Patterns

| Pattern | STRIDE | Mitigation |
|---|---|---|
| Closing-tag injection from title/summary | Tampering / elevation of privilege | Escape `<` before raw script HTML insertion; test the browser-parsed script count and no injected marker. [ASSUMED] |
| Markdown, storage, or admin metadata exposure | Information disclosure | Whitelist four contract fields and exact-key test; never spread API/repository objects. [VERIFIED: apps/api/src/content/public-repository.ts:304-317; apps/api/src/routes/public-posts.ts:70-76] |
| JSON-LD emitted for unpublished content | Information disclosure | Script reachable only after `getPublicPost` has a valid `ok` result; test real lifecycle 404s. [VERIFIED: apps/web/app/posts/[slug]/page.tsx:11-16; apps/web/e2e/public-reading.spec.ts:84-99] |
| Internal origin in browser HTML | Information disclosure | Use `publicUrl` from `PUBLIC_ORIGIN`; keep `INTERNAL_API_ORIGIN` in server-only fetch helper and assert same-origin browser requests. [VERIFIED: apps/web/app/lib/api.ts:30-46; apps/web/app/lib/site-metadata.ts:24-33; apps/web/e2e/public-discovery.spec.ts:36-50] |

## Environment Availability

| Dependency | Required By | Available | Version / evidence | Fallback |
|---|---|---|---|---|
| Node.js | Typecheck, unit tests, local harness | ✓ | `v24.15.0` observed locally | — |
| Corepack / pnpm | Workspace commands | ✓ | Corepack `0.34.6`; pnpm `11.20.0` observed locally | — |
| Docker (local Colima context) | Existing local delivery gate only | ✓ | Docker Engine `29.7.1` client observed locally | Run unit/typecheck/isolated browser checks first if delivery is unavailable |
| Cloud server / external service | Phase 9 | Not used | Explicitly prohibited | No fallback needed |

## Recommended Plan Decomposition

### Plan 09-01 — Deterministic public JSON-LD primitive

- Add the narrow `BlogPosting` object builder and serializer to `apps/web/app/lib/site-metadata.ts`.
- Reuse `publicUrl` and the encoded post path; omit author, publisher, image, Markdown, rendered HTML, categories/tags, cover data, and `seoDescription`.
- Add unit assertions to the existing metadata test file for exact keys, canonical parity, and `</script>`/U+2028/U+2029 handling.
- Verify default tests and workspace typecheck.

### Plan 09-02 — SSR-only emission and full negative coverage

- Render one labelled `application/ld+json` script in `apps/web/app/posts/[slug]/page.tsx` only after the existing valid public result guard.
- Extend the existing isolated discovery fixture/spec for browser-level parsing, visible/canonical parity, same-origin privacy, and non-article zero-script checks.
- Extend the existing real public-reading lifecycle test to prove drafts, unpublished, deleted, and unknown routes have no article JSON-LD.
- Run isolated Phase 7 browser verification, then the existing fixed local delivery gate; record its local evidence and keep production `BLOCKED`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | The minimal seven-property `BlogPosting` object is sufficient for this milestone; optional author/publisher/image should remain omitted without an explicit public source. | Summary / Stack | Rich-result enhancement may be smaller, but privacy and parity remain correct. |
| A2 | Escaping `<`, U+2028, and U+2029 in the string supplied to `dangerouslySetInnerHTML` is the correct local serialization boundary. | Patterns / Security | Incorrect escaping can create an HTML script-breakout vulnerability; tests must validate rendered DOM and parse round-trip. |
| A3 | JSON-LD may be emitted in the server-rendered article body rather than requiring a metadata API head field. | Patterns | Search-engine discovery behavior could vary; current requirement only demands page output and automated parseability. |

## Open Questions

None blocking. Do not invent author, publisher, logo, image, `dateModified`, or article body fields: no approved public source/visibility requirement exists for them in Phase 9. [VERIFIED: `.planning/REQUIREMENTS.md`; ASSUMED]

## Sources

### Primary / codebase

- [VERIFIED: apps/api/src/content/public-repository.ts:17-21, 281-317] — public predicate and detail-source fields.
- [VERIFIED: apps/api/src/routes/public-posts.ts:65-76] — Markdown removed before public DTO parse.
- [VERIFIED: packages/contracts/src/public-posts.ts:19-48] — strict published public DTO.
- [VERIFIED: apps/web/app/posts/[slug]/page.tsx:11-90] — valid-detail guard, visible facts, canonical metadata route.
- [VERIFIED: apps/web/app/lib/site-metadata.ts:6-33, 66-88] — existing origin, URL, and canonical semantics.
- [VERIFIED: apps/web/e2e/public-reading.spec.ts:84-99; apps/web/e2e/public-discovery.spec.ts:153-189] — existing lifecycle and isolated browser seams.

### Official documentation

- [CITED: apps/web/node_modules/next/dist/docs/01-app/01-getting-started/14-metadata-and-og-images.md] — `generateMetadata` and shared server data-fetching guidance.
- [CITED: https://schema.org/BlogPosting] — `BlogPosting` type/property definitions and representation.
- [CITED: https://developers.google.com/search/docs/appearance/structured-data/article] — Article/BlogPosting JSON-LD usage and test guidance.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH for existing stack/no-install decision; MEDIUM for minimal schema field selection because it is intentionally scoped rather than a rich-result profile.
- Architecture: HIGH for integration points and test seams, verified from current source.
- Pitfalls: MEDIUM because the escaping pattern is testable but should be verified in the actual Next-rendered HTML during implementation.

**Research-cache note:** The required GSD cache write was attempted but sandboxing prevented creation of `/Users/xanadu/.gsd/research-cache`; no repository or server state was changed.

**Research date:** 2026-09-04
**Valid until:** 2026-10-04
