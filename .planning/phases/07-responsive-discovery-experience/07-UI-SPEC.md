---
phase: 7
slug: responsive-discovery-experience
status: approved
shadcn_initialized: false
preset: none
created: 2026-08-17
---

# Phase 7 — UI Design Contract

> Visual and interaction contract for the responsive public search and related-reading experience. It extends the existing Blog X public shell; it does not introduce a new visual system, client-side search, or a browser-to-server topology change.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none — retain CSS Modules and native semantic HTML |
| Preset | not applicable |
| Component library | none |
| Icon library | none; use text controls and the existing `→` reading affordance, with any decorative search glyph marked `aria-hidden` |
| Font | Existing editorial pairing: `ui-serif, Georgia, "Noto Serif SC", serif` for reading/content headings; `ui-sans-serif, system-ui, sans-serif` for navigation, controls and metadata; `ui-monospace, monospace` only for compact counters/eyebrows |

**Implementation boundary:** extend `PublicHeader`, `PostCard`, `Pagination`, `public.module.css`, `lib/api.ts`, and `lib/site-metadata.ts`; do not duplicate the public-card DTO renderer or create a second header. Search and related data are rendered by server components using the existing internal API helper and strict contracts. Browser-visible requests remain relative same-origin `/api/...` only.

---

## Spacing Scale

Declared values (all new Phase 7 spacing is a multiple of 4):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Search-icon/text separation, focus-outline offset adjustment |
| sm | 8px | Label-to-input gap, tag gap, compact-card metadata gap |
| md | 16px | Search form control gap, compact-card internal rhythm, action groups |
| lg | 24px | Search-result card padding, header/nav form separation, related-card gutter |
| xl | 32px | Search heading-to-results break, related-section top/bottom separation |
| 2xl | 48px | Major search-page section break |
| 3xl | 64px | Desktop discovery-page lead-in where it aligns with existing page shells |

Exceptions: existing public-shell fluid `clamp()` values and existing 18px/28px page gutters remain unchanged. New discovery surfaces use the scale above; all new actionable controls have a **44px minimum block size**, including the search submit control, clear/back actions, pagination directions and any whole-card link target.

---

## Typography

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | 16px, fluid only where the existing reading surface already uses `clamp()` | 400 | 1.75–1.9 |
| Label / metadata | 12–13px | 600 | 1.4–1.5 |
| Search input / action | 14–16px | 500–700 | 1.4 |
| Compact-card title | `clamp(1.35rem, 3vw, 2rem)` | 500 | 1.12 |
| Page heading | `clamp(2.8rem, 8vw, 6rem)` | 500 | .95 |
| Related-section heading | `clamp(1.7rem, 4vw, 2.45rem)` | 500 | 1.12 |

Titles, summaries, taxonomy terms and the echoed normalized query must wrap with `overflow-wrap:anywhere`; they must never force horizontal document overflow, be ellipsized into ambiguity, or enlarge the page-heading scale. Search query text is quotation-styled as content, not rendered as HTML.

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `--paper`: `#f7f3eb` light / `#171916` dark | Page background and header background |
| Secondary (30%) | `--surface`: `#fffdf8` light / `#20231f` dark; `--line`: `#d8d3c8` light / `#43473f` dark | Search field surface, card separation, borders and disabled boundaries |
| Accent (10%) | `--accent`: `#2d5e52` light / `#91c7b7` dark | Current navigation marker, visible focus outlines, input focus border, text links, active page and the search submit treatment |
| Destructive | `#b42318` light / `#fca5a5` dark | Reserved only for a future destructive visitor action; not used by Phase 7 search or related-content states |

Continue `--ink` (`#191b1a` / `#eeede6`) for primary text and `--muted` (`#6b6d68` / `#b7b9b1`) for supporting copy. Never use color alone for state: headings, text and semantic control state communicate search errors/emptiness. Accent is reserved for active/current navigation, focus, links, selected pagination, and the primary **搜索文章** submit control; it is not a blanket fill for every interactive element.

