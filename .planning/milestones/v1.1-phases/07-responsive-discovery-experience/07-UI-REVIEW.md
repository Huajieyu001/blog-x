---
phase: 07-responsive-discovery-experience
reviewed: 2026-08-19T15:46:44Z
status: passed
score: 21/24
needs_human_review: false
---

# Phase 7 UI Review — Responsive Discovery Experience

Phase 7 passes the implementation-level UI audit. The current search and related-reading experience honors the locked product decisions, provides honest terminal states, preserves native navigation and keyboard behavior, and has executable evidence at mobile, tablet, and desktop widths. No blocking UI-spec violation was found.

This was a code-and-test-evidence audit. No new screenshots were required or produced; the dedicated generated-port Playwright gate already exercises the measurable responsive and interaction contract.

## Score

| Pillar | Score | Assessment |
|---|---:|---|
| Copywriting | 4/4 | All authoritative Chinese headings, descriptions, counts, and recovery actions are exact and state-specific. |
| Visuals | 4/4 | Search, compact cards, pagination, and related reading form one coherent editorial hierarchy with one DOM/information order. |
| Color | 3/4 | Light, dark, and system tokens are consistently reused; automated evidence proves theme switching and visible focus, but not component-level contrast ratios. |
| Typography | 3/4 | Serif/sans/mono roles and wrapping behavior are coherent, though compact-card title values drift from the exact UI-SPEC token. |
| Spacing | 3/4 | Shell gutters, breakpoints, control targets, and related-grid gutters are sound; several search/card rhythm values differ from the declared spacing contract. |
| Experience Design | 4/4 | Native GET search, exhaustive honest states, related zero/failure behavior, keyboard flow, no-JS access, SEO, and same-origin boundaries are all well integrated. |
| **Overall** | **21/24** | **Passed — only non-blocking design-token and evidence refinements remain.** |

## Evidence Reviewed

- The approved design contract and locked decisions in `07-UI-SPEC.md` and `07-CONTEXT.md`.
- All four Phase 7 plans and execution summaries.
- `07-VERIFICATION.md`, the original five-warning `07-REVIEW.md`, and the completed `07-REVIEW-FIX.md` remediation record.
- Production components and routes: `SearchForm.tsx`, `PublicHeader.tsx`, `PostCard.tsx`, `Pagination.tsx`, `/search`, and `/posts/[slug]`.
- Styling and theme authority in `apps/web/app/public.module.css`.
- Request, metadata, and same-origin authorities in `search-discovery.ts`, `site-metadata.ts`, `search-encoding.ts`, `proxy.ts`, and `api.ts`.
- The finite fixture, all Playwright assertions, and the bounded Phase 7 browser runner.

The previous review warnings are resolved in current source: compact taxonomy targets are 44px and measured, incomplete isolated roots are removed, runner-owned Playwright descendants use bounded process-group cleanup, privacy/source-dedup fixtures are non-vacuous, and public URL resolution rejects cross-origin authority forms.

## Six-Pillar Audit

### 1. Copywriting — 4/4

The route implements every authoritative state without near-equivalent substitutions:

- Empty query: **请输入搜索内容** with the required explanatory sentence and **返回最新文章**.
- No results: **没有找到匹配文章** with **清除搜索** and **返回最新文章**.
- Out of range: **这一页没有结果**, an exact normalized query/count sentence, **返回第 1 页**, and **清除搜索**.
- Invalid request: **搜索条件无效** without echoing rejected input.
- Upstream failure: **暂时无法完成搜索** with **重试** and **返回最新文章**, without diagnostics.
- Related failure: **相关文章暂时不可用**, while the article remains readable.
- Populated search: **“{query}” 的搜索结果** and **找到 {totalItems} 篇文章 · 第 {page} 页**.

The fixture and browser suite assert the exact copy for the principal empty, populated, invalid, out-of-range, malformed, HTTP-failure, related-zero, and related-failure paths.

### 2. Visuals — 4/4

The implementation extends the existing editorial system instead of introducing a dashboard or a parallel card language:

- `/search` uses the 1120px public shell and a discovery heading rather than the oversized home hero.
- Results remain a single editorial list with borders and compact cards.
- Related cards reuse `PostCard`'s compact variant and appear after the complete article body.
- Related content is a two-column desktop grid, naturally wrapping tablet grid, and one-column mobile grid.
- True related zero removes the entire region; failure uses a subordinate recovery block instead of an empty-card shell or 404.
- Long headings, summaries, taxonomy terms, and hostile strings use wrapping rather than ellipsis or clipping.

The Playwright suite checks information order, card order, source/duplicate removal, column counts, and document overflow at 375px, 768px, and 1280px.

### 3. Color — 3/4

The implementation consistently consumes `--paper`, `--surface`, `--ink`, `--muted`, `--line`, and `--accent` in light, dark, and system modes. Search controls, cards, state panels, focus outlines, links, and active pagination retain semantic structure rather than relying on color alone. The destructive palette remains unused.

The browser test switches among **浅色**, **深色**, and **跟随系统**, checks foreground/background separation, and verifies visible focus outlines. The remaining limitation is evidence precision: it does not calculate component-level contrast ratios for muted copy, the search field, the accent submit button, state panels, and selected pagination in each theme.

### 4. Typography — 3/4

The serif reading surface, sans-serif navigation/control metadata, and monospace eyebrow/counter roles match the design system. Heading hierarchy is semantic (`h1` → section `h2` → card `h3`), and long content is not visually truncated.

