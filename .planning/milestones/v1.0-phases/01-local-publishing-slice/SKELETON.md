# Walking Skeleton — Blog X

**Phase:** 1  
**Generated:** 2026-08-05

## Capability Proven End-to-End

> A seeded single administrator can sign in locally, publish one Markdown article through the browser, and immediately read the persisted article from the public server-rendered home page and permalink.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | `apps/web` on Next.js App Router SSR and `apps/api` on Fastify | Preserves the deployment-separable frontend/API boundary required by the future two-node topology while keeping each process small. |
| Data layer | PostgreSQL + Drizzle ORM, with generated and committed SQL migrations | PostgreSQL is the durable content store; reviewable SQL and a deterministic migration command keep schema changes reproducible. Only `apps/api` imports the database layer. |
| Auth | One seed-created administrator, Argon2id password hash, opaque database-backed session in an HttpOnly/SameSite cookie | Implements D-04 through D-06 without browser tokens, registration, OAuth, or a second identity system. |
| Markdown | Raw Markdown persisted by `apps/api`; one API-owned unified/remark/rehype pipeline sanitizes preview and published HTML and applies bounded Shiki highlighting | Keeps Markdown as the durable source and ensures preview and public output share one security boundary. |
| Deployment target | Local Docker Compose for Phase 1; future Nginx same-origin `/api` proxy after the production freeze is explicitly lifted | Phase 1 must not contact `47.99.80.8`; the browser always uses relative `/api` requests locally and in the future deployment. |
| Directory layout | pnpm workspace containing `apps/web`, `apps/api`, and `packages/contracts` | Shares request/response schemas without allowing `apps/web` to own sessions, content lifecycle, Markdown rendering, migrations, or PostgreSQL access. |

## Stack Touched in Phase 1

- [ ] Project scaffold — pinned pnpm workspace, build/typecheck/test scripts, ignored local secrets
- [ ] Routing — public home/permalink, login, and protected authoring routes
- [ ] Database — a generated migration applied before a real article write and read
- [ ] UI — browser login and publish interaction through relative `/api`
- [ ] Deployment — documented local full-stack start/verify command for web, Fastify, and PostgreSQL

## Phase 1 Execution Slices

| Plan | Wave | Slice | File budget |
|---|---:|---|---:|
| 01-01 | 1 | Package legitimacy gate plus the real browser → relative `/api` → Fastify → PostgreSQL → public SSR tracer | 13 |
| 01-02 | 2 | Deployment-separable pnpm workspace and shared contracts | 12 |
| 01-03 | 3 | Single-administrator session lifecycle and protected access | 11 |
| 01-04 | 4 | Draft metadata, Markdown source editing, and server preview | 13 |
| 01-05 | 5 | Publish/edit/unpublish/soft-delete transitions and costly slug confirmation | 11 |
| 01-06 | 6 | Published-only editorial home and explicit pagination | 13 |
| 01-07 | 7 | Safe technical permalink rendering and uniform public 404 behavior | 10 |
| 01-08 | 8 | Reproducible local startup, interruption/concurrency checks, and whole-phase browser acceptance | 10 |

The tracer intentionally starts with consolidated route modules to stay within a reviewable file budget. Plans 01-02 through 01-07 extract those proven contracts into focused modules without changing the service boundary or replacing the working path.

### Coarse-Granularity Scope Exception

Phase 1 uses the configured coarse granularity. Greenfield vertical slices co-own their contract, implementation, and focused API/browser test pairs, so Plans 01-01 through 01-08 modify 10–13 files each. Every plan remains below the 15-file blocker threshold and below 100,000 estimated tokens; splitting these pairs again would separate a user-observable slice or duplicate its boundary files without reducing architectural risk.

## Out of Scope (Deferred to Later Slices)

- Phase 2: categories, tags, archives, about page, media upload, table of contents, full responsive/theme system, and general error experience
- Phase 3: canonical/OG metadata, robots.txt, Sitemap, RSS/Atom, and content export/migration tooling
- Phase 4: production-rate limiting and broader security hardening, monitoring, backup/restore drills, secure node networking, and the controlled production release gate
- All phases: registration, multiple administrators/roles, OAuth, public password recovery, comments, private posts, payments, Kubernetes, and heavyweight search/microservices

## Subsequent Slice Plan

Each later phase adds a vertical slice without collapsing the `apps/web` → same-origin `/api` → `apps/api` → PostgreSQL boundary:

- Phase 2: Complete Reading Experience
- Phase 3: Distribution and Portability
- Phase 4: Secure Operations and Release Gate

## Invariants

- `apps/web` never imports Drizzle, `pg`, the database schema, session persistence, lifecycle services, or the Markdown renderer.
- Browser code calls relative `/api/*`; no browser bundle depends on either server's public IP.
- `apps/api` is the sole owner of PostgreSQL, administrator sessions, article lifecycle rules, and Markdown render/sanitize behavior.
- Schema SQL is generated, reviewed, committed, then applied through the deterministic migration command before any database-backed acceptance test.
- No Phase 1 command connects to, deploys to, or modifies frozen host `47.99.80.8`.

## Canonical Source Audit

| Source | ID | Required outcome | Owning plans | Status |
|---|---|---|---|---|
| GOAL | — | Local start, administrator login/publish, immediate visitor home/permalink read | 01-01, 01-03..01-08 | COVERED |
| REQ | AUTH-01 | One administrator can authenticate; management remains protected | 01-01, 01-03, 01-08 | COVERED |
| REQ | CONT-01 | Create, edit, preview, publish, unpublish, and delete Markdown | 01-01, 01-04, 01-05, 01-08 | COVERED |
| REQ | CONT-02 | Draft, unpublished, and deleted content stays non-public | 01-05..01-08 | COVERED |
| REQ | CONT-03 | Title, summary, cover, slug, publication time, and SEO description are maintained | 01-04, 01-05 | COVERED |
| REQ | READ-01 | Published-only home metadata and explicit pagination | 01-01, 01-06, 01-08 | COVERED |
| REQ | READ-02 | Safe permalink rendering for required Markdown constructs | 01-01, 01-07, 01-08 | COVERED |
| REQ | OPS-04 | Isolated local web/admin/API/PostgreSQL startup and verification | 01-01, 01-02, 01-08 | COVERED |
| RESEARCH | R-ARCH | `apps/web` Next SSR and `apps/api` Fastify remain deployment-separable; API exclusively owns DB/auth/lifecycle/Markdown | 01-01..01-08 | COVERED |
| RESEARCH | R-MIGRATE | Generated committed SQL is cleanly activated before tracer seed/E2E; concurrency/interruption/retry/parallel acceptance has one owner | 01-01 clean activation; 01-08 sole resilience owner | COVERED |
| RESEARCH | R-SUPPLY | One blocking human package-legitimacy checkpoint precedes install | 01-01 | COVERED |
| RESEARCH | R-SLUG | All retained rows, including soft-deleted rows, reserve their slug | 01-01, 01-04, 01-05 | COVERED |
| RESEARCH | R-SECURITY | Argon2id, opaque sessions, public/admin query split, final-sanitized server Markdown | 01-01, 01-03..01-08 | COVERED |
| CONTEXT | D-01 | Editorial newest-first public home | 01-06 | COVERED |
| CONTEXT | D-02 | Distraction-free Chinese/English technical Markdown rendering | 01-01, 01-07 | COVERED |
| CONTEXT | D-03 | Explicit pagination rather than infinite scroll | 01-06 | COVERED |
| CONTEXT | D-04 | Exactly one administrator; no registration/roles/OAuth/recovery | 01-01, 01-03 | COVERED |
| CONTEXT | D-05 | Password login with secure server-side cookie session | 01-01, 01-03 | COVERED |
| CONTEXT | D-06 | Controlled seed with no plaintext credential in repo/logs | 01-01, 01-03, 01-08 | COVERED |
| CONTEXT | D-07 | Markdown source plus desktop split preview/narrow toggle | 01-04 | COVERED |
| CONTEXT | D-08 | Title-derived editable slug, unique across every retained state | 01-01, 01-04, 01-05 | COVERED |
| CONTEXT | D-09 | Explicit confirmation for a published-slug change | 01-05 | COVERED |
| CONTEXT | D-10 | Recoverable soft delete and no permanent purge | 01-05, 01-07 | COVERED |
| CONTEXT | D-11 | Successful publication is immediately public | 01-01, 01-05, 01-08 | COVERED |
| CONTEXT | D-12 | Non-public content is admin-only and publicly unavailable | 01-04..01-08 | COVERED |
| CONTEXT | D-13 | Publish validation and durable publication/update timestamps | 01-01, 01-05 | COVERED |
