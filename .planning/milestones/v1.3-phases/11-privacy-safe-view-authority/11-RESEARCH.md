# Phase 11: Privacy-Safe View Authority - Research

**Researched:** 2026-09-05  
**Domain:** Anonymous, database-authoritative article PV aggregation  
**Confidence:** HIGH for in-repository integration; MEDIUM for browser delivery behavior pending implementation verification.

## User Constraints

- [VERIFIED: .planning/REQUIREMENTS.md] Implement `STAT-01`, `STAT-02`, `STAT-03`, `STAT-04`, and `STAT-06`; Phase 11 does not deliver the administrator dashboard (`STAT-05`).
- [VERIFIED: .planning/REQUIREMENTS.md] Persist only article/day/total and `direct|internal|search|social|external` counters, using the `Asia/Shanghai` calendar; daily detail retention is 400 days.
- [VERIFIED: .planning/REQUIREMENTS.md] Do not persist raw events, IP, raw User-Agent, Referrer URL, cookie, session, fingerprint, or a persistent visitor identifier; do not claim UV, anti-fraud accuracy, geography, or billing accuracy.
- [VERIFIED: .planning/REQUIREMENTS.md] The anonymous POST is same-origin, small-body, credential-free, no-store, strictly bounded, and must not reuse administrator CSRF semantics or expose article state.
- [VERIFIED: .planning/REQUIREMENTS.md] No queue, resident analytics process, third-party analytics, heavy chart library, server access, production deployment, `main` mutation, or destructive command is in scope.
- [VERIFIED: AGENTS.md] All development and verification stay local; production remains frozen and release authority remains `BLOCKED`.

## Project Constraints (from AGENTS.md)

- Do not connect to, deploy to, or modify the frozen primary server `47.99.80.8`. [VERIFIED: AGENTS.md]
- Keep database credentials and all secrets out of the repository; database access must not be publicly exposed. [VERIFIED: AGENTS.md]
- Preserve export, backup, and restoration verification because content is a long-lived asset. [VERIFIED: AGENTS.md]
- Keep browser access through the single same-domain entry path and target low-resource deployment. [VERIFIED: AGENTS.md]
- Start file-changing work through GSD; this research is a Phase 11 GSD artifact. [VERIFIED: AGENTS.md]

<phase_requirements>
## Phase Requirements

| ID | Description | Research support |
|---|---|---|
| STAT-01 | Count actual public article opens without making non-public articles detectable. | Strict public predicate plus opaque beacon outcome. |
| STAT-02 | Persist only anonymous daily aggregates. | Narrow table shape, no event table, and explicit static privacy checks. |
| STAT-03 | Preserve counters under concurrency and fail closed under load. | PostgreSQL upsert/transaction, bounded ephemeral limiter, prefetch/bot rejection. |
| STAT-04 | Retain 400 days using a repeatable bounded local cleanup command. | Database-date cutoff, validated limit, deterministic delete result. |
| STAT-06 | Full backup restores aggregates; portable Markdown export excludes them. | Extend database-restore authority, intentionally leave portable export schema v1 unchanged. |
</phase_requirements>

## Summary

Use the existing Fastify + Drizzle + PostgreSQL boundary, with no new package. Add one aggregate table keyed by article ID and Shanghai calendar day. Each accepted request performs a single database-authoritative upsert that increments both `total_pv` and exactly one source bucket. This provides correct concurrent accumulation without a raw-event table. [VERIFIED: apps/api/src/app.ts:90-93; apps/api/src/db/schema.ts:1-2]

The public endpoint must use the existing `publicPredicate`, not a copied visibility condition. Its explicit values are: `"published"`, `deletedAt IS NULL`, `publishedAt IS NOT NULL`, and `publishedAt <= CURRENT_TIMESTAMP`. This is the established public-read authority and already protects scheduled/future rows. [VERIFIED: apps/api/src/content/public-repository.ts:17-24 — `eq(schema.articles.status, "published")`, `isNull(schema.articles.deletedAt)`, `isNotNull(schema.articles.publishedAt)`, `lte(schema.articles.publishedAt, sql\`CURRENT_TIMESTAMP\`)`]

**Primary recommendation:** add a dedicated anonymous beacon route and aggregate repository, route it through the same public predicate, protect it with a separate bounded in-memory limiter keyed only by the transient socket address, and return the same empty `204`/`no-store` outcome for accepted, ignored, unknown, and non-public requests.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Invisible page-open beacon | Browser / Client | Frontend Server | Client fires only after article render; it sends no identifier or content data. |
| Public eligibility and source classification | API / Backend | Database | The API receives untrusted headers and must never disclose visibility. |
| Atomic counter persistence/day calculation | Database / Storage | API / Backend | One statement/transaction makes the database the concurrency and time authority. |
| Abuse bounding and crawler/prefetch filtering | API / Backend | Browser / Client | Server fails closed; client avoids accidental duplicate lifecycle triggers. |
| Retention and restore evidence | Database / Storage | Local operations scripts | Aggregates live in complete database backup, not portable Markdown export. |