The existing light/dark/system pre-paint resolver and `prefers-reduced-motion` rule apply unchanged. New CSS must consume these variables rather than hard-code a light-only background, text color, or focus color.

---

## Copywriting Contract

| Element / state | Authoritative copy and action |
|-----------------|-------------------------------|
| Primary CTA | **搜索文章** — visible label for the search field and the primary native GET submit action. |
| Results summary | **“{query}” 的搜索结果**; **找到 {totalItems} 篇文章 · 第 {page} 页**. Use `篇文章` at every count. |
| Empty query | Heading: **请输入搜索内容**. Body: **输入标题、摘要或正文中的关键词，即可搜索已发布文章。** Action: **返回最新文章**; the search form remains available above it. |
| No results | Heading: **没有找到匹配文章**. Body: **试试更短的关键词，或返回最新文章继续浏览。** Actions: **清除搜索** and **返回最新文章**. |
| Page out of range | Heading: **这一页没有结果**. Body: **“{query}” 共有 {totalItems} 篇文章，请返回可用页码。** Actions: **返回第 1 页** and **清除搜索**. |
| Invalid condition | Heading: **搜索条件无效**. Body: **请使用不超过 80 个字符的搜索内容和有效页码后重试。** Actions: **清除搜索** and **返回最新文章**. Do not echo an unaccepted raw value. |
| Search upstream failure | Heading: **暂时无法完成搜索**. Body: **搜索服务似乎暂时不可用，请重试或返回最新文章。** Actions: keyboard-operable **重试** and **返回最新文章**. Do not expose host, port, contract, or exception details. |
| Related-content failure | Heading: **相关文章暂时不可用**. Body: **文章内容不受影响，你可以继续阅读或返回最新文章。** Action: **返回最新文章**. The article remains readable. |
| Destructive confirmation | **Not applicable.** Phase 7 adds no destructive visitor action, mutation, or confirmation dialog. |

The true related zero-match state deliberately has no copy: the entire related section is absent. Search cards keep the existing **阅读文章 →** destination language; search pagination is **搜索结果分页** with **上一页** and **下一页**.

---

## Layout and Responsive Contract

### Public search entry

| Range | Required layout and behavior |
|-------|------------------------------|
| Desktop `>= 1024px` | Keep the existing two-row public header. The navigation row retains its established link order and places an inline GET search form after public navigation links and before the trailing 管理 link. The field is compact (`min(320px, 28vw)` preferred), has a visible `搜索文章` label, a named `q` text input, and a 44px **搜索** submit control. It is a visible form, never icon-only, modal-only, or hidden behind JavaScript. |
| Tablet `701px–1023px` | Preserve the existing header controls and menu toggle. The same search form is inside the expanded `#public-navigation`, after the public links and before 管理; it takes the available menu width. When the enhanced menu is closed, its input and submit are not tabbable; without JavaScript the complete nav and form remain visible. |
| Mobile `<= 700px` | Keep the 18px shell gutter and the existing compact menu pattern. The expanded menu presents the search label, input and 44px submit in a stacked or naturally wrapping form; it must not produce horizontal overflow at 375px. Search remains discoverable only after the explicit menu action, not removed for compactness. |

The form is `<form action="/search" method="get">`; it must submit by Enter and pointer/touch without JavaScript. Its accessible label is visible text, the input has a useful `name="q"`, `type="search"`, and `maxLength=256`; it intentionally does **not** block an empty submit, because `/search` must render the honest empty-query state. Keep existing Escape-to-close and focus-restoration behavior. Route changes close the enhanced menu as today.

### Search results page

`/search` uses the existing public `.page`/content width and a discovery-style heading, not the oversized home hero. The page order is fixed on all widths:

1. `h1` **搜索文章** and a short explanatory line.
2. A page search form with the same label, GET semantics and control rules as the header; its value is the normalized accepted query when one exists.
3. A results summary or one honest state panel.
4. Compact result cards when present, then explicit pagination when applicable.
5. State-specific actions, in normal document/tab order.

