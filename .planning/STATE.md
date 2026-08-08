---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 02
current_phase_name: Complete Reading Experience
status: executing
stopped_at: Completed 02-01-PLAN.md
last_updated: "2026-08-08T11:43:41.666Z"
last_activity: 2026-08-08
last_activity_desc: Phase 02 execution started
progress:
  total_phases: 2
  completed_phases: 1
  total_plans: 14
  completed_plans: 9
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-08)

**Core value:** 博主能够可靠地发布和保存 Markdown 内容，访客能够持续、快速地通过博客域名阅读已发布文章。  
**Current focus:** Phase 02 — Complete Reading Experience

## Current Position

Phase: 02 (Complete Reading Experience) — EXECUTING
Plan: 2 of 6
Status: Ready to execute
Last activity: 2026-08-08 — Phase 02 execution started

Progress: [██████░░░░] 64%

## Performance Metrics

**Velocity:**

- Total plans completed: 8
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 8 | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 2d elapsed | 2 tasks | 20 files |
| Phase 01 P02 | 1182min | 2 tasks | 20 files |
| Phase 01 P03 | 34min | 2 tasks | 19 files |
| Phase 01 P04 | 55min | 2 tasks | 22 files |
| Phase 01 P05 | 70min | 2 tasks | 16 files |
| Phase 01 P06 | 568min | 2 tasks | 17 files |
| Phase 01 P07 | 20min | 2 tasks | 12 files |
| Phase 01 P08 | 1h 41m | 2 tasks | 13 files |
| Phase 02 P01 | 0min | 4 tasks | 27 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

- [Initialization]: 主服务器在用户明确解冻前完全禁止连接和修改。
- [Initialization]: 本地替代主服务器，副服务器可承载后端与数据库。
- [Initialization]: P0 进入 v1，P1 功能作为后续增量。
- [Phase 01]: Unsafe browser requests require an exact PUBLIC_ORIGIN. — Avoid trusting spoofable forwarded headers while supporting the Next-to-Fastify proxy boundary.
- [Phase 01]: The tracer E2E uses local port 3100. — Port 3000 belongs to an unrelated user-owned Nuxt process and must not be terminated.
- [Phase 01]: Repeat administrator seeds rotate the stored password hash. — Runtime-random credentials must keep migration and browser verification repeatable without persisting secrets.
- [Phase 01]: Web, API, and wire contracts are separate pnpm packages with dependencies owned at the narrowest deployment boundary. — This preserves independent deployment and prevents the browser package from acquiring PostgreSQL, Drizzle, session, or password internals.
- [Phase 01]: Shared request and response schemas use strict allowlists and are validated by both API and Web consumers. — Rejecting unknown response fields makes accidental disclosure of persistence or authentication internals a tested contract failure.
- [Phase 01]: Fastify owns a single opaque session authority shared by auth and every protected API route. — Decorating the parent Fastify scope avoids plugin-encapsulation gaps and keeps Next redirects presentation-only.
- [Phase 01]: Next forwards only the inbound Cookie header for server-side session checks and stores no token in browser JavaScript storage. — This preserves the HttpOnly boundary and prevents the frontend from becoming a second authentication authority.
- [Phase 01]: Keep raw Markdown as content authority and derive both public and preview HTML through one Fastify renderer. — One server-owned rendering pipeline prevents preview/public drift and keeps unsafe content out of the browser package.
- [Phase 01]: Reserve every retained slug through the unconditional PostgreSQL unique index, including soft-deleted rows. — Permanent reservation preserves old-link meaning and avoids accidental identifier reuse across lifecycle states.
- [Phase 01]: Allow only HTTP(S) cover URLs and exact Shiki-generated presentation attributes through final Markdown sanitization. — The narrow allowlist preserves syntax highlighting while removing executable HTML and dangerous URL protocols.
- [Phase 01]: Lifecycle status changes only through explicit action endpoints under a retained-row lock. — This rejects client-controlled status/deletedAt writes and serializes visibility changes.
- [Phase 01]: Published-slug confirmation binds article identity, current slug, and a monotonic persisted version. — A stale or cross-article confirmation cannot authorize a costly public URL change.
- [Phase 01]: Soft deletion retains Markdown, metadata, publication time, and slug with no permanent purge UI. — Phase 1 deletion stays recoverable and never reassigns an exposed identifier.
- [Phase 01]: Public list count and items share a fixed visibility predicate inside one repeatable-read transaction. — Pagination metadata and cards describe the same publication-only snapshot.
- [Phase 01]: Public pages are one-based, fixed at ten items, and ordered by publication time then UUID descending. — Stable explicit URLs and deterministic ties support accessibility and later SEO.
- [Phase 01]: The homepage fetches the public DTO only from a server-side internal API origin. — The browser receives SSR HTML and never depends on PostgreSQL or a server public IP.
- [Phase 01]: Public detail reuses the invariant published/non-deleted/non-null-publication predicate and exposes no Markdown or admin fields. — One public repository boundary prevents non-public state disclosure.
- [Phase 01]: Preview and permalink share one bounded cached Shiki renderer; unknown fences remain escaped plaintext. — One renderer prevents output drift and bounds highlighter resource use.
- [Phase 01]: Rendered article destinations allow only HTTP(S) and root-relative URLs. — A narrow final sanitizer protocol policy blocks executable and unnecessary schemes.
- [Phase 01]: Canonical verification owns a generated, validated Compose/database namespace and cleans only that namespace. — Interrupted and parallel runs cannot reset or remove another environment.
- [Phase 01]: Concurrent migration activation uses one advisory lock and one fingerprint ledger row. — Retried migrations converge on the existing PostgreSQL volume with auditable schema state.
- [Phase 01]: Whole-phase acceptance mutates content through visible browser controls and same-origin relative `/api` only. — Direct database access is limited to runner-owned postcondition diagnostics.
- [Transition 01→02]: Phase 1 closed with 29/29 UAT checks, canonical verification passed, and 33/33 modeled threats resolved or explicitly accepted.

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 2+] 副服务器系统、端口、历史数据与私网能力尚未只读核验。
- [Phase 2] 图片存储上限、允许格式及本地开发存储策略需要在媒体方案中确定。
- [Later] 评论、统计深度、私密内容和精确 RPO/RTO 延后决策，不阻塞 v1。

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| v2 | 搜索、相关文章、自动保存、定时发布、审计、统计 | Deferred | Initialization |

## Session Continuity

Last session: 2026-08-08T11:43:41.660Z
Stopped at: Completed 02-01-PLAN.md
Resume file: None