## Standard Stack

| Component | Existing version | Use in Phase 11 | Evidence |
|---|---:|---|---|
| PostgreSQL via `pg` | `8.22.0` | Aggregate table, atomic upsert, cleanup query, database restoration. | [VERIFIED: apps/api/package.json:17-26] |
| Drizzle ORM | `0.45.2` | Schema definition, typed selection, transaction boundary; use `sql` for the atomic upsert. | [VERIFIED: apps/api/package.json:17-26; apps/api/src/db/schema.ts:1-2] |
| Fastify | `5.11.2` | Small-body anonymous endpoint and opaque reply. | [VERIFIED: apps/api/package.json:17-26] |
| Next.js / React | `16.3.0` / `19.2.8` | A minimal client-only beacon component mounted only on public article detail. | [VERIFIED: apps/web/package.json:12-17] |
| Existing `BoundedRateLimitStore` | in-repo | Short-lived, capacity-bounded overload guard; do not persist limiter entries. | [VERIFIED: apps/api/src/security/rate-limiter.ts:19-55] |

**Installation:** none. No external package is warranted or permitted for this phase.

## Package Legitimacy Audit

No package installation is planned, so the package-legitimacy gate is not applicable.

## Architecture Patterns

### System Architecture Diagram

```text
Published article page mounts
        |
        v
credential-free same-origin POST (small JSON: slug only)
        |
        v
Fastify anonymous route
  |-- malformed/prefetch/recognised-bot/capacity exhausted --> opaque 204 + no-store
  |-- otherwise --> strict publicPredicate lookup + transaction
                           |-- not public/unknown --> opaque 204 + no-store
                           `-- public --> Shanghai-day aggregate UPSERT --> opaque 204 + no-store

Aggregate table --> full PostgreSQL backup/restore equality check
Portable Markdown export --> remains v1 and intentionally has no aggregate fields
```

### Recommended Component Responsibilities

| Area | Planned responsibility |
|---|---|
| `apps/api/src/db/schema.ts` + one generated migration | Define aggregate table, bounded counters, five source fields, unique `(article_id, day)` authority, index for cleanup. |
| `apps/api/src/content/view-aggregation-repository.ts` | Reuse `publicPredicate`; classify only to the fixed five categories; execute atomic upsert and cleanup. |
| `apps/api/src/routes/public-views.ts` | Validate tiny body, reject prefetch/crawler signals ephemerally, run separate anonymous rate policy, emit opaque no-store response. |
| `apps/api/src/app.ts` | Construct/register repository and route; extend schema/runtime config only with analytics-specific limits. |
| `apps/web/app/posts/[slug]/...` | Mount a nonvisual client beacon after a real article page is available; client uses `credentials: "omit"` and cache-bypassing request semantics. |
| `scripts/...` + API tests | Add cleanup command and prove migration, retention, backup restore, portable-export exclusion, contracts, and browser behavior. |

### Pattern 1: Reuse the strict public projection

**What:** resolve the slug under `publicPredicate` inside the write transaction, then use the resolved article ID; never count from a client-provided ID and never branch response status by visibility.

**Why:** `findDetailBySlug` already returns `null` when its strict projection has no matching row. [VERIFIED: apps/api/src/content/public-repository.ts:284-295]

**Plan rule:** export `publicPredicate` only as the shared expression; do not create a weaker analytics-specific predicate.

### Pattern 2: Database-calendar atomic aggregate

**What:** calculate the day in PostgreSQL with `CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai'`, insert one `(article_id, day)` row, and on conflict increment `total_pv` plus the selected bucket in the same SQL statement.

**Why:** existing code treats PostgreSQL time as shared process authority, including future-publication protection. [VERIFIED: apps/api/src/content/public-repository.ts:21-24]

**Plan rule:** the upsert must reject/rollback if a database check cannot preserve `total_pv = direct_pv + internal_pv + search_pv + social_pv + external_pv`; do not read-modify-write in JavaScript.

### Pattern 3: Separate anonymous guard

**What:** use a dedicated policy and a fresh `BoundedRateLimitStore` scope for this endpoint, not `requireAdministratorMutation`.

**Why:** the existing administrator guard requires session, exact `Origin`, and a key including `administratorId`; its values are `"administrator-mutation"` and `request.ip`. [VERIFIED: apps/api/src/security/mutation-guard.ts:59-76 — `createRateLimitKey("administrator-mutation", request.ip, administratorId)`]

