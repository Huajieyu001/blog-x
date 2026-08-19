---
phase: 02
slug: complete-reading-experience
status: approved
shadcn_initialized: false
preset: none
created: 2026-08-08
---

# Phase 02 — UI Design Contract

> Visual and interaction contract for READ-03..07, TAXO-01 and MEDIA-01. Preserve the Phase 1 quiet editorial character: content before controls, paper-like surfaces, fine rules, no dashboard density, no new app shell or external component library.

## Design System

| Property | Value |
|---|---|
| Tool | none — CSS Modules plus existing React/Next components |
| Preset | not applicable |
| Component library | none |
| Icon library | none; use text labels and CSS-only chevrons where necessary |
| Font | `ui-serif, Georgia, "Noto Serif SC", serif` for reading; `ui-sans-serif, system-ui, sans-serif` for controls; `ui-monospace` for metadata/code |

Use Next App Router `Link` for internal navigation. The root layout remains the single owner of `<html>`/`<body>`; a small pre-paint theme bootstrap is allowed there. Per installed Next 16 documentation, use a root `not-found.tsx` for actual absence and client `error.tsx` boundaries for recoverable exceptions; do not enable experimental global 404 for this one-root-layout application.

## Spacing Scale

All new spacing uses this 4px scale; existing 18/22/28px values may be normalized only where a touched component makes it practical.

| Token | Value | Usage |
|---|---:|---|
| xs | 4px | inline icon/label gap, heading anchor offset adjustment |
| sm | 8px | tag gaps, compact form/status spacing |
| md | 16px | card metadata, field spacing, menu rows |
| lg | 24px | header/page horizontal padding, section borders |
| xl | 32px | card/list block gap, ToC/reading-column gap |
| 2xl | 48px | major section separation |
| 3xl | 64px | article and page vertical breathing room |

Exceptions: existing fluid hero/article padding (`clamp`) remains intentional to preserve Phase 1’s editorial scale.

## Typography

| Role | Size | Weight | Line Height |
|---|---:|---:|---:|
| Reading body | 16px mobile / 18px desktop | 400 | 1.82 mobile / 1.9 desktop |
| UI label/meta | 12px | 600 | 1.4 |
| Section heading | 24px mobile / 32px desktop | 500 | 1.2 |
| Article H2 / H3 | 28px / 22px desktop; clamp down on mobile | 500 | 1.25 |
| Page display | existing `clamp(4rem,10vw,8.5rem)` | 500 | .82 |
| Button/navigation | 13px | 600 | 1.4 |

Chinese and Latin text must wrap naturally (`overflow-wrap:anywhere` only for uncontrolled identifiers/URLs); do not all-caps Chinese labels. Long category/tag names truncate only in compact controls with full text in `title`/accessible name; reading-page labels always wrap.

## Color and Theme Tokens

Tokens live at `html`/public shell scope, not duplicated per page. Default honors OS preference before JavaScript; resolved explicit preference is `html[data-theme="light"]` or `html[data-theme="dark"]`.

| Role | Light | Dark | Usage |
|---|---|---|---|
| Dominant (60%) | `#f7f3eb` | `#171916` | page background/paper |
| Secondary (30%) | `#fffdf8` | `#20231f` | panels, menus, inputs |
| Ink | `#191b1a` | `#eeede6` | primary text/rules |
| Muted | `#6b6d68` | `#b7b9b1` | metadata/supporting text |
| Line | `#d8d3c8` | `#43473f` | dividers/borders |
| Accent (10%) | `#2d5e52` | `#91c7b7` | active nav, links, focus, publication marker |
| Destructive | `#a1261d` | `#ff9b91` | destructive admin action/error only |

Accent is reserved for links on interaction, active/current navigation, keyboard focus, selected theme, ToC current section and success marker—not full button backgrounds or decorative blocks. All normal text/background pairs must meet WCAG AA contrast; focus outline is a 2px accent ring with 4px offset in both themes.

## Responsive Layout Contract

| Viewport | Range | Required layout |
|---|---|---|
| Mobile | 0–699px; validate 375px | 18px public horizontal padding; header brand plus menu/theme controls; navigation is an expandable vertical menu; article/ToC single column; ToC is closed native details by default; metadata and taxonomy chips wrap; touch controls ≥44×44px. |
| Tablet | 700–1023px; validate 768px | 28px horizontal padding; public nav may be inline if it fits, otherwise same accessible menu; article stays single column; ToC remains above article body; taxonomy lists use two columns only when cards retain ≥260px width. |
| Desktop | ≥1024px; validate 1280px | max content width 1120px; article reading column max 760px plus a 220px sticky ToC with 32px gap; public header has all five links inline; taxonomy/admin split panels may use two columns. |

