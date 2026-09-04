# Phase 10: Controlled Scheduled Publishing - Research

**Researched:** 2026-09-04
**Domain:** PostgreSQL-backed scheduled publishing, authenticated administration, and public-visibility invariants
**Confidence:** HIGH for repository integration; MEDIUM for PostgreSQL operational semantics

## Summary

Use the existing `articles` table and the existing Fastify/Drizzle/React stack. Do not add a scheduler service, Redis, a queue, or a second public data plane. Model a reservation as a retained `draft` with a nullable UTC `scheduled_at` timestamp and the administrator ID which authorized it. A one-shot local CLI command claims a bounded, deterministically ordered batch of eligible rows in one PostgreSQL transaction, validates each row, changes them to `published`, records audit events, and commits the entire batch or rolls it all back.

The public boundary must become time-aware immediately, rather than waiting for the one-shot task: every public repository read must require an article to be published, undeleted, have a publication time, and have `published_at <= CURRENT_TIMESTAMP`. That single predicate already feeds home/list/detail/search/related, taxonomy, distribution, RSS, and sitemap. [VERIFIED: apps/api/src/content/public-repository.ts:17-21] The existing predicate is exactly `eq(schema.articles.status, "published")`, `isNull(schema.articles.deletedAt)`, and `isNotNull(schema.articles.publishedAt)`; it currently lacks the time condition.

**Primary recommendation:** add an explicit schedule timestamp and scheduler actor to retained drafts, make `publicPredicate` database-time-aware, and implement a bounded all-or-nothing `publish-due` CLI using `FOR UPDATE SKIP LOCKED` semantics without any new package.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONT-05 | 管理员可为草稿设置未来发布时间，并在到期前查看、改期或取消该计划。 | Add strict schedule contracts, authenticated mutation routes, a lock-backed service operation, audit events, and responsive controls in the retained admin editor/list. |
| CONT-06 | 已预约但未到期的文章在首页、搜索、分类、标签、归档、RSS、Sitemap 和相关阅读中始终不可见。 | Strengthen the shared public predicate with a database-time condition and prove every existing public surface consumes it. |
| CONT-07 | 受控的本地任务只处理已到期文章，重试或并发执行时保持幂等，并保留首次公开时间和稳定 slug 语义。 | One bounded transaction selects ordered due drafts `FOR UPDATE SKIP LOCKED`, sets the first public time once, never alters slug, and rolls back every selected row on error. |
| CONT-08 | 预约、改期、取消与到期发布均通过既有单管理员认证/审计边界记录，无效时间、非草稿状态和部分失败必须失败关闭。 | Reuse `requireAdministratorMutation`, extend explicit audit contracts/DB checks, and return a structured CLI result with non-zero process status on rejected or failed batches. |

## Project Constraints (from AGENTS.md)

- Do not connect, deploy, or modify main server `47.99.80.8` while production is frozen.
- Use the local workspace for frontend, ingress, and end-to-end verification; do not depend on the secondary server's public address.
- Do not add heavy search, microservices, or permanently resident high-memory components.
- Do not commit passwords, keys, tokens, or database credentials; do not expose the database publicly.
- Preserve export, backup, and recovery verification for content, metadata, media, and configuration.
- Keep one-domain browser behavior and modern mobile/desktop compatibility.
- Production remains blocked until the explicit production gates are satisfied.
- Start file-changing work through GSD; this research only owns the phase research artifact.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Schedule/reschedule/cancel authority | API / Backend | Database / Storage | Browser input is untrusted; the API must enforce session, origin, rate, state, and UTC rules inside a transaction. |
| Schedule persistence and due claim | Database / Storage | API / Backend | A row timestamp plus `FOR UPDATE SKIP LOCKED` provides the cross-process correctness boundary without a queue. |
| Public non-disclosure | Database / Storage | Frontend Server (SSR) | Every public response must query through the time-aware predicate before SSR/RSS/sitemap renders it. |
| One-shot due publisher | API / Backend | Database / Storage | A locally invoked process owns the transaction and emits the observable command result; it must not become a web route or daemon. |
| Time-zone explanation and controls | Browser / Client | API / Backend | The browser can display local time/zone, while API converts a required-offset ISO instant and persists a UTC instant. |
| Audit display | Frontend Server (SSR) | API / Backend | The existing administrator-only audit page can render the expanded, content-free audit vocabulary. |

