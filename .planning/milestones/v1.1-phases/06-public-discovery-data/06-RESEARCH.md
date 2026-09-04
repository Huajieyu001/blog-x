# Phase 6 Research — Public Discovery Data

**Researched:** 2026-08-15
**Scope:** SRCH-01, SRCH-02, SRCH-03, READ-08
**Confidence:** HIGH for the existing architecture and contract boundaries; MEDIUM for the eventual search-index threshold because no production corpus or query telemetry exists.
**Operational state:** local research only; browser remains same-origin; both cloud servers were untouched; production remains `BLOCKED`.

## Executive Recommendation

Implement Phase 6 entirely inside the existing contracts → Fastify route → public repository → PostgreSQL boundary. Add no package and no resident search service.

- Keep `publicPredicate` from `apps/api/src/content/public-repository.ts` as the one visibility authority for search, source-article lookup, and related candidates.
- Treat one normalized visitor query as one literal, case-insensitive substring. Search `title`, then `summary`, then raw Markdown using parameterized `ILIKE ... ESCAPE '\'`; do not split into an unbounded token expression and do not interpret `%` or `_` as visitor-controlled wildcards.
- Rank by a field class, not a fuzzy score: title match = 3, summary = 2, Markdown = 1; then `published_at DESC, id DESC`. Do not expose the rank.
- Reuse `publicPostListItemSchema` for both result types. Search adds only a strict response envelope; related reading returns a fixed, small array of public cards.
- Rank related posts lexicographically by shared category first, then shared-tag count, then `published_at DESC, id DESC`; return no candidates when neither category nor tags overlap.
- Do not add a search migration initially. Leading-wildcard substring search cannot use the current B-tree indexes, and three GIN trigram indexes are not justified for the known personal-blog scale. Bound the query, page, response size, GET rate, and PostgreSQL statement time. Keep `pg_trgm` as a measured follow-up, not a speculative dependency.
- Add a Phase-6-specific local verifier selection. Do not rewrite the archived v1.0 Phase 5 receipt/audit merely to add Phase 6 coverage; Phase 8 should establish the final v1.1 full-gate receipt.

## Corrected Existing-Code Map

`06-CONTEXT.md` mentions `apps/api/src/articles/repository.ts`; that path does not exist. The real public authority is:

| Concern | Existing authority | Reuse decision |
|---|---|---|
| Public visibility | `apps/api/src/content/public-repository.ts` → `publicPredicate` | Import/reuse exactly; never restate lifecycle conditions in a new repository. |
| Public card projection | `publicListSelection` plus category/tag hydration in the same file | Extract a small repository-local card mapper/hydrator if needed; keep raw Markdown out of its return value. |
| Strict wire DTO | `packages/contracts/src/public-posts.ts` → `publicPostListItemSchema` | Reuse directly for search and related items. |
| Stable public order | `publishedAt DESC, id DESC` in public and taxonomy repositories | Use the same tie order after discovery-specific rank. |
| Taxonomy relations | `articles.category_id`, `article_tags`, `categories`, `tags` in `apps/api/src/db/schema.ts` | Compute related ranking in PostgreSQL, never in Web. |
| Public routes | `apps/api/src/routes/public-posts.ts` | Add both endpoints to this already registered plugin unless file size warrants one `public-discovery.ts` plugin. |
| API registration | `apps/api/src/app.ts` | Reuse the one `createPublicRepository(db)` instance and pass it to the public routes. |
| Same-origin browser path | `apps/web/next.config.ts` maps `/api/:path*` to the internal API | Phase 7 browser calls remain relative `/api/public/...`; SSR helpers may use `INTERNAL_API_ORIGIN`. |
| Disposable PostgreSQL verification | `scripts/local-verify.mjs` and current `*_TEST_DATABASE_URL` suites | Add a named Phase 6 suite to the generated namespace; never depend on ambient/local production data. |

The existing predicate is already the required invariant:

```ts
export const publicPredicate = and(
  eq(schema.articles.status, "published"),
  isNull(schema.articles.deletedAt),
  isNotNull(schema.articles.publishedAt),
);
```

Search and related queries must apply it in SQL before counting, ranking, limiting, joining public terms, or returning any row. Filtering after selecting rows is not acceptable.

## Recommended Contract Surface

Keep discovery schemas in a focused `packages/contracts/src/public-discovery.ts` and export it from `packages/contracts/src/index.ts`. Reusing the public card schema prevents a second field allowlist from drifting.

### Search query

Recommended endpoint:

```text
GET /public/search?q=<visitor-query>&page=<positive-integer>
```

Recommended constants:

```ts
publicSearchPageSize = 10
publicSearchMaxPage = 100
publicSearchMaxQueryCodePoints = 80
publicSearchMaxRawCodeUnits = 256
```

The raw cap is checked before normalization so an oversized encoded value is rejected early. The semantic cap is checked after normalization by Unicode code points (`Array.from(value).length`), not UTF-16 code units. `page` defaults to 1, is an integer in `1..100`, and multiplication never receives an attacker-selected large offset. Reject unknown keys, duplicated array values, decimals, signs, zero, and values outside the cap.

Normalize in this order:

1. Require a string (or treat missing `q` as empty only).
2. Reject more than 256 UTF-16 code units.
3. `normalize("NFC")`, then Unicode-aware trim.
4. Count code points and reject more than 80.
5. Preserve internal whitespace and punctuation literally; do not tokenize, stem, fuzzy-match, or silently rewrite user meaning.

Use NFC rather than NFKC. NFC makes composed/decomposed Unicode comparable without changing full-width characters or other compatibility characters into a different query. PostgreSQL 18's UTF-8 database can apply the same NFC normalization to stored fields in the search expression. Tests must cover both a composed stored value with a decomposed query and the reverse direction.

### Search response

Recommended strict envelope:

```ts
{
  state: "empty_query" | "no_results" | "results" | "page_out_of_range";
  query: string;                  // normalized query, never raw duplicate input
  page: number;
  pageSize: 10;
  totalItems: number;
  totalPages: number;
  items: PublicPostListItem[];
}
```

The schema should use a discriminated union (or strict object plus `superRefine`) so contradictory states fail parsing:

- `empty_query`: empty normalized query, all counts zero, empty items; no database article scan.
- `no_results`: non-empty query, `totalItems = totalPages = 0`, empty items.
- `results`: non-empty query, positive total, non-empty current page.
- `page_out_of_range`: non-empty query, positive total, requested page above `totalPages`, empty items.

This is more honest than overloading an empty list. Search results expose only the existing card fields: title, summary, slug, publication time, literal published status, public category, and public tags. Do not return raw Markdown, a generated snippet, matched field, internal rank, article UUID, category/tag UUID, lifecycle timestamps, or deleted/status metadata.

Recommended strict errors:

```ts
{ error: "invalid_search_query" } // malformed, duplicate, oversized
{ error: "invalid_search_page" }  // malformed or above cap
{ error: "search_unavailable" }   // PostgreSQL timeout only, HTTP 503
```

Other unexpected failures remain opaque server errors. Do not echo PostgreSQL details, the raw SQL pattern, or environment configuration.

### Related response

Recommended endpoint and fixed limit:

```text
GET /public/articles/:slug/related
publicRelatedPostLimit = 4
```

Use no visitor-controlled limit in v1.1. A fixed four-card response is enough for the Phase 7 SSR section and removes another resource-control surface.

```ts
publicRelatedPostsResponseSchema = z.object({
  items: z.array(publicPostListItemSchema).max(publicRelatedPostLimit),
}).strict();
```

If the source slug is unknown, draft, unpublished, deleted, or lacks `publishedAt`, return the same parsed `{error:"not_found"}` and HTTP 404 already used by public detail. If the public source exists but has no shared taxonomy, return HTTP 200 with `{items:[]}`. Never expose source/candidate IDs, score, shared tag names beyond each card's ordinary public tags, or any explanation that could reveal hidden associations.

## Search SQL Strategy

### Literal pattern escaping

Build one escaped value in TypeScript:

```ts
function escapeLikeLiteral(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}
const pattern = `%${escapeLikeLiteral(query)}%`;
```

Bind `pattern` as a Drizzle parameter. Each field expression must explicitly use one escape character:

```sql
normalize(title, NFC) ILIKE $1 ESCAPE '\'
```

The exact Drizzle expression may use a `sql` tagged template because Drizzle's convenience `ilike()` does not make the `ESCAPE` contract obvious. Only the fixed SQL tokens are inline; the visitor value remains a bound parameter. Escape backslash first through the single character-class replacement, then `%` and `_`; quotes, semicolons, comment markers, and NUL-invalid input never become SQL syntax.

Required hostile cases include literal `%`, `_`, `\`, `' OR 1=1 --`, emoji, combining marks, CJK, ASCII case differences, tabs/newlines, and a query containing only wildcard characters. `%` and `_` may legitimately match an article containing those literal characters, but must never become a match-all request.

### Predicate, rank, count, and pagination

Define reusable repository expressions for `titleMatch`, `summaryMatch`, and `markdownMatch`, each against NFC-normalized stored text and the same escaped bound pattern. The WHERE clause is:

```text
publicPredicate AND (titleMatch OR summaryMatch OR markdownMatch)
```

Use a highest-matching-field class:

```sql
CASE
  WHEN titleMatch THEN 3
  WHEN summaryMatch THEN 2
  WHEN markdownMatch THEN 1
  ELSE 0
END
```

Then order by:

```text
matchClass DESC, publishedAt DESC, id DESC
```

This guarantees that any title match outranks every summary-only match, and every summary-only match outranks every Markdown-only match. An additive score would be less clear and could accidentally allow multiple lower-field matches to overtake a title match. UUID order follows the existing newest-first public convention (`DESC`) and must be frozen in tests.

Run exact count and page selection in the same `repeatable read`, `read only` transaction, matching `listPage()`, so lifecycle changes cannot make `totalItems` and `items` describe different snapshots. Apply fixed `LIMIT 10` and capped `OFFSET`. Hydrate category/tags only for the at-most-ten selected rows, order tags by `name` plus an internal stable tie (`id` or `slug`), then parse the final envelope with contracts.

Set a fixed transaction-local PostgreSQL `statement_timeout` (recommended starting point: 2000 ms) before search count/page queries. Catch only SQLSTATE `57014` from that search operation and map it to the strict 503 response. The existing global bounded GET rate limiter remains the outer request-rate control. Timeout is a safety budget, not a performance claim.

### Why not PostgreSQL full-text search for v1.1

The built-in `simple` text-search configuration is useful for tokenized Latin content, but it does not provide the required ordinary Chinese substring behavior without a language-specific parser. Mixing full-text ranking for English with `ILIKE` for Chinese would also make relevance harder to explain. Literal NFC `ILIKE` has one behavior for both languages and meets the agreed small-corpus boundary.

### Why not `pg_trgm` yet

`pg_trgm` can accelerate many leading-wildcard `LIKE`/`ILIKE` patterns, but adding it now would require an extension migration and large GIN index entries for title, summary, and especially Markdown. Very short queries can still produce weak/no selective trigrams. With no corpus-size or latency evidence, that storage/write/migration cost is premature on 2C4G.

Do not add a B-tree and claim it accelerates `%query%`; it does not. Start with bounded public-row scans, exact tests, GET rate limiting, and statement timeout. Record a follow-up threshold during implementation (for example, measured p95 search latency or public corpus growth) and only then evaluate one partial trigram index, preferably on a deliberately maintained combined search document rather than three speculative GIN indexes.

## Related-Article SQL Strategy

Perform source authorization and candidate ranking inside one repeatable-read, read-only transaction:

1. Resolve the source by `slug` **and `publicPredicate`**, selecting only `id` and nullable `categoryId` internally.
2. If absent, return the same public 404 as detail.
3. Select candidates from `articles` with `publicPredicate`, `candidate.id <> source.id`, and at least one real overlap:
   - `source.categoryId IS NOT NULL AND candidate.categoryId = source.categoryId`, or
   - an `EXISTS`/join proving a candidate tag also belongs to the source.
4. Compute `categoryMatch` and `sharedTagCount` in SQL.
5. Order by `categoryMatch DESC, sharedTagCount DESC, candidate.publishedAt DESC, candidate.id DESC`, then `LIMIT 4`.
6. Hydrate only those four rows into existing strict public cards.

Prefer the lexicographic tuple over a magic scalar such as `category * 100 + tagCount`. It guarantees category overlap always wins even if tag counts later grow beyond an assumed maximum. The tuple is still an explicit, explainable score while remaining internal.

The current indexes already cover the important joins:

- `article_tags_article_tag_unique(article_id, tag_id)` supports reading the source/candidate tag set.
- `article_tags_tag_index(tag_id)` supports reverse lookup of candidates sharing a tag.
- `articles_category_public_index(category_id, status, published_at)` supports category candidates.
- `articles_public_index(status, published_at)` supports the public subset and final time order.

No schema migration is required for the first implementation. The candidate limit is applied after deterministic score ordering; limiting each taxonomy branch separately would change the result and must be avoided.

## Implementation Map

Recommended Phase 6 product-code touch points:

| File | Change |
|---|---|
| `packages/contracts/src/public-discovery.ts` | New strict query/response/error schemas, constants, and inferred types. |
| `packages/contracts/src/index.ts` | Export the new contract module. |
| `packages/contracts/src/public-discovery.test.ts` or existing contract test convention | Prove strict unknown-field rejection, Unicode/page bounds, state invariants, and no internal fields. |
| `apps/api/src/content/public-repository.ts` | Add normalization/pattern helper expressions, `searchPage`, `relatedBySlug`, and optionally one internal public-card hydrator shared with `listPage`. Keep `publicPredicate` here. |
| `apps/api/src/routes/public-posts.ts` | Add `/public/search` and `/public/articles/:slug/related`; parse all inputs before repository work and map timeout only. |
| `apps/api/test/public-discovery.test.ts` | Disposable-PostgreSQL integration suite covering all discovery semantics and leaks. |
| `apps/api/test/public-visibility.test.ts` | Add lifecycle transition assertions for search and related if keeping cross-route lifecycle coverage centralized. |
| `scripts/local-verify.mjs` | Add a Phase-6-specific database selection/mode and generated DB invocation; keep browser work deferred to Phase 7. |
| `scripts/local-verify.test.mjs` | Assert the Phase 6 suite is selected exactly once and fail-closed with a real DB URL. |

No Phase 6 changes are needed in `apps/web/app` beyond future API consumption preparation; final search page, navigation, related cards, canonical/noindex behavior, responsive layout, and browser journeys belong to Phase 7. `apps/web/next.config.ts` already ensures future browser requests use `/api/...` on the Web origin.

## Migration and Schema Decision

**Recommendation: no Phase 6 migration in the initial plan.**

Reasons:

1. Search requires leading-wildcard literal substring matching; the current B-tree schema cannot accelerate it.
2. Existing taxonomy indexes are sufficient for a four-row related query at personal-blog scale.
3. Avoiding a speculative extension/index also avoids changing the migration ledger and archived backup/restore fixtures solely for unmeasured performance.
4. Query/page/result/rate/statement-time bounds provide enforceable resource controls now.

The implementation plan should include an explicit review checkpoint after the integration fixture exists. If local `EXPLAIN (ANALYZE, BUFFERS)` against a representative generated corpus shows unacceptable behavior, introduce a separate reviewed migration plan for `pg_trgm`, update `schemaVerify()`, migration ledger expectations, backup/restore inventories, and local-verifier schema inspection together. Never install an external search daemon.

## Verification Strategy

### Contract tests

- Missing/blank `q` becomes a parsed `empty_query`; it is not a database browse.
- Unknown query keys and duplicate `q`/`page` values fail strict parsing.
- Raw and normalized Unicode lengths are enforced; code points are not confused with UTF-16 units.
- Every response state rejects contradictory counts/items and unknown fields.
- Public card parsing rejects `markdown`, `id`, `score`, `status: draft`, `deletedAt`, category/tag IDs, and arbitrary extras.

### PostgreSQL API integration

Use one new `apps/api/test/public-discovery.test.ts` with a runner-owned migrated database. Seed fixed UUIDs and timestamps, then prove:

- title-only, summary-only, and Markdown-only matches rank 3 → 2 → 1 regardless of insertion order;
- rank ties use `publishedAt DESC`, then UUID `DESC`, and repeated requests are byte-for-byte stable;
- at least two pages remain stable with tied ranks/timestamps;
- Chinese and English case-insensitive queries work; composed/decomposed Unicode behaves canonically;
- `%`, `_`, and backslash are literal; SQL-shaped input does not broaden results or mutate data;
- missing/blank query performs the explicit zero result path; malformed/oversized query and page are 400;
- page 100 is bounded and page 101 is rejected; beyond-total pages return the declared state;
- draft, unpublished, deleted, and published-with-null-time rows containing unique secret markers never appear and their title/summary/Markdown markers never occur in response bytes;
- only public card keys occur in search/related bodies;
- related excludes the source, prioritizes shared category before tag-only candidates, then more shared tags, then time/UUID ties;
- no-overlap returns `items:[]` rather than unrelated content;
- hidden/unknown source slugs are indistinguishable 404s;
- publishing, unpublishing, republishing, and soft-deleting source/candidates changes the next response with no stale cache.

Tests should assert complete response objects or exact key sets, not only the presence of one expected slug. Unique secret markers should be planted independently in every non-public field/state.

### Local full-gate integration

Add `phase6Selection("data")` and `--phase6-data` (exact naming is implementation discretion) to `scripts/local-verify.mjs`. It should:

1. use the generated `blogxverify_*` PostgreSQL namespace and existing idempotent migration path;
2. typecheck and build the workspace;
3. run the new discovery DB suite with its own required environment variable, never a skip-capable ambient test;
4. run existing public-list, public-visibility, taxonomy, Phase 2 public-boundary, security, and boundary suites that protect the reused authority;
5. verify schema and migration ledger remain unchanged when the no-migration recommendation is followed;
6. end with a machine-readable local pass while preserving the canonical production decision `BLOCKED`.