No horizontal page scroll at any width. Code/table overflow remains local to its own scroll container. Sticky ToC never overlaps the header; it starts below a 24px top offset and becomes normal-flow if viewport height is too short.

## Public Navigation and Page Contracts

### Shared header

Selector contract: `[data-testid="public-header"]`, `[data-testid="public-nav"]`, `[data-testid="theme-toggle"]`, `[data-testid="mobile-menu-toggle"]`.

- Brand `Blog X` returns home. Primary links in this exact order: `文章` `/`, `分类` `/categories`, `标签` `/tags`, `归档` `/archives`, `关于` `/about`; `管理` remains a subdued secondary link.
- Desktop: inline links, current page has `aria-current="page"`, accent text/1px underline. Mobile: menu button names its state (`打开站点导航` / `关闭站点导航`), has `aria-expanded` and `aria-controls`; Escape closes it and returns focus to trigger; tab order does not enter closed links.
- Theme control is visible in both layouts, label `切换主题`; it offers `浅色`、`深色`、`跟随系统` as an accessible radio/menu group. It does not displace navigation or require hover.

### Discovery lists

- Category and tag index: title respectively `分类`/`标签`; each public term row exposes name plus published article count and links to its paginated list. No public terms state uses documented empty copy below; empty admin terms are not shown here.
- Category/tag detail: eyebrow `分类` or `标签`, H1 term name, count and the existing 10-item page-aware `PostCard` list. Pagination keeps its filter (`/categories/<slug>?page=N`, equivalent tags). Cards render category as a single text link if present and tag links as wrapping chip-like inline links; metadata never dominates title/summary. An unknown category/tag slug is a real 404 using `没有找到这个页面` / `它可能已被移动，或尚未发布。` / `返回首页`; a valid existing term with zero currently public posts instead renders the normal public empty-list copy, never 404.
- Archive: H1 `归档`, newest year expanded, older years collapsed with native `<details>`; month headings display `YYYY 年 M 月` and chronological post links. No infinite scrolling.
- About: H1 comes from published About content; rendered Markdown uses same article reading styles but no empty ToC/sidebar. Unpublished/missing About goes to the real 404 contract, never leaks draft status.

### Article and ToC

Selectors: `[data-testid="article-toc"]`, `[data-testid="toc-link"]`, `[data-testid="article-body"]`.

- Article header displays category (if any) then tags as navigable metadata before title, summary and date. Cover derivative is responsive, constrained to reading width, carries purposeful alt text from the stored media choice (empty alt only if decorative), and reserves its recorded aspect ratio.
- ToC includes only h2/h3, generated server-side. Desktop uses `<nav aria-label="文章目录">`; mobile/tablet uses `<details data-testid="article-toc"><summary>文章目录</summary>…</details>`. No qualifying headings: render neither summary nor empty region.
- Each link is a normal hash link and works without JS. Its target receives `scroll-margin-top:24px`; keyboard focus remains visible. Progressive enhancement may set `aria-current="location"` for one current link but must not change IDs or block navigation.

## Administrator Taxonomy, About and Media Contract

- Taxonomy management is a compact admin section, not a new dashboard: `分类` and `标签` tabs/sections, an always-visible “新建分类/新建标签” form, name/slug inputs, explicit save/cancel, and a table/list showing name, slug and `关联文章 N 篇`. Every row has a labelled `编辑` button (`data-testid="taxonomy-edit-<id>"`). Activating it opens the same form in edit mode with that term’s current name/slug prefilled, heading `编辑分类` or `编辑标签`, and `保存更改`/`取消编辑` actions. Save validates name/slug via the shared contract, retains typed values and announces `分类已更新。` or `标签已更新。` in `[data-testid="taxonomy-status"]`; field failure announces `请修正标记的字段。` and uses `aria-invalid`/`aria-describedby`; API/conflict failure announces `保存失败，请重试。`. Cancel restores the row unchanged and returns focus to the row’s original edit trigger. Successful save updates the row without a full-page reload and also returns focus to that trigger.
- A term with associations has disabled-looking delete affordance plus explanatory text `请先移除或重新分配关联文章，才能删除。`; server conflict leaves values intact and announces the same message in a `role="status"` region. Never offer bulk deletion.
- Article editor metadata adds one category select (`未分类` first) and tag multiselect/search-free checkbox list. Long values wrap; controls have explicit labels and client field errors use `aria-describedby`/`aria-invalid`.
- About editor reuses current split Markdown preview/editor with status `草稿`/`已发布`; public preview/open commands are standard links, no rich-text editor.
- Media panel in the article editor has a labelled file input `上传图片（JPEG、PNG 或 WebP，最大 5 MiB）`, `accept="image/jpeg,image/png,image/webp"` as a convenience only, selected filename, and a labelled alt-text input `图片替代文本` (`data-testid="media-alt-text"`). Its default is blank but a non-decorative upload cannot be inserted or selected as a cover until its trimmed alt text is non-empty; error is `请填写图片替代文本，或明确标记为装饰图片。`. The explicit opt-in checkbox `这是装饰图片` sets `decorative: true`, disables/clears the alt input, and persists an empty alt only for that choice. Upload success DTO and persisted media/cover reference contain `id`, same-origin URL, intrinsic width/height, `alt`, and `decorative`; storage details never reach the UI. The derived-image thumbnail uses the chosen alt (or `alt=""` when decorative), and `插入 Markdown` adds `![<alt>](/media/<id>)` at cursor (or `![](/media/<id>)` only when decorative) without replacing unsaved source. `设为封面` persists the same alt/decorative selection with the cover reference. The panel provides upload progress/status plus `插入 Markdown` and `设为封面` actions; the server remains the authority for file validation. On success, focus moves to status `图片已上传，可插入文章。`. No delete UI.