## Standard Stack

### Core

| Library / component | Version in repository | Purpose | Why standard here |
|---|---:|---|---|
| PostgreSQL through `pg` | `8.22.0` | UTC timestamps, transaction, row locking, durable state | Existing database boundary; PostgreSQL officially documents `SKIP LOCKED` for queue-like multiple consumers. [CITED: https://www.postgresql.org/docs/current/sql-select.html] |
| Drizzle ORM | `0.45.2` | Existing typed schema/query/transaction integration | Existing app/repository pattern already uses `transaction` and `.for("update")`. [VERIFIED: apps/api/src/content/admin-repository.ts:124-153] |
| Fastify | `5.11.2` | Existing authenticated admin routes | Existing mutation guard centralizes session/origin/rate enforcement. [VERIFIED: apps/api/src/security/mutation-guard.ts:55-72] |
| Zod contracts | existing workspace dependency | Exact request/response/audit parsing | Existing strict contracts reject unrecognized state fields. [VERIFIED: packages/contracts/src/admin-posts.ts:6-19] |
| React / Next admin UI | existing workspace stack | Responsive, accessible author controls | Existing editor already owns `datetime-local`, mobile CSS breakpoints, recoverable editing, and status messaging. [VERIFIED: apps/web/app/admin/_components/ArticleEditor.tsx:442-490] |

### Supporting

| Component | Purpose | When to use |
|---|---|---|
| `apps/api/src/content/article-state.ts` | Explicit lifecycle table | Add schedule actions or a scheduling operation without adding a public status. |
| `apps/api/src/content/admin-repository.ts` | Retained record locks and audit transaction | Implement schedule/cancel in the same locked-record abstraction; add a due-batch repository method. |
| `apps/api/src/audit/audit-repository.ts` | Strict content-free audit persistence | Extend named event/metadata contracts before producing new audit rows. |
| Node `tsx src/app.ts` CLI entry | Existing migration/seed/schema CLI pattern | Add one explicit `publish-due` command, not a service endpoint. [VERIFIED: apps/api/src/app.ts:209-220] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|---|---|---|
| One-shot PostgreSQL worker | Redis/BullMQ or a hosted scheduler | Rejected: violates the stated no-queue/no-resident-service constraint and adds an unavailable operational dependency. |
| A separate `scheduled` status | `draft` plus `scheduled_at` | Rejected: the requirement calls scheduled items drafts and existing lifecycle/API status unions are small; an explicit timestamp keeps drafts private with fewer public-contract changes. |
| Database `CURRENT_TIMESTAMP` | Node wall-clock comparison | Rejected: database time keeps due selection and update in one authority/transaction; browser time remains presentation only. |

**Installation:** none. This phase must add no external dependency.

## Package Legitimacy Audit

No packages are introduced; the package legitimacy gate is not applicable.

## Architecture Patterns

### System Architecture Diagram

```text
Administrator browser (local date/time + declared zone)
  -> POST /admin/posts/:id/schedule | reschedule | cancel
  -> existing session + Origin + rate mutation guard
  -> strict Zod contract (future UTC instant, draft-only operation)
  -> transaction + row lock
  -> articles.scheduled_at / scheduled_by_administrator_id + audit_events

Local one-shot CLI: `publish-due --limit N`
  -> validate bounded CLI input
  -> one DB transaction
  -> due draft query, ORDER BY scheduled_at,id, LIMIT N, FOR UPDATE SKIP LOCKED
  -> validate all claimed records -> publish all + append audits -> COMMIT
     \-> any failure -> ROLLBACK -> JSON result + non-zero exit

Every public API query
  -> publicPredicate: published + undeleted + published_at present + published_at <= DB now
  -> public posts / taxonomy / distribution
  -> SSR pages, RSS, sitemap, related cards
```

### Recommended Project Structure

```text
apps/api/
├── drizzle/                         # one additive schema migration + snapshot/journal update
├── src/content/
│   ├── article-state.ts              # schedule operation/state rules
│   ├── admin-repository.ts           # retained locking and due-batch repository method
│   ├── article-service.ts            # schedule/reschedule/cancel validation and serialization
│   ├── public-repository.ts          # time-aware public predicate
│   └── scheduled-publisher.ts        # transactional bounded due publisher
├── src/routes/admin-posts.ts         # guarded schedule mutation endpoints
└── src/app.ts                        # explicit CLI command dispatch/result/exit code
packages/contracts/src/
├── admin-posts.ts                    # schedule request/response/status schemas
└── audit.ts                          # schedule audit event and metadata vocabulary
apps/web/app/admin/
├── _components/ArticleEditor.tsx     # schedule control, local-zone explanation, form fallback
├── _components/ArticleActions.tsx    # schedule/cancel lifecycle controls
└── admin.module.css                  # responsive and focus-visible layout
```

### Pattern 1: Keep a schedule as draft metadata, not a publicly visible lifecycle state

**What:** Add nullable `scheduledAt` and `scheduledByAdministratorId` to the retained article record. A schedule is active only when the article is a non-deleted draft and both values are present. Persist the instant as `timestamp with time zone`; PostgreSQL converts explicit-offset inputs to UTC internally and does not retain the original display zone. [CITED: https://www.postgresql.org/docs/current/datatype-datetime.html]

**When to use:** Schedule, reschedule, cancel, and due worker paths only. The public/admin schema should expose `scheduledAt` to authenticated administration but never to public contracts.

**Recommended invariants:**

- `scheduled_at IS NULL` iff `scheduled_by_administrator_id IS NULL`.
- A non-null schedule may only coexist with `status = 'draft'` and `deleted_at IS NULL`.
- A schedule mutation requires an ISO-8601 instant with an offset, valid date, and `scheduledAt > database/current operation time`; reject equal/past instants.
- A draft's `published_at` is not the scheduler field. New schedule creation must clear/forbid draft `published_at`; direct manual publishing writes the first actual public time exactly once.
- The migration must normalize retained draft values deliberately: preserve future intent by moving an existing future draft `published_at` to `scheduled_at`, clear old draft publication values, and leave published/unpublished/deleted first-publication history untouched. This is a data migration, not merely a type edit. [ASSUMED]

The current state table is a closed map: `"draft", "published", "unpublished", "deleted"` and `"edit", "publish", "unpublish", "republish", "delete"`; its draft row is exactly `draft: { edit: "draft", publish: "published", unpublish: null, republish: null, delete: "deleted" }`. [VERIFIED: apps/api/src/content/article-state.ts:3-15] Keep these public lifecycle states; schedule/reschedule/cancel should be separate draft-only service operations rather than exposing `scheduled` through `articleStatusSchema`.

### Pattern 2: One public predicate, evaluated using database time

**What:** Amend the exported predicate once, then rely on the established repository wiring rather than sprinkling scheduler checks around routes or pages.

The public predicate is reused by list, search, related, detail, distribution, taxonomy counts, and taxonomy detail. [VERIFIED: apps/api/src/content/public-repository.ts:17-21; apps/api/src/content/public-repository.ts:105-127; apps/api/src/content/public-repository.ts:209-318; apps/api/src/content/public-repository.ts:320-354; apps/api/src/content/taxonomy-repository.ts:17-18; apps/api/src/content/taxonomy-repository.ts:78-101] Sitemap and RSS consume only the public distribution API. [VERIFIED: apps/web/app/sitemap.ts:10-31; apps/web/app/rss.xml/route.ts:1-12]

**Use:** `scheduledAt` should never be necessary in a public selection. The public condition is status/soft-delete/first-publication-time plus database `published_at <= CURRENT_TIMESTAMP`. This closes disclosure even if a due worker is late, unavailable, retried, or never invoked.

### Pattern 3: Claim and publish atomically in a bounded all-or-nothing transaction

**What:** The publisher validates an integer limit in a small fixed range (recommend default 25, maximum 100 [ASSUMED]), opens one default `READ COMMITTED` transaction, selects the first N eligible rows deterministically by `scheduled_at ASC, id ASC`, with `FOR UPDATE SKIP LOCKED`, validates each using the same publication/media rules as manual publishing, updates all eligible records, appends all audits, and returns a versioned result.

PostgreSQL documents that `FOR UPDATE` locks rows it returns; `SKIP LOCKED` skips rows that cannot be locked immediately and is suitable for queue-like multi-consumer work. It also documents that `LIMIT` must be paired with deterministic `ORDER BY` for a predictable subset. [CITED: https://www.postgresql.org/docs/current/sql-select.html]

**Correctness consequences:**

- Concurrent invocations cannot publish the same row twice: one locks and changes it from draft; the other skips the lock or subsequently finds no matching draft.
- Re-run is idempotent: a committed row no longer satisfies `status = draft AND scheduled_at <= CURRENT_TIMESTAMP`.
- A schedule/cancel operation uses the existing retained-row `for("update")` transaction, so it either wins before the worker selects the row or observes a published row and fails with an explicit invalid-state result. [VERIFIED: apps/api/src/content/admin-repository.ts:124-153]
- Perform all selected changes and audit inserts in the same transaction. Any invalid row, stale schedule actor, media validation failure, DB error, or audit insert failure throws and rolls the batch back. Do not continue after a per-row error.
- Set `publishedAt` only on successful due publication, using the same database transaction's current timestamp; retain it unchanged on unpublish/republish. Do not change `slug` in the due path. Existing manual publication already preserves an existing first value via `current.publishedAt ?? new Date()` and keeps it on republish. [VERIFIED: apps/api/src/content/article-service.ts:205-216]

### Pattern 4: Authenticated schedule operations and attributable audit evidence

**What:** Add explicit schedule/reschedule/cancel API routes under `/admin/posts/:id/…`, listed in `unsafeRoutePolicies`, guarded by `requireAdministratorMutation`, and parsed with strict contracts. This guard evaluates session, then exact `Origin`, then the bounded administrator rate limiter. [VERIFIED: apps/api/src/security/mutation-guard.ts:55-72]

**Audit model:** extend the event union/database check/expected-target map together. Recommended event names are `"article.scheduled"`, `"article.rescheduled"`, `"article.schedule_cancelled"`, and `"article.scheduled_published"` [ASSUMED]. Add only the instant and state fields required for audit reconstruction; never title, summary, markdown, slug, or content fields. Persist the authenticated administrator ID with the active schedule so the due worker can attribute eventual publication without inventing an unauthenticated actor.

Existing audit contracts are closed: event names currently include `"article.created"`, `"article.updated"`, `"article.published"`, `"article.unpublished"`, `"article.republished"`, and `"article.deleted"`; metadata currently accepts only `changedFields`, `previousStatus`, and `status`. [VERIFIED: packages/contracts/src/audit.ts:3-34] The database repeats the event constraint and caps object metadata at 2048 UTF-8 bytes. [VERIFIED: apps/api/src/db/schema.ts:25-40] The plan must update contracts, DB schema/migration, `expectedTarget`, service tests, and audit UI labels as one change.

### Pattern 5: Explicit local CLI result and exit contract

**What:** Add a named `publish-due` command alongside `migrate`, `seed`, `schema:verify`, and `portable-export`; reject unknown/invalid flags before connecting to the database. [VERIFIED: apps/api/src/app.ts:209-220]

**Recommended result contract:** Write exactly one JSON object to stdout on success with `format`, `command`, `at`, `limit`, `claimed`, `published`, `skippedLocked`, and `publishedIds` (IDs only) [ASSUMED]. Write a typed JSON error object to stderr on rejected input, dependency failure, validation failure, or transaction failure; set a non-zero exit code. `publishedIds` must be length-bounded by `limit`; do not print titles, bodies, connection strings, or full audit metadata.

For a zero-eligible batch, return `claimed: 0`, `published: 0`, and exit 0. For any non-empty batch error, emit an observable non-zero result after the transaction has rolled back. A scheduler runner remains a future deployment concern; this phase exposes a local command only and must keep production release state `BLOCKED`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Cross-process job ownership | In-process boolean/Node mutex | PostgreSQL row locks with `FOR UPDATE SKIP LOCKED` | A Node lock is not shared by concurrent CLI invocations or future processes. |
| Job queue/daemon | Polling service, Redis queue, cron framework in the app | Explicit one-shot API CLI command | Meets the bounded, local-only requirement without new always-on infrastructure. |
| Time-zone conversion | Custom offset parser | Browser `datetime-local` -> explicit-offset ISO value -> Zod datetime -> PostgreSQL `timestamptz` | Avoids ambiguous local times and keeps database as time authority. |
| Visibility filters | Route-by-route schedule checks | One time-aware `publicPredicate` | Prevents a missed page, feed, search, taxonomy, or related-post path. |
| Audit text storage | Free-form JSON descriptions | Existing strict event and small metadata schemas | Avoids content leakage through the audit screen. |

## Common Pitfalls

### Pitfall 1: A future `published_at` leaks through a status-only public predicate

**What goes wrong:** A record can have status `published` and a future timestamp, causing every public query to show it before a scheduler runs.

**Why it happens:** Current predicate checks only published status, soft deletion, and non-null time. [VERIFIED: apps/api/src/content/public-repository.ts:17-21]

**How to avoid:** Require `published_at <= CURRENT_TIMESTAMP` in the shared predicate and add a future-published fixture to every public-surface test cluster.

### Pitfall 2: Claiming then publishing in separate transactions

**What goes wrong:** A crash or a second process can leave a claimed-but-unpublished state, duplicate an event, or expose partial batch completion.

**How to avoid:** Select/lock, validate, update, and audit in exactly one transaction; no persistent claimed state is required.

### Pitfall 3: Worker time comes from the browser or Node host clock

**What goes wrong:** Clock skew or parsing differences make a row eligible in one layer but hidden/published in another.

**How to avoid:** Compare and update using PostgreSQL current time inside the transaction. The browser only explains and collects a future instant.

### Pitfall 4: Schedule endpoint bypasses the unsafe route inventory

**What goes wrong:** A new mutation is not subject to the reviewable body limit/rate policy and security tests fail.

**How to avoid:** Add exact path/method/body entries to `unsafeRoutePolicies`; reuse `requireAdministratorMutation` and JSON content-type enforcement.

### Pitfall 5: Audit event update is incomplete

**What goes wrong:** Contract parsing, the DB check constraint, or `expectedTarget` rejects a new event after a content change has begun.

**How to avoid:** Treat `packages/contracts/src/audit.ts`, `apps/api/src/db/schema.ts`, migration SQL, and `apps/api/src/audit/audit-repository.ts` as one atomic implementation slice.

### Pitfall 6: A responsive control has no keyboard/no-script path

**What goes wrong:** Desktop button-only UI works but phone layout overflows, keyboard users cannot operate it, or JS failure removes the core schedule action.

**How to avoid:** Use labelled fields, native buttons/forms, `min-height: 44px`, visible status, mobile single-column layout, and a guarded form-encoded fallback route or equivalent server action. Existing editor CSS already changes its two-column metadata grid to one column at 720px. [VERIFIED: apps/web/app/admin/admin.module.css:1-18; apps/web/app/admin/admin.module.css:64-80]

## Code Examples

### Shared public visibility predicate

```typescript
// Existing boundary: apps/api/src/content/public-repository.ts:17-21
export const publicPredicate = and(
  eq(schema.articles.status, "published"),
  isNull(schema.articles.deletedAt),
  isNotNull(schema.articles.publishedAt),
  sql`${schema.articles.publishedAt} <= CURRENT_TIMESTAMP`,
);
```

The string value `"published"` is part of the existing exact public predicate. [VERIFIED: apps/api/src/content/public-repository.ts:17-21] The SQL comparison is the Phase 10 recommendation. [ASSUMED]

### Transactional due batch skeleton

```typescript
// Pseudocode grounded in existing Drizzle transaction + .for("update") usage.
return db.transaction(async (tx) => {
  const due = await tx.select(/* bounded safe fields */)
    .from(schema.articles)
    .where(and(
      eq(schema.articles.status, "draft"),
      isNull(schema.articles.deletedAt),
      isNotNull(schema.articles.scheduledAt),
      sql`${schema.articles.scheduledAt} <= CURRENT_TIMESTAMP`,
    ))
    .orderBy(schema.articles.scheduledAt, schema.articles.id)
    .limit(limit)
    .for("update", { skipLocked: true }); // verify exact Drizzle API during implementation

  for (const item of due) validateScheduledPublish(item);
  for (const item of due) {
    await tx.update(schema.articles).set({
      status: "published",
      publishedAt: sql`CURRENT_TIMESTAMP`,
      scheduledAt: null,
      scheduledByAdministratorId: null,
    }).where(eq(schema.articles.id, item.id));
    await appendAuditEvent(tx, /* saved schedule actor, content-free metadata */);
  }
  return result;
});
```

The existing retained-record pattern already opens a transaction, locks a selected row with `.for("update")`, updates it, and appends the audit before returning. [VERIFIED: apps/api/src/content/admin-repository.ts:124-153] The `skipLocked` method spelling is intentionally [ASSUMED]; the implementer must verify the installed Drizzle version's exact API or use parameterized/raw SQL only inside the repository boundary.

## State of the Art

| Old Approach | Current Phase Approach | Impact |
|---|---|---|
| Draft may carry `publishedAt`; manual publish reuses it | Draft scheduling uses separate `scheduledAt`; publication timestamp is set only when an eligible row is committed as public | Separates intention from actual public state and prevents future-time leakage. |
| Public predicate means status + non-null time | Public predicate additionally compares the publication instant to database time | One invariant protects every derived public surface. |
| Only browser mutations change lifecycle | Explicit local one-shot CLI is a controlled, observable publisher | Supports later external invocation without activating a production scheduler. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | A schedule is best represented as a draft plus nullable scheduling fields, not an extra public status. | Architecture Patterns | Contract/UI scope would widen if a distinct status is required. |
| A2 | Existing draft `published_at` values should be normalized by migration, moving future values to schedules and clearing retained draft publication timestamps. | Pattern 1 | Historic draft timestamp intent may need explicit product migration policy. |
| A3 | Default due limit 25, maximum 100, and JSON result field names are suitable operational defaults. | Pattern 3 / 5 | CLI compatibility and operator expectations may differ. |
| A4 | Drizzle supports the shown `skipLocked` syntax or can express it safely at the repository boundary. | Code Examples | Implementation must verify exact installed ORM API before coding. |
| A5 | A native form fallback can be introduced without conflicting with the existing JSON editor workflow. | Pitfall 6 | May require a small dedicated Next/API action adapter. |

## Open Questions

1. **What is the canonical migration policy for retained drafts with a non-null historical `published_at`?**
   - What we know: current draft creation accepts a nullable `publishedAt`, and manual publish preserves a supplied value. [VERIFIED: packages/contracts/src/admin-posts.ts:6-19; apps/api/src/content/article-service.ts:212-216]
   - What's unclear: whether any retained draft values represent intentional future schedules versus historical editorial dates.
   - Recommendation: make migration deterministic and data-preserving for future values; include an export/restore fixture and document the conversion in the phase plan.

2. **What exact Drizzle API expresses `SKIP LOCKED` at version 0.45.2?**
   - What we know: `.for("update")` is used locally. [VERIFIED: apps/api/src/content/admin-repository.ts:129-132]
   - What's unclear: whether the installed fluent API accepts `skipLocked` and its exact option shape.
   - Recommendation: resolve against installed types/docs before task implementation; if unavailable, use a parameterized SQL fragment confined to the due repository and test concurrent workers.

3. **How should an authorized task be invoked outside this milestone?**
   - What we know: production task activation is explicitly out of scope and all production decisions remain BLOCKED.
   - Recommendation: ship only the local command and its documented non-production result contract; record any cron/systemd decision as future work.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---:|---|---|
| Node.js | API CLI, tests | ✓ | `v24.15.0` | — |
| pnpm via Corepack | workspace tests/typecheck | ✓ | `11.20.0` | — |
| PostgreSQL | integration/concurrency tests | Not contacted by this research | — | generated local delivery test environment only; no server access |
| Docker | final local delivery only | CLI present | `29.7.1` | do not invoke during implementation research |

**Missing dependencies with no fallback:** none identified for source planning. A disposable local PostgreSQL database is required when executing integration/concurrency tests, but must be provided by the established local delivery flow rather than an external server.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | yes | Existing session-backed `requireAdministrator` for schedule reads/mutations. |
| V3 Session Management | yes | Existing httpOnly session token verification; no CLI credential is added. |
| V4 Access Control | yes | Draft-only state rule, authenticated actor persisted with schedule, no public schedule projection. |
| V5 Input Validation | yes | Strict Zod offset ISO input, integer CLI bound, state/media validation before commit. |
| V6 Cryptography | no new use | Reuse existing session/password implementation; do not hand-roll new secret or signature material. |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| Future article disclosure | Information disclosure | Time-aware shared public predicate plus public-surface fixture matrix. |
| Cross-site scheduling mutation | Tampering | Existing session-first exact-Origin mutation guard, content-type, rate limit. |
| Concurrent duplicate publishing | Tampering / reliability | Ordered bounded `FOR UPDATE SKIP LOCKED` transaction and state predicate. |
| Partial publication on invalid due row | Integrity | Validate and audit every claimed row in one transaction; roll back all on error. |
| Sensitive content in scheduler/audit output | Information disclosure | IDs/counts/status only; strict metadata schema; no content, slug, or connection details. |
| CLI invoked with unsafe/unbounded input | Denial of service | Fixed command grammar, small bounded limit, non-zero rejected-input result. |

## Validation Strategy

`workflow.nyquist_validation` is explicitly `false` in `.planning/config.json`; this section supplies planning guidance rather than a Nyquist gate.

- Add contract tests for strict schedule input: offset required, invalid/past/equal times rejected, response excludes scheduler actor/private fields.
- Extend article lifecycle integration tests for unauthenticated/origin/rate guarded scheduling, draft-only state enforcement, schedule/reschedule/cancel audit rows, and no state mutation on failure.
- Add a dedicated due-worker integration test against a disposable migrated local PostgreSQL database: zero batch, bounded order, future row excluded, invalid claimed row causes no selected row to publish, repeated run idempotency, and two simultaneous invocations publish each ID/audit once.
- Add public list/search/detail/related/taxonomy/distribution tests containing a `status = published` future-timestamp fixture; all must omit its markers. Existing public code centralizes these reads around `publicPredicate`. [VERIFIED: apps/api/src/content/public-repository.ts:105-318; apps/api/src/content/taxonomy-repository.ts:17-18]
- Add RSS/sitemap assertions from the public distribution fixture and browser E2E for schedule, reschedule, cancel, visible timezone text, keyboard operation, 390px mobile viewport, tablet, and desktop.
- After source tests/typecheck/boundary checks pass, use the existing fixed local delivery command exactly once for the final clean revision; do not use it while the phase is still changing. Keep any human-only UAT in the phase record and do not block other automated work.

## Sources

### Primary (HIGH confidence)

- `apps/api/src/db/schema.ts:63-88` — existing article timestamps, indexes, and retained schema.
- `apps/api/src/content/article-state.ts:3-22` — exact lifecycle states/actions and transition table.
- `apps/api/src/content/admin-repository.ts:99-156` — existing draft persistence, retained row lock, and same-transaction audit pattern.
- `apps/api/src/content/article-service.ts:175-226` — existing manual publish/republish first-publication semantics.
- `apps/api/src/content/public-repository.ts:17-21,105-354` and `apps/api/src/content/taxonomy-repository.ts:17-101` — shared public predicate fan-out.
- `packages/contracts/src/admin-posts.ts:6-77` and `packages/contracts/src/audit.ts:3-42` — strict contract seams.
- `apps/api/src/security/mutation-guard.ts:21-86` — exact unsafe-route and mutation guard pattern.

### Secondary (MEDIUM confidence)

- [PostgreSQL SELECT documentation](https://www.postgresql.org/docs/current/sql-select.html) — row-level locking, `SKIP LOCKED`, deterministic `LIMIT` ordering guidance.
- [PostgreSQL Date/Time Types documentation](https://www.postgresql.org/docs/current/datatype-datetime.html) — `timestamp with time zone` UTC conversion/storage and session-zone display behavior.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all implementation dependencies are already declared in the repository; no package addition is recommended.
- Architecture: HIGH — route/service/repository/public projection seams and their exact source definitions were read this session.
- PostgreSQL concurrency semantics: MEDIUM — verified against current official documentation; exact Drizzle `SKIP LOCKED` fluent syntax remains an implementation check.
- Pitfalls: HIGH — derived from current predicate omissions, strict contract boundaries, and the phase acceptance constraints.

**Research date:** 2026-09-04
**Valid until:** 2026-10-04 for repository structure; re-check installed Drizzle API immediately before implementation.