**Plan rule:** retain only a short-lived in-memory key derived from request socket address; never log/store it in analytics rows, audit events, or response payloads. Capacity exhaustion already fails closed in the existing store. [VERIFIED: apps/api/src/security/rate-limiter.ts:41-46]

### Pattern 4: Portable export stays content-only

**What:** do not add aggregates to `PortableExportManifest` or its version-1 JSON; add an explicit test that the portable export contains no analytics table/field/value.

**Why:** export currently selects only articles, categories, tags, article tags, public media metadata, and About. [VERIFIED: apps/api/src/content/export-repository.ts:18-55]

**Plan rule:** full database backup is the restore authority for aggregates; portable Markdown export remains backward compatible.

## Data Model and API Contract

Recommended aggregate columns:

```text
article_id UUID NOT NULL REFERENCES articles(id) ON DELETE RESTRICT
day DATE NOT NULL
total_pv INTEGER NOT NULL DEFAULT 0
direct_pv INTEGER NOT NULL DEFAULT 0
internal_pv INTEGER NOT NULL DEFAULT 0
search_pv INTEGER NOT NULL DEFAULT 0
social_pv INTEGER NOT NULL DEFAULT 0
external_pv INTEGER NOT NULL DEFAULT 0
PRIMARY/UNIQUE (article_id, day)
CHECK every counter >= 0
CHECK total_pv = direct_pv + internal_pv + search_pv + social_pv + external_pv
```

This skeleton is a Phase 11 recommendation [ASSUMED]; the planner must generate the Drizzle schema and SQL migration together, then enforce drift verification. Existing migration execution serializes all SQL files under advisory lock `hashtext('blog-x-phase1-migration')` and ignores only already-exists codes `"42P07"`, `"42701"`, and `"42710"`. [VERIFIED: apps/api/src/app.ts:231-253]

Recommended route contract [ASSUMED]: `POST /public/articles/:slug/view`, `bodyLimit: 256`, body schema exactly `{}` (slug from path), all outcomes `204`, headers `cache-control: no-store`, and no JSON result. The browser uses a same-origin relative URL with `credentials: "omit"`; no referrer URL is copied into payload or persistence.

Source classification [ASSUMED]: inspect `Referer` only in memory; no/referrer-parsing failure is `direct`, equal normalized public origin is `internal`, a conservative fixed hostname allowlist maps to `search`/`social`, all other absolute HTTP(S) origins map to `external`. Do not store host, URL, or parser error.

## Don't Hand-Roll

| Problem | Do not build | Use instead | Why |
|---|---|---|---|
| Concurrent counters | JavaScript read/add/write | PostgreSQL unique-key upsert with arithmetic expressions | Prevents lost updates under parallel requests. |
| Request bounding | Database rows or durable visitor throttles | Existing timer-free `BoundedRateLimitStore` with a dedicated scope | Keeps abuse protection bounded and non-identifying. |
| Visibility | Analytics-only status checks | Existing shared `publicPredicate` | Keeps future/draft/deleted behavior aligned with public reading. |
| Data recovery | New analytics export format | Existing complete database backup/restore flow | Preserves portable-export compatibility and recovery authority. |

## Common Pitfalls

1. **Leaking publication state:** a `404`, `400`, or distinct JSON error on the beacon makes non-public slugs probeable. Return the same opaque `204` for every non-success path after syntactic route matching. [ASSUMED]
2. **Accidental identity persistence:** do not add request headers, request IP, `referer`, UA, a token, or a session field to schema, audit metadata, debug output, fixtures, or tests. `audit_events` is explicitly separate from analytics by milestone constraint. [VERIFIED: .planning/REQUIREMENTS.md]
3. **Counter drift:** incrementing only one bucket or executing independent statements violates invariant; test high parallelism and a forced transaction failure. [ASSUMED]
4. **Timezone drift:** JavaScript/local-machine day calculation risks a different day around midnight; derive the date in PostgreSQL. [ASSUMED]
5. **Prefetch inflation:** detect known prefetch-purpose headers and obvious crawler UA only in request memory; do not promise complete bot prevention. [ASSUMED]
6. **Unbounded deletion:** cleanup must delete only precomputed expired rows with a strict maximum per invocation, repeat to convergence, and report only count/day boundary. [ASSUMED]
7. **Breaking v1 export:** adding analytics to the current v1 manifest invalidates the explicit content-portability promise. Existing schema tests prove optional additions are handled deliberately. [VERIFIED: apps/api/test/distribution-export.test.ts:109-119]

## Validation Architecture

Nyquist is disabled in `.planning/config.json`, but Phase 11 requires these explicit layers.