## Copywriting Contract

| Element/state | Exact copy |
|---|---|
| Public empty list | `这一页还没有文章` / `可以返回最新文章继续阅读。` / `返回最新文章` |
| Empty category/tag index | `暂时没有可公开浏览的分类或标签` / `发布文章后，内容组织会显示在这里。` |
| Empty archive | `还没有可归档的文章` / `发布文章后会按时间显示在这里。` |
| Published About absent (404) | `没有找到这个页面` / `它可能已被移动，或尚未发布。` / `返回首页` |
| Service unavailable | `暂时无法加载内容` / `服务似乎暂时不可用，请重试或返回首页。` / `重试` / `返回首页` |
| Invalid page query | `页码无效` / `请使用大于零的整数页码。` / `返回最新文章` |
| Upload idle | `上传图片（JPEG、PNG 或 WebP，最大 5 MiB）` |
| Uploading | `图片上传中…` |
| Upload validation failure | `图片未上传：请选择不超过 5 MiB 的 JPEG、PNG 或 WebP 图片。` |
| Upload processing/network failure | `图片暂时无法处理，请检查文件后重试。` |
| Upload success | `图片已上传，可插入文章。` |
| Missing non-decorative alt text | `请填写图片替代文本，或明确标记为装饰图片。` |
| Taxonomy delete conflict | `请先移除或重新分配关联文章，才能删除。` |
| Taxonomy edit success | `分类已更新。` / `标签已更新。` |
| Taxonomy edit validation | `请修正标记的字段。` |
| Taxonomy edit request failure | `保存失败，请重试。` |
| Theme control | `主题：浅色` / `主题：深色` / `主题：跟随系统` |

Errors never echo API internals, filenames/paths, session state or exception details.

## UI Considerations

The GSD UI probe found 46 applicable element/category pairs across seven named surfaces. Auto resolution closed all 46 with no unresolved item; the equivalent checks are consolidated below into 10 explicit coverage groups and 3 visual backstops without dropping a probe category.

| Category | Element(s) | Status | Resolution / Reason |
|---|---|---|---|
| empty | public term/archive/post lists | ✅ covered | Exact heading/body/action are locked in Copywriting Contract. |
| empty | ToC | ✅ covered | No headings means no ToC region/control is rendered. |
| loading | upload and retry UI | ✅ covered | `图片上传中…` disables duplicate upload/insert; retry boundary exposes `重试`. |
| error | 404 vs upstream | ✅ covered | Unknown taxonomy/page/article API 404 renders not-found; valid empty lists retain empty copy; fetch/5xx/schema failure renders service-unavailable with retry/home. |
| zero-one-many | category/tag chips and counts | ✅ covered | Null category omitted; 0 tags omit group; chips wrap at all widths. |
| overflow | code/tables, long slugs/names | ✅ covered | Local horizontal scroll for code/table; identifiers wrap or compact-control truncates with accessible full name. |
| partial | media upload failure after selection | ✅ covered | Source remains in editor; failed asset never inserts a URL; alt/decorative choice remains editable. |
| long-text | CJK/Latin titles, summaries, About | 🧪 backstop | Visual viewport tests include 120-character title and mixed CJK/Latin content. |
| focus | mobile menu/theme/details | ✅ covered | Keyboard sequence, Escape/focus return, native details and visible focus are E2E assertions. |
| theme | first paint and preference | ✅ covered | Pre-paint bootstrap applies stored valid choice before visible shell; OS fallback works without JS. |
| responsive | 375/768/1280 content density | 🧪 backstop | Screenshot/Playwright visual checks assert no clipping, overlap or missing actions. |
| media | unusual dimensions/orientation | 🧪 backstop | Browser check asserts derived image renders within reading width without layout shift. |