Keep Phase 6's selection separate from `phase5Selection("full")` and its retained receipt. The archived Phase 5 receipt is evidence for its committed v1.0 revision, not a mutable v1.1 receipt. Phase 8 should build the new exhaustive v1.1 full selection/receipt including Phase 6 API and Phase 7 browser suites. Until then, Phase 6 verification must still select its suite exactly once and fail if it is skipped or reports zero TAP tests.

Recommended focused commands for implementation plans:

```text
node --import tsx --test --test-reporter=tap apps/api/test/public-discovery.test.ts
corepack pnpm -r typecheck
node scripts/check-boundaries.mjs
corepack pnpm local:verify -- --phase6-data
```

The database test command must receive a generated migrated database URL from the verifier; running it without that authority and accepting `SKIP` is not evidence.

## Risks and Required Mitigations

| Risk | Required mitigation |
|---|---|
| A new route reconstructs visibility rules incorrectly | Import `publicPredicate`; all-states secret-marker fixture; exact response key checks. |
| `%` or `_` becomes match-all | One tested escape helper, explicit `ESCAPE '\'`, bound parameter, wildcard-only fixtures. |
| Unicode length or normalization drifts | NFC in query and PostgreSQL field expression; code-point count; composed/decomposed tests. |
| Expensive query/page abuse | raw + semantic query caps, page cap 100, page size 10, global GET limiter, 2s transaction-local timeout. |
| Title priority becomes ambiguous | highest-field class `3/2/1`, not additive scoring; exact order fixture. |
| Stable pagination changes under ties | freeze `rank DESC, publishedAt DESC, id DESC`; repeatable-read count/page; multi-page fixed UUID fixtures. |
| Related score leaks internal taxonomy or lifecycle data | public-card DTO only; no score/shared-count/source IDs in wire response. |
| Hidden source reveals existence | source lookup includes `publicPredicate`; identical 404 body/status for every unavailable state. |
| N+1 relation hydration grows | hydrate only max 10 search or 4 related rows; optionally batch tags by selected IDs, but do not query relations for all matches. |
| A speculative index bloats Markdown writes/storage | no initial search index; measure representative corpus before a reviewed `pg_trgm` migration. |
| Historical v1.0 evidence is overwritten | separate Phase 6 gate; Phase 8 owns v1.1 full receipt. |
| Browser gains a secondary-server dependency | Phase 7 uses relative `/api`; Phase 6 adds no public address or Web database client. |
| Local success is mislabeled as production readiness | every gate and report retains release state `BLOCKED`; no SSH/deploy/unfreeze capability. |

## Suggested Plan Slices

1. **Contracts and hostile query parsing (TDD):** strict schemas, normalization/code-point bounds, wildcard helper tests, response-state invariants.
2. **Published-only search data path (TDD):** repository + route, literal multilingual matching, 3/2/1 rank, stable pagination, timeout mapping, strict public DTO.
3. **Deterministic related data path (TDD):** public source authority, category/tag tuple, empty honesty, lifecycle transitions, strict response.
4. **Phase 6 gate and verification:** generated PostgreSQL selection, legacy public-boundary regressions, type/build/boundary checks, no migration drift, production remains `BLOCKED`.

Each slice is independently committable. No slice should add Phase 7 UI, touch either server, rewrite archived milestone evidence, or change the production release state.

## Files Reviewed

- `AGENTS.md`, `apps/web/AGENTS.md`
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/phases/06-public-discovery-data/06-CONTEXT.md`
- `packages/contracts/src/public-posts.ts`, `taxonomy.ts`, `index.ts`
- `apps/api/src/content/public-repository.ts`, `taxonomy-repository.ts`, `page-repository.ts`
- `apps/api/src/routes/public-posts.ts`, `public-taxonomy.ts`
- `apps/api/src/db/schema.ts`, `apps/api/drizzle/0000...0006`, migration journal
- `apps/api/src/app.ts`, `apps/api/package.json`, root `package.json`, `compose.yaml`
- `apps/api/test/public-list.test.ts`, `public-visibility.test.ts`, `phase2-public-visibility.test.ts`, `taxonomy.test.ts`
- `apps/web/next.config.ts`, `apps/web/app/lib/api.ts`, current public list/detail pages and public-list browser test
- `scripts/local-verify.mjs`, `scripts/local-verify.test.mjs`, and the existing Phase 5 suite-selection/receipt boundary

No external network source was used because this research was constrained to local code and installed PostgreSQL 18 behavior; index adoption remains explicitly evidence-gated.