| Layer | Required proof | Fast command / owner |
|---|---|---|
| Fast/unit | Source classifier, prefetch/crawler predicate, opaque route response, request policy, SQL builder/contract, no identity fields. | Add focused `node --test`/`tsx --test` files and include them in the guarded test inventory. |
| DB integration | Migrated disposable PostgreSQL accepts valid public PV, rejects non-public/future/unknown, proves concurrent totals equal bucket sum, and fails closed at limiter capacity. | Extend local verification generated integration runner. |
| Migration/schema | Fresh migration plus repeated migration safely converge; Drizzle generation check is clean. | `pnpm db:generate:check`, `pnpm db:schema:verify`. [VERIFIED: package.json:15-23] |
| Retention | Seed day 401+ days old and boundary days; cleanup is bounded, repeatable, idempotent at convergence, and never deletes retained/day-current data. | Dedicated cleanup test plus generated DB integration. |
| Security/privacy | Static repository scan proves no raw-event table and no persisted IP/UA/referrer/cookie/session/fingerprint fields; route does not invoke admin mutation guard/audit. | New focused source-contract test. |
| Backup/restore | A full backup/restore compares aggregate rows separately and exactly, alongside existing portable authority check. | Extend `apps/api/test/backup-restore.test.ts`; current test compares portable content authority and media bytes. [VERIFIED: apps/api/test/backup-restore.test.ts:26-64] |
| Portable compatibility | Existing portable-export test stays v1-compatible and asserts analytics absence. | Extend `apps/api/test/distribution-export.test.ts`. [VERIFIED: apps/api/test/distribution-export.test.ts:96-119] |
| Browser | Published article sends exactly one credential-omitted anonymous beacon; draft/unpublished/future pages produce no count; request receives no visible UI or error. | Add Playwright coverage to public-reading/local delivery selection. |
| Local delivery | Each complete plan runs refresh/health against fixed `127.0.0.1:3100`; receipt remains production `BLOCKED`. | `pnpm local:deliver` and the expanded local delivery acceptance command. [VERIFIED: scripts/local-delivery-acceptance.mjs:303-320] |

## Security Domain

| ASVS category | Applies | Phase control |
|---|---|---|
| V3 Session Management | Yes | Beacon is credential-omitted and does not query/emit session identity. |
| V4 Access Control | Yes | Only public-projection articles can be counted; aggregate reads remain deferred to authenticated Phase 12. |
| V5 Input Validation | Yes | Strict path/body/header parsing, tiny body limit, fixed enum source category, opaque malformed outcome. |
| V8 Data Protection | Yes | Persist aggregate counters only; do not retain request identifiers or raw headers. |
| V13 API Security | Yes | Same-origin route, no-store replies, capacity-bounded fail-closed limiter, no state oracle. |

## Assumptions Log

| # | Claim | Risk if wrong |
|---|---|---|
| A1 | `POST /public/articles/:slug/view` with an empty body is the least-leaky public contract. | Route naming may need alignment with existing proxy conventions. |
| A2 | `204` for accepted and ignored beacons is suitable for opaque failure behavior. | Browser/integration assertions may require Fastify reply adjustment. |
| A3 | PostgreSQL `AT TIME ZONE 'Asia/Shanghai'` plus upsert is implemented via Drizzle `sql` rather than a new package. | Planner must confirm exact generated SQL against the installed PostgreSQL dialect. |
| A4 | A conservative fixed hostname set can classify search/social without storage. | Product may prefer all non-internal as external; no dashboard depends on detail until Phase 12. |

## Open Questions

None block planning. The planner should lock the exact fixed search/social hostname set in the first plan rather than infer it from arbitrary Referrer values; unknown hosts remain `external`.

## Sources

### Primary
- [VERIFIED: `.planning/REQUIREMENTS.md`] — Phase 11 requirements, privacy boundary, retention, local-only and release constraints.
- [VERIFIED: `apps/api/src/content/public-repository.ts:17-24`] — canonical public visibility predicate and PostgreSQL-time authority.
- [VERIFIED: `apps/api/src/security/rate-limiter.ts:19-55`] — bounded ephemeral limiter behavior.
- [VERIFIED: `apps/api/src/content/export-repository.ts:18-56`] — current portable export boundary.
- [VERIFIED: `apps/api/test/backup-restore.test.ts:26-64`] — established full backup/restore equality pattern.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all components are already installed and used in the repository.
- Architecture: HIGH — follows current public predicate, transaction, limiter, migration, export, and restore seams.
- Browser/prefetch details: MEDIUM — must be locked by focused browser and route tests during implementation.

**Research date:** 2026-09-05  
**Valid until:** Phase 11 implementation begins or an existing public/security seam changes.