## Accessibility and Interaction Gates

- All actionable controls have a programmatic name; semantic `<nav>`, `<main>`, `<article>`, heading hierarchy and `<time>` remain intact.
- Interactive targets are at least 44×44px on mobile (pagination numbers may retain 36px visual circle only inside a 44px hit area). No hover-only action.
- `:focus-visible` 2px outline applies to every link, button, summary, select, input and ToC link; color alone never conveys current/invalid status.
- Announce asynchronous admin/upload states through one `role="status" aria-live="polite"`; field failures use `role="alert"` only for an immediate blocked action.
- Menu, theme group, native details and upload flow must operate using keyboard alone; tab order follows visible order. Respect `prefers-reduced-motion`; navigation/menu/theme changes do not require animation.
- Do not inject untrusted HTML outside the existing server-sanitized `ArticleBody`/preview boundary.

## Visual and E2E Acceptance States

| Scenario | Selector / expected state |
|---|---|
| Desktop article with ToC | `[data-testid=article-toc]` visible/sticky; h2/h3 links jump to matching IDs; one optional `aria-current=location`; article remains ≥0-width. |
| Article without h2/h3 | `[data-testid=article-toc]` absent, no blank sidebar/gap. |
| Category/tag discovery | `[data-testid=public-header]` links work; `PostCard` shows category/tag links; filtered pagination preserves path/query; unknown `/categories/:slug` and `/tags/:slug` show 404 copy, while valid zero-public-post term shows public empty-list copy. |
| Archive/About | newest archive group open; About uses reading typography and published content only. |
| Mobile 375px | menu closed initially; trigger opens keyboard-operable nav; every public link/theme control is reachable; no horizontal body scroll. |
| Tablet 768px | all page actions remain visible; ToC precedes body; card and chips do not overlap. |
| Theme persistence/no flash | set dark/light/system, reload and inspect `html[data-theme]` before first content screenshot; system fallback has readable colors with JS disabled. |
| 404 | unknown route/unknown published slug shows documented 404 and `返回首页`, never availability copy. |
| Service failure | Playwright launcher injects a test-only `INTERNAL_API_ORIGIN` pointing Web SSR at a controlled local Fastify fixture/proxy that returns 500 (or refuses the connection) for a named public route. This configuration exists only in the launcher process/environment—never as a production endpoint or user-reachable test route. The rendered `[data-testid="service-unavailable"]` contains exactly `暂时无法加载内容`, a `重试` button and `返回首页`; it must not contain `没有找到这个页面`, public empty copy or internal error text. |
| Media upload | valid JPEG/PNG/WebP produces same-origin `/media/<id>` thumbnail with supplied alt, insert action writes `![alt](/media/<id>)`; explicit decorative choice alone permits `![](...)`. Missing alt blocks both insert/cover selection with exact copy; invalid/oversize input shows exact copy and no inserted URL. |
| Taxonomy edit | Click `[data-testid="taxonomy-edit-<id>"]`; form inputs are prefilled; alter slug/name then save and assert row/status update plus focus return. Cancel leaves original row values and restores focus. Contract/API error asserts `请修正标记的字段。` or `保存失败，请重试。`. |
| Admin taxonomy conflict | associated delete presents documented constraint, retained item/list count remains visible. |

Use existing Playwright’s one-worker isolated run plus component/API tests; screenshots at 375×812, 768×1024 and 1280×900 are visual backstops, not replacements for semantic assertions.

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|---|---|---|
| shadcn official | none | not required |
| third-party UI registry | none | not required |

No icon pack, theme framework, dashboard kit, client Markdown/ToC parser, CDN or image-widget library is authorized by this UI specification.

## Checker Sign-Off

- [x] Dimension 1 Copywriting: locked exact Chinese state/action copy
- [x] Dimension 2 Visuals: editorial layout, responsive behavior and selector-level acceptance defined
- [x] Dimension 3 Color: measurable light/dark semantic tokens and accent rules defined
- [x] Dimension 4 Typography: reading/UI hierarchy, wrapping and scale defined
- [x] Dimension 5 Spacing: 4px scale, page padding and breakpoint layouts defined
- [x] Dimension 6 Registry Safety: no external UI registry/component dependency introduced

**Approval:** ready for plan-phase review