On desktop the search form may be a single horizontal row; at `<=700px` it stacks without hiding any field or action. It uses the existing 1120px shell and 28px/18px gutters. Result cards are a single editorial list, separated by `--line`, with 24px vertical padding (rather than the home feed's 38px/42px) so discovery scans quickly without looking like a dashboard.

Each compact card retains the public-card information and order: formatted publication date, linked title, summary or **暂无摘要**, category and tags when supplied, then **阅读文章 →**. It uses the same public `PublicPostListItem` projection, date formatting and category/tag destinations as `PostCard`; it does not show rank, score, match location, hidden status, IDs, raw Markdown, or administrative fields. The title and reading link lead to the same permalink. The compact variant may omit the decorative ordinal and the redundant 已发布 badge because the search endpoint is already public-only.

### Related reading on article pages

Render the section after the article body's reading flow, within the article shell and before its end padding. Its visible heading is **继续阅读**. It uses the same compact card language and strict public-card projection as search, but has no search summary, ordinal, relevance score, shared-term count or explanation of why a match occurred.

At `>=1024px`, cards are a two-column grid with a 24px gutter. Between 701px and 1023px, use a naturally wrapping grid (`minmax(260px, 1fr)`) so two cards appear when space permits and one when they do not. At `<=700px`, it is exactly one column. Card titles, terms and summaries wrap; a 390px article page and a 375px search page have no document-level horizontal overflow.

Only a successful response containing one or more real matches renders the complete section. A successful empty array renders nothing at all: no heading, separator, placeholder, fabricated recent articles, or empty region. A related-request failure leaves the article readable and renders a small, visually subordinate recovery block at the section position; it is not a 404 and it is never mislabeled as “no matches”.

---

## Interaction and State Contract

### Navigation and pagination

- Submitting a query navigates to `/search?q={URL-encoded normalized query}`. No keystroke triggers a request, suggestions, autocomplete menu, search history, tracking, or infinite scroll.
- Search pagination retains the exact accepted `q` and changes only `page`: page 1 is `/search?q=…`; pages 2+ are `/search?q=…&page=N`. Adapt the existing `Pagination` helper rather than serializing a second pagination UI. Its navigation label is **搜索结果分页**, directions are **上一页**/**下一页**, and the current page is exposed with `aria-current="page"`.
- **清除搜索** navigates to `/search`; **返回最新文章** navigates to `/`. Both are normal links, work without JavaScript, and are at least 44px tall. No browser history mutation is required beyond ordinary navigation.
- Search is not a primary public-nav destination; existing current-page markings for 文章/分类/标签/归档/关于 remain accurate on `/search` and article pages. The header search form itself must not claim `aria-current`.

### Search page states

The following table assigns each API outcome to its layout behavior. Exact user-facing strings and actions are authoritative in **Copywriting Contract** above and must not be replaced with near-equivalents.

| Data condition | Required UI | Exact copy and available continuation |
|----------------|-------------|----------------------------------------|
| Valid results | Compact public cards and, when `totalPages > 1`, explicit pagination | Use the **Results summary** row; **清除搜索** and **返回最新文章** remain available. |
| Empty query (`empty_query`) | Calm empty panel; no cards and no pagination | Use the **Empty query** row. |
| No results (`no_results`) | Calm empty panel; no cards and no pagination | Use the **No results** row. |
| Valid query, page out of range (`page_out_of_range`) | Neutral empty panel, distinct from no results; no cards and no pagination | Use the **Page out of range** row; **返回第 1 页** targets the query's page-1 URL. |
| Invalid/unknown/duplicate query parameters or page | Honest invalid-state panel; do not send malformed values upstream | Use the **Invalid condition** row. |
| Search API unavailable, malformed, or other upstream error | Recovery panel visually consistent with existing `ServiceUnavailable`, but scoped to search; do not replace it with “no results” | Use the **Search upstream failure** row. |

For related content, use the **Related-content failure** row. A true zero-match response has no visible related section by product decision, rather than an empty-state message.

### In-flight and partial-data behavior

Search form submission, pagination, and clear/back actions are ordinary document navigations rendered on the server. Do not add a client fetch, spinner, optimistic card list, or stale-result substitution. Until the next document arrives, normal browser navigation behavior applies; the completed document renders exactly one of the states above. Server parsing is strict: an incomplete/malformed search or related DTO is an upstream failure, never a partially populated card. Individual optional public fields follow established fallbacks: summary becomes **暂无摘要**, absent category/tags remove only that taxonomy row, and no missing field changes the destination or reveals private data.

---

## Accessibility Contract

- Use landmark and native semantics: the existing named site `<nav>`, labelled GET forms, `h1` then ordered `h2`/card `h3` headings, `<article>` for cards, `<time>` for publication dates, and named pagination `<nav>`. Do not make a non-button `div` act as a search/menu control.
- Visible labels are required for both header and page search inputs. A decorative search glyph, if added, is `aria-hidden`; no icon is the sole accessible name. Every submit, clear, retry, return and pagination control has a descriptive visible or programmatic name.
- Preserve existing `:focus-visible` outline (`2px solid var(--accent)`, 4px offset) for newly introduced links, inputs and buttons. Never remove focus outlines. Menu Escape restores focus to its toggle; hidden compact-menu search controls have `tabIndex=-1` when closed.
- Results are server-rendered document content, not an async live region. Do not announce a count twice with `aria-live`; the document title, h1, result heading and normal reading order communicate the loaded state. Error panels use clear headings and actions rather than color or an icon alone.
- Respect the current reduced-motion rule. No transition, delayed reveal, auto-focus, type-ahead, or pointer-only interaction is required for discovery.
- Query text, article titles, summaries and taxonomy names remain escaped React text. Long Chinese/English strings, URLs and tags wrap safely. Ensure contrast follows the existing `ink`/`muted`/surface pair in both themes and retain 44px target size for Phase 7 actions.

---

## SEO and Metadata Contract

- `/search` is **always** `robots: noindex, follow`, for valid result pages as well as empty, no-result, out-of-range, invalid and upstream-error pages. It never enters `sitemap.xml`; do not alter existing RSS or sitemap output for articles/taxonomy.
- Canonical output is allowed only for a successful, normalized, non-empty query with exactly the supported parameters: `q` alone (page 1) or `q` plus one valid in-range `page`. Canonicalize to the normalized NFC-trimmed `q`; omit `page=1` from the canonical URL and retain page 2+ only when the real result page exists.
- Empty queries, invalid query/page syntax, out-of-range pages, duplicate keys, unknown keys, malformed encoding and upstream-error outcomes have no canonical link. They still carry `noindex, follow`.
- Search metadata must use the existing `pageMetadata`/public-origin authority. It must never derive an external URL from request headers, a backend address, unvalidated query text, or a secondary SEO helper. Search Open Graph values may describe **搜索文章** but must not claim indexability or leak result count/private information.

---

## Browser Verification Contract

Playwright coverage under `apps/web/e2e/` must verify the visitor-visible contract using seeded public/draft/downline/deleted fixtures and same-origin browser observation. It must not require Docker, production, a public server IP, or a live external service.

| Area | Required evidence |
|------|-------------------|
| Desktop search | At 1280px, the public header shows a labelled GET search form inside the navigation; Enter and the submit control navigate to `/search?q=…`; no request occurs merely from typing; cards expose only public fields and use public permalink/taxonomy links. |
| Compact search | At 768px and 375px, the search form is inside the collapsed menu; keyboard Enter opens/submits, Escape closes/restores focus, closed contents are not tabbable, and the expanded form remains usable. At all three widths (375/768/1280), document `scrollWidth <= clientWidth`. |
| No-JS/theme/targets | With JavaScript disabled, the search form and navigation remain visible and submitting it reaches a rendered result or empty state. Light, dark and system themes keep input, cards, focus and state copy legible. Phase 7 actionable controls have computed height at least 44px. |
| Results/state truth | Seed matching Chinese and English content, plus non-public content. Verify title/summary/Markdown matches, deterministic pagination with query preservation, empty query, no results, invalid parameters, out-of-range page and upstream failure copy/actions. Assert drafts/downline/deleted titles and score/match/admin fields never render. |
| Related reading | A published article with real shared category/tag terms shows up to four other public cards, no source card, in desktop two columns and mobile one column. A true zero-match article has no related heading/region. A related failure retains the article body and shows the distinct recovery copy, not a 404 or “no matches”. |
| Semantics and keyboard | Assert form labels, named navigation/pagination, `aria-current`, current-page links, focus-visible keyboard reachability, menu Escape behavior and native link/button activation. |
| SEO | Assert every `/search` variant has `noindex, follow`; only exact normalized supported query/page shapes have the documented canonical; malformed/duplicate/unknown/out-of-range/error forms have none. Assert `/search` is absent from `sitemap.xml`, while pre-existing sitemap/RSS entries remain unchanged. |
| Same-origin | Record browser requests for the journey and assert every HTTP(S) request has the local Web origin and any discovery route is relative `/api/public/search` or `/api/public/articles/:slug/related`; page HTML, errors, metadata and links contain no `124.222.91.230`, `47.99.80.8`, `INTERNAL_API_ORIGIN`, host/port diagnostics, or raw backend origin. |

---

## UI Considerations

Runtime probe evidence: **30 applicable element/category checks, 30 explicit resolutions, 0 backstop, 0 unresolved**. The checks collapse into the eight required taxonomy categories below for plan-phase lifting.

| Category | Element(s) | Status | Resolution / Reason |
|----------|------------|--------|---------------------|
| empty | Header/page search forms; search result collection | ✅ covered | Empty input is submitted normally and renders the documented **请输入搜索内容** state; `empty_query` and `no_results` render no cards or pagination and retain a browse path. |
| loading | Header/page search forms; pagination; related section | ✅ covered | Discovery is SSR document navigation, not in-place client loading: no spinner, optimistic results or stale substitution; completed documents render one honest terminal state. |
| error | Header/page search forms; pagination; related section | ✅ covered | Search unavailable/malformed responses render **暂时无法完成搜索** with retry and return actions; related failure preserves the article and renders its distinct recovery block. |
| populated | Search result collection; related-card collection | ✅ covered | Search displays compact public cards with count and explicit pagination; related displays one to four compact, source-excluding public cards only after a non-empty successful response. |
| partial | Search and related public-card collections | ✅ covered | Strict response contracts turn malformed/incomplete responses into failure states; optional summary/taxonomy follow established fallbacks without changing public destinations or exposing private fields. |
| overflow | Header navigation/search form; compact cards; query/count/static copy | ✅ covered | 1023px menu stacking, 700px form/card reflow, safe wrapping and browser checks at 375/768/1280 prevent document horizontal overflow; no important content is clipped. |
| zero-one-many | Search result collection; related-card collection | ✅ covered | Zero states follow documented copy; one and many results retain the same single-list card rhythm, `篇文章` wording and pagination rules; related zero hides the entire section, one-to-four reflow responsively. |
| long-text | Search input/query echo; navigation; titles, summaries and taxonomy links | ✅ covered | Input has a raw 256-code-unit bound and server 80-code-point validation; accepted query and public text wrap with `overflow-wrap:anywhere` and never use unsafe HTML, destructive truncation or a second content order. |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not required |
| third-party registries | none | not applicable — do not add a component package for this phase |

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: passed after the standard contract-section revision
- [x] Dimension 2 Visuals: passed
- [x] Dimension 3 Color: passed
- [x] Dimension 4 Typography: passed
- [x] Dimension 5 Spacing: passed
- [x] Dimension 6 Registry Safety: passed

**Approval:** verified by an independent UI checker on 2026-08-17; runtime UI-consideration probe resolved all 30 applicable checks explicitly.