One non-blocking token drift remains: the contract specifies compact-card titles at `clamp(1.35rem, 3vw, 2rem)` with `1.12` line height, while `.compactPostCard h3` uses `clamp(1.45rem, 3.3vw, 2.25rem)` with `1.2`. The current values remain responsive and readable, but make discovery cards slightly more prominent and less compact than approved.

### 5. Spacing — 3/4

The implementation correctly retains 28px desktop and 18px compact shell gutters, 24px related-grid gutters, breakpoint authorities at 700px/1023px, 44px interactive targets, and consistent section separation.

There are three non-blocking rhythm drifts from the declared scale:

- `.searchForm` uses an 8px control gap where the contract assigns 16px.
- `.searchForm label` uses a 4px label-to-input gap where the contract assigns 8px.
- `.compactPostCard` uses 28px top/32px bottom padding where the contract calls for 24px vertical padding.

These do not cause overflow, crowding, inaccessible targets, or broken hierarchy in the automated viewport evidence, but aligning them would make the implementation match the approved design vocabulary exactly.

### 6. Experience Design — 4/4

The end-to-end experience is coherent and resilient:

- Both header and page search are visibly labelled native `GET` forms with `q`, `type="search"`, and `maxLength=256`.
- Typing causes no request; Enter and pointer activation perform ordinary document navigation.
- Compact navigation removes hidden controls from tab order, supports keyboard opening, and restores toggle focus on Escape.
- Without JavaScript, navigation and search remain visible and usable.
- Search distinguishes empty, no-result, invalid, out-of-range, upstream-error, and populated outcomes without stale or invented content.
- Pagination preserves the accepted normalized query, omits `page=1`, exposes a named navigation landmark, and marks the current page.
- Related success preserves API order while excluding source and duplicate slugs; true zero disappears; failure preserves the article.
- Search is always `noindex, follow`; canonical URLs appear only for supported normalized successful shapes, and `/search` remains outside Sitemap/RSS.
- Browser-visible requests stay on the generated Web origin; internal origins and cloud addresses are not exposed.

## Responsive Assessment

| Width | Implementation | Evidence | Result |
|---|---|---|---|
| 375px mobile | Compact menu, full-width page form, one-column related cards, 18px gutters | Overflow, target height, menu/tab/Escape, Enter submit, no-JS, card wrapping | Passed |
| 768px tablet | Collapsible navigation with embedded form; natural two-column related grid where space permits | Overflow, two columns, pointer submit, tab order, Escape restoration | Passed |
| 1280px desktop | Two-row header with inline search between public links and 管理; two-column related grid | Header order, search placement, 44px controls, two columns, theme/focus | Passed |

The code retains one information order across widths and changes only layout. No device-specific duplicate content or client-only discovery surface was introduced.

## Accessibility Assessment

Passed implementation checks:

- Native `<nav>`, `<form>`, `<button>`, `<article>`, `<time>`, headings, and links are used.
- Both search inputs have visible labels and named search landmarks.
- Pagination is labelled **搜索结果分页** and uses `aria-current="page"`.
- Hidden compact-menu controls receive `tabIndex=-1`; Escape closes the menu and restores focus.
- New focus treatment uses a 2px accent outline with a 4px offset.
- Search inputs, buttons, pagination links, compact taxonomy links, reading links, and recovery/action links have a 44px minimum block target in CSS; the critical discovery targets are measured in Chromium.
- Reduced-motion rules remain in force, and no animated/live-region/type-ahead behavior was added.
- Escaped hostile strings and long taxonomy values are covered without unsafe HTML or document overflow.

No accessibility blocker was identified.

## Findings and Top Fixes

### Blocking findings

None.

### Non-blocking finding 1 — Align compact-card typography with the approved token

**Priority:** P2 polish  
**Evidence:** `.compactPostCard h3` differs from the exact compact-card size and line-height in `07-UI-SPEC.md`.  
**Action:** Change the title rule to `clamp(1.35rem, 3vw, 2rem)` and `line-height: 1.12`, then retain the existing overflow assertions at 375/768/1280.

### Non-blocking finding 2 — Align discovery spacing with the declared scale

**Priority:** P2 polish  
**Evidence:** Search control gap, label gap, and compact-card vertical padding use 8px, 4px, and 28px/32px instead of 16px, 8px, and 24px.  
**Action:** Apply the approved md/sm/lg values and rerun the responsive discovery browser block to confirm no compact-header overflow.

### Non-blocking finding 3 — Strengthen theme evidence with component contrast checks

**Priority:** P3 assurance  
**Evidence:** The current theme test proves switching, foreground/background inequality, and focus visibility, but does not compute contrast for each discovery surface.  
**Action:** Add computed contrast assertions for primary text, muted text, input text/surface, accent button text/background, and selected pagination in light, dark, and system-dark modes.

## Top Fixes

1. Normalize compact-card title typography to the approved discovery token.
2. Normalize search-form and compact-card spacing to the approved 4px-based scale.
3. Expand theme tests from color inequality to component-level contrast evidence.

## Final Assessment

Phase 7 is ready to proceed. The implementation fulfills the actual visitor experience contract and has strong automated coverage for responsive behavior, keyboard access, native/no-JS navigation, honest states, related reading, metadata, and same-origin delivery. The remaining items are explicitly non-blocking visual consistency and assurance improvements.

_generic-agent workaround: core ui-review protocol; typed gsd-ui-auditor unavailable_
