# Project Milestones: Blog X

## v1.2 Publishing Quality (Shipped: 2026-09-05)

**Delivered:** 与可见公开内容一致的安全 `BlogPosting` 结构化数据，以及可预约、改期、取消、并发安全并在到期前严格保密的受控定时发布闭环；生产继续保持 `BLOCKED`。

**Phases completed:** 2 phases, 4 plans, 11 tasks

**Key accomplishments:**

- Published articles now expose one exact, safe seven-field BlogPosting record that is built from reader-visible public facts and stays absent outside a validated article route.
- Separate, attributed UTC schedule authority now survives strict contracts, PostgreSQL migration checks, portable export, and local recovery.
- Draft schedules now use PostgreSQL transaction time, retained-row locks, exact audit evidence, and responsive native admin forms without treating a deadline as public history.
- A local, bounded due publisher now atomically turns eligible retained drafts into public articles while every public reader rejects future publication times at the database boundary.

**Stats:**

- 91 files changed from the v1.1 tag through the verified v1.2 closeout
- 8,474 insertions and 353 deletions; 33,643 TypeScript/TSX/MJS lines in the current application and verification owners
- 2 phases, 4 plans, 11 planned tasks
- 2 local calendar days from initialization to ship (2026-09-04 → 2026-09-05)

**Git range:** `29c96f1` → `03d0e3c`

**What's next:** 由产品负责人选择下一个纯本地里程碑；隐私保护聚合统计是已记录候选，服务器、TLS 与生产调度仍冻结。

---

## v1.1 Content Discovery (Shipped: 2026-09-04)

**Delivered:** 仅公开内容的站内搜索、确定性相关阅读和可复现的固定本地交付链路，全部保持生产发布 `BLOCKED`。

**Phases completed:** 3 phases, 24 plans, 40 tasks

**Key accomplishments:**

- Strict NFC search contracts and a published-only PostgreSQL query with literal wildcard handling, 3/2/1 ranking, and stable pagination
- Public-only related ranking and strict Fastify search/related endpoints with exact opaque failure boundaries
- The exact generated Phase 6 gate passes with interruption and parallel evidence; the fixed local refresh safely stopped before mutation because its offline install cache is missing
- Current-source API and Web targets can be rebuilt from sanitized offline dependency seeds, with the fixed runtime mutation deliberately deferred to the ordered 06-05 execution.
- A clean future revision can perform one bounded `blogxlocal` refresh through a real adapter, while this plan made no live attempt.
- The future local refresh now has one strict fact authority, target-image migration, immutable rollback, safe claims, and reconstructable sanitized evidence without consuming a live attempt.
- Reconstructable evidence v4, terminal revision-bound failure reports, proven local Docker authority and fail-closed atomic publication are ready for the single 06-11 live attempt.
- One fd5ef1b refresh attempt successfully replaced the fixed local API/Web images, preserved persistent content, published committed strict v4 evidence, and remains gated for independent Phase 6 verification.
- A shared native GET form now reaches a strict server-rendered public result through a same-origin, responsive, no-JavaScript-capable path.
- Raw and decoded search requests now fail closed into one exhaustive SSR outcome that drives honest metadata, exact states, compact public cards and stable pagination.
- Strict related reading now follows complete articles with honest zero/failure states, while one responsive discovery surface is proven across mobile, tablet and desktop interaction modes.
- A strict generated-port Chromium gate now proves every Phase 7 search, related-reading, responsive, SEO, privacy and topology contract with bounded exact-child cleanup.
- A sealed local-delivery implementation binds canonical `3100` ownership, clean branch-qualified source, offline target provenance, and a v1.1 evidence contract that can only end in `BLOCKED`.
- Strict Phase 6/7 count records now feed a sealed, zero-argument acceptance coordinator that remains local-only and explicitly BLOCKED.
- The final reviewed implementation is now the healthy canonical `blogxlocal` runtime at fixed port 3100, backed by a verified non-overwriting successor v1.1 receipt and an explicit `BLOCKED` production decision.
- Every clean full Git SHA now owns one immutable receipt and terminal claim authority, with strict independent verification and a regression proving two successive deliveries preserve the first receipt byte-for-byte.
- A frozen 37-file ownership inventory now drives a zero-infrastructure default gate that passes 38/38 Contracts, API and Web tests while retaining all 30 integration files behind the formal acceptance authority.
- Six formerly self-spawning Web journeys now run solely against one generated, scenario-seeded fixture whose ports, database, identities and temporary paths are isolated and cleaned fail-closed.
- One sealed zero-argument coordinator now executes and attests every integration-owned package path exactly once, with actual pass-only counts, digests, generated cleanup proof and an unchanged `BLOCKED` release state.
- A clean dual-reviewed 25-file implementation is now protected by a fixed reviewed-HEAD gate, secure per-revision receipt identity, and full descendant-history auditing before any formal delivery can start.

**What's next:** 规划下一个纯本地里程碑，优先考虑公开文章结构化数据与受控的定时发布。

---

## v1.0 Local MVP (Shipped: 2026-08-15)

**Delivered:** 一套经过独立验收的自托管博客本地 MVP，覆盖写作发布、响应式阅读、媒体与分发、备份恢复和失败关闭的生产发布门禁。

**Phases completed:** 5 phases, 26 plans, 56 tasks

**Key accomplishments:**

- A real Next.js → Fastify → PostgreSQL publishing path now proves administrator login, Markdown publication, SSR home visibility, and safe permalink reading.
- The proven publishing tracer is now split into deployable Web/API packages joined only by strict, wire-safe Zod contracts.
- Fastify now owns a complete opaque-session lifecycle, while Next presents a cookie-only login and protected admin experience without becoming an authorization authority.
- Blog X now has authenticated complete draft persistence and a responsive Markdown editor whose unsaved preview uses the same final-sanitized GFM/Shiki renderer as public reading.
- Blog X now gives the administrator explicit, transactional control over publication while protecting first-publication time, public slugs, and retained source content.
- Blog X now serves a deterministic publication-only API and a responsive editorial SSR homepage with stable, accessible pagination and immediate lifecycle visibility.
- Blog X now renders published technical Markdown through one hardened server pipeline into a focused responsive permalink while every non-public state remains indistinguishable from an unknown slug.
- Generated-secret Docker topology with interruption-safe migrations, strict deployment boundaries, and one Chromium journey proving the complete Phase 1 publishing loop
- Database-enforced categories and tags now organize articles through guarded administration and published-only public discovery.
- A versioned Markdown About singleton and Shanghai-calendar archive now provide safe, published-only reading navigation.
- Published articles now expose durable multilingual heading links and an accessible server-rendered table of contents at every supported viewport.
- Administrators can now upload validated images, insert same-origin Markdown references, and publish responsive article covers without exposing source files or storage paths.
- Every public surface now shares an adaptive editorial navigation and pre-paint theme, while temporary upstream failures can no longer masquerade as missing content.
- Phase 2 now has one local command proving taxonomy, pages, archives, durable ToC, protected media, responsive navigation/theme and honest recovery as a single experience.
- A fail-closed local distribution verifier, a strict publication-only API projection, and safe same-origin RSS now form Phase 3's discovery foundation.
- Every public Blog X route now has complete, strict metadata and public discovery files backed by a managed same-origin browser journey.
- One generated local command now proves all completed publishing, reading, metadata, crawler, and RSS behavior while rejecting topology disclosure, false test evidence, and broad cleanup.
- Administrators can download a strict, lossless logical Markdown manifest through a cookie-authenticated same-origin POST, with binary media deliberately deferred to Phase 4.
- Blog X now has a fail-closed, locally reproducible API security boundary with bounded abuse controls, shared mutation authority, hostile-input durability, and Web-edge-only topology evidence.
- Blog X now has bounded local process operations, atomically complete four-authority backups, and an isolated restore rehearsal proven by database, byte, and same-origin browser equivalence.
- Blog X now ends its complete local v1 regression with a byte-bound, non-deploying release decision that proves local readiness while machine-enforcing that production remains BLOCKED.
- Published images now have one exact `/media/<lowercase-uuid>` authority, while legacy unsafe media remains losslessly reviewable and both fresh and restored browsers prove that no external image is requested.
- Blog X now collects a fresh complete production-format set, encrypts it with bound AES-256-GCM metadata, atomically transfers ciphertext to a verified mounted directory, records a receipt and retention result, and fails closed unless every local authority exists.
- Blog X now uses a non-circular release-evidence v2, a clean-revision Phase 1–5 full gate, and a byte-verified receipt to prove local readiness while retaining a canonical BLOCKED production decision.
- Phase 5 evidence now binds each selected suite to its captured, redacted execution result while the canonical production decision remains BLOCKED.
- Committed fixture controls and deterministic IPC lock regressions now bind a 30-source actual-result receipt to one clean implementation revision, with a later machine-consistent audit and production still BLOCKED.

**What's next:** v1.1 Content Discovery，优先交付站内搜索、相关文章和每个大步骤后的可靠本地展示更新。

---
