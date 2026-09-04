# Phase 10 Pattern Map: Controlled Scheduled Publishing

**Mapped:** 2026-09-04  
**Scope:** repository-local scheduled publication only; no deployment, timer activation, server access, Docker execution, or production claim  
**Requirements:** CONT-05, CONT-06, CONT-07, CONT-08

## Mapping Summary

Phase 10 should extend the existing article lifecycle rather than introduce a second content model or a network-accessible scheduler. The closest reusable path is:

```text
strict admin contract
  -> authenticated same-origin Fastify mutation
  -> article service policy
  -> row-locked repository transaction
  -> article row + audit row committed together
  -> strict admin response
  -> responsive editor/list state

bounded local command
  -> DATABASE_URL-only runtime config
  -> bounded due-row selection under database locks
  -> shared publishability policy
  -> status/publication-time/schedule clear + audit in one transaction
  -> secret-free aggregate result
```

Keep scheduled articles as retained `draft` articles with separate schedule metadata. The public layer already shares one predicate across article list/detail, search, taxonomy, archive, related content, RSS, and Sitemap data. Preserving `status = 'draft'` until the due worker commits is therefore the primary visibility boundary; tightening the shared predicate against future `publishedAt` values is a useful defense-in-depth change.

## Existing End-to-End Ownership

| Responsibility | Existing owner | Reusable convention | Phase 10 implication |
|---|---|---|---|
| Article storage and indexes | `apps/api/src/db/schema.ts` (`articles`, lines 63-88) | Drizzle schema plus named PostgreSQL indexes/checks | Add schedule columns/index/checks here and a numbered migration. |
| Migration execution | `apps/api/src/app.ts` (`migrate`, lines 187-221) | Sorted SQL files, process-wide PostgreSQL advisory lock, retry-tolerant DDL, ledger fingerprint | Add the next migration and update strict schema verification; do not invent a second migrator. |
| Admin article DTOs/actions | `packages/contracts/src/admin-posts.ts` | Strict Zod schemas, ISO datetimes with offsets, literal lifecycle actions | Add explicit schedule request/response fields without weakening `.strict()`. |
| Lifecycle state policy | `apps/api/src/content/article-state.ts` | Complete state/action table, invalid transitions resolve to `null` | Scheduling remains a draft substate, not a fourth public lifecycle status. |
| Article orchestration | `apps/api/src/content/article-service.ts` | Service validates, repository transaction locks, update and audit succeed atomically | Put schedule/reschedule/cancel policy beside lifecycle methods and share publishability validation with the due worker. |
| Article persistence | `apps/api/src/content/admin-repository.ts` | `transactRetained()` selects `FOR UPDATE`; mutation and audit use one transaction | Reuse for user schedule mutations; add a repository-owned bounded due batch for workers. |
| Protected routes | `apps/api/src/routes/admin-posts.ts` | auth first, same-origin/rate guard, exact content type, strict parse, stable 400/404/409 mapping | Add explicit schedule/cancel routes and register each unsafe route policy. |
| Mutation registry | `apps/api/src/security/mutation-guard.ts` (`unsafeRoutePolicies`, lines 21-39) | Every unsafe endpoint is enumerated with body limit/content-type/limiter | New schedule mutation methods must appear here or boundary tests should fail. |
| Audit contract/storage | `packages/contracts/src/audit.ts`, `apps/api/src/audit/audit-repository.ts`, `apps/api/drizzle/0007_admin-audit.sql` | exact event enum, exact metadata, target map, DB event check, same-transaction append | All schedule event names and safe timestamp metadata must be extended consistently in four places. |
| Admin editor/list | `ArticleEditor.tsx`, `ArticleActions.tsx`, `admin/page.tsx` | server-loaded strict post, client mutation island, live status, lifecycle buttons disabled while editor dirty | Show scheduled time on detail and list; expose schedule/reschedule/cancel only for saved clean drafts. |
| Responsive admin layout | `apps/web/app/admin/admin.module.css` | two-column metadata collapses at 720px; lifecycle/list/audit become one column | Reuse existing layout, minimum control height, overflow and live-region patterns. |
| Public visibility | `public-repository.ts` `publicPredicate`, imported by taxonomy and archive repositories | one predicate is composed into every public query/data feed | Modify one authority and prove every consumer; do not add per-route schedule checks. |
| Portable content authority | `packages/contracts/src/distribution.ts`, `export-repository.ts` | strict, deterministic, lossless portable manifest compared against DB state | Schedule state required to resume after restore must be exported and restored byte-equivalently. |
| Local command seam | `apps/api/src/app.ts` `main()` and `security/config.ts` `ApiCommand` | DB-only one-shot commands bypass HTTP serving and close the pool in `finally` | Add a bounded `publish-due` command here; do not expose an HTTP job endpoint. |
| Package/integration ownership | `scripts/test-inventory.mjs`, `scripts/default-test.mjs`, `scripts/local-verify.mjs` | exact on-disk test inventory and fixture-owner mapping | Prefer extending owned lifecycle/public/export/browser suites; any new test file requires all exact inventory/count owners to move together. |

## 1. Data Model and Migration Patterns

### Current article fields and indexes

`apps/api/src/db/schema.ts` currently stores:

- `status` as text with default `published`;
- nullable `publishedAt`;
- nullable `deletedAt`;
- globally reserved unique `slug`;
- `articles_public_index(status, publishedAt)` and `articles_category_public_index(categoryId, status, publishedAt)`.

There is no schedule-specific field. Do not overload `publishedAt` for a pending deadline. Add a separate nullable `scheduledAt` timestamp with time zone. The worker also needs durable audit attribution after the administrator session has ended; the narrowest recoverable model is a nullable `scheduledByAdministratorId` UUID captured when the schedule is created or changed.

Recommended invariants:

```sql
scheduled_at is null
  <=> scheduled_by_administrator_id is null

scheduled_at is not null
  => status = 'draft' and deleted_at is null
```

Use a partial due index shaped around the actual claim query, for example `(scheduled_at, id) WHERE status = 'draft' AND deleted_at IS NULL AND scheduled_at IS NOT NULL`. The deterministic `id` suffix is important when timestamps tie.

The actor column is execution authority, not public content. A foreign key with cascading deletion would be inconsistent with the audit ledger's deliberate non-FK actor design (`schema.ts` lines 20-24). Either leave it as a checked UUID value or use a non-cascading/restrict relationship; do not allow administrator deletion to silently erase or null a pending job's attribution.

### Migration convention and coupled verification

The current migration ledger ends at `0007_admin-audit.sql`; `app.ts` reads every numbered SQL file in lexical order. A Phase 10 migration should therefore be the next numbered SQL file and include named index/check constraints matching the Drizzle declarations.

`schemaVerify()` in `apps/api/src/app.ts` is intentionally exact and currently assumes:

- nine application tables;
- eight ledger migrations;
- a fixed list of indexes;
- three audit constraints;
- media and legacy-media constraints.

The phase must update the migration count and explicitly check the schedule columns/index/checks and expanded audit event constraint. A migration that only changes `schema.ts` will not reach a running database; a migration that omits `schemaVerify()` changes will fail the local delivery gate.

Do not add a new table just to model jobs. One row per article plus a partial due index is sufficient for the 2C4G constraint and avoids job/article reconciliation.

## 2. Publication-Time Collision That Must Be Resolved

The existing code gives `publishedAt` two conflicting meanings:

1. `ArticleEditor.tsx` exposes “发布时间” for drafts (`initialFields`, lines 49-64; form line 526).
2. `adminPostInputSchema` accepts it during draft creation/update.
3. `admin-repository.ts` persists it on the draft (`values`, lines 71-83).
4. Manual publish preserves an existing draft value (`article-service.ts` line 214).
5. Public ordering, RSS, Sitemap, archives, JSON-LD, and display treat it as the actual public publication time.

Phase 10 must not reinterpret a draft `publishedAt` as an automatic schedule. That would unexpectedly publish retained drafts after migration. The safe boundary is:

- `scheduledAt` means the pending automatic deadline;
- `publishedAt` means first successful transition into public visibility;
- schedule/reschedule never writes `publishedAt`;
- the due worker sets `publishedAt` exactly once when it changes `draft -> published`;
- retry/concurrent runs never overwrite it;
- unpublish/republish retain it, matching current behavior.

The planner must explicitly decide backward compatibility for preexisting draft `publishedAt` values. The conservative path is to leave those bytes intact during migration but stop treating them as schedule authority; the first new publish transition should establish the actual public time according to the new invariant. Do not silently convert old values into live jobs.

The existing correction flow for already published/unpublished content (`publishedAtCorrection` in `adminPostUpdateSchema` and `ArticleEditor`) can remain distinct. Rename UI labels or conditionally render controls so “首次发布时间更正” cannot be mistaken for “预约发布时间”.

## 3. Strict Contracts and Route Boundaries

### Contract extension

`packages/contracts/src/admin-posts.ts` is the source of truth for both API and Web. Reuse its offset-aware datetime schema and strict-object style.

Recommended shapes:

```ts
scheduleArticleInputSchema = z.object({
  scheduledAt: z.string().datetime({ offset: true }),
}).strict()

adminPostSchema = ...extend({
  scheduledAt: isoDateTime.nullable(),
})
```

Only the service can determine whether a valid ISO instant is actually in the future, because that requires the authoritative clock. Invalid syntax is a `400 validation_failed`; valid syntax that is not future, a non-draft state, deleted row, or missing retained row must fail closed with the existing 400/404/409 vocabulary.

Do not add `scheduled` to `articleStatusSchema`. Public DTOs already require literal `published`, and existing UI/state tables exhaustively map `draft | published | unpublished`. A schedule is an attribute of a draft, not a visibility state.

### Route placement

`apps/api/src/routes/admin-posts.ts` already centralizes all article management routes. Prefer separate semantic routes over expanding `articleActionSchema`, because scheduling carries a timestamp while ordinary lifecycle actions require an empty body.

A coherent pair is:

- `PUT /admin/posts/:id/schedule` with strict JSON `{ scheduledAt }` for initial schedule and reschedule;
- `DELETE /admin/posts/:id/schedule` with no body for cancellation.

Both must call `requireAdministratorMutation()` before revealing Origin, validation, or article state, mirror ID parsing, set bounded body policies, and map service errors without returning stored content on failure. Add both exact patterns to `unsafeRoutePolicies`.

No `/public/schedule`, `/admin/run-scheduler`, webhook, or browser-callable worker endpoint is needed. The due publisher is a local one-shot command.

## 4. Service and Repository Transaction Conventions

### User mutations

`createArticleService()` already owns validation and calls `repository.transactRetained()`. That repository:

- selects the retained article `FOR UPDATE`;
- hydrates tags/media inside the transaction;
- provides an update closure;
- appends an audit event in the same transaction;
- rolls back everything if any step throws.

Add service methods for `schedule` and `cancelSchedule` using this exact seam. The policy should:

- accept only a non-deleted draft;
- require a strictly future instant according to an injected/service clock;
- distinguish initial schedule from reschedule for audit;
- update `scheduledAt`, `scheduledByAdministratorId`, and a monotonically advanced `updatedAt` together;
- cancel by clearing both schedule fields;
- return a conflict for cancellation when no active schedule exists rather than claim success;
- never change `status`, `slug`, `publishedAt`, content, taxonomy, or media.

Manual publish and delete must clear schedule fields in the same locked transaction so an already-claimed stale deadline cannot later republish or audit the row. Editing may preserve the schedule, but publication readiness must be revalidated at execution time; an edit that makes media invalid must not become public merely because it was previously scheduled.

### Shared publishability policy

Manual publish currently validates the strict admin post and media in `article-service.ts` lines 187-203. Republish separately validates media in lines 205-210. The due worker must not copy a third, weaker version of this logic.

Extract or expose one pure policy that validates the current stored article at transition time. It should cover required title/slug/Markdown, taxonomy/media representation, and legacy-media restrictions. Both manual `publish` and due publication consume it. Test that a valid schedule created earlier still fails closed if the retained row is later malformed.

### Bounded due-worker repository

The repository is the correct owner for concurrency because it can express PostgreSQL locks. The claim query should be bounded by a compile-time or tightly parsed maximum and use database time or one injected instant consistently:

```sql
WHERE status = 'draft'
  AND deleted_at IS NULL
  AND scheduled_at IS NOT NULL
  AND scheduled_at <= :now
ORDER BY scheduled_at, id
FOR UPDATE SKIP LOCKED
LIMIT :bounded_limit
```

Process the selected rows within transactions that make the row update and audit append atomic. `FOR UPDATE SKIP LOCKED` gives parallel workers disjoint ownership without a process-local mutex. Add a compare predicate or retain the row lock through update; never select IDs outside a transaction and update them later without rechecking `status`, `deletedAt`, and `scheduledAt`.

The worker transition should atomically:

- set `status = 'published'`;
- set the first public `publishedAt` once;
- clear both schedule fields;
- preserve `slug` exactly;
- preserve content/taxonomy/media;
- set a monotonic `updatedAt`;
- append exactly one due-publication audit event attributed to the durable scheduling administrator.

Concurrent invocations then converge naturally: a committed row no longer matches the due predicate, and a retry after a process crash sees either the whole transaction or none of it.

Decide failure granularity in the plan. A single transaction for the whole bounded batch gives strongest all-or-nothing behavior but lets one corrupt row block every later due row. Per-row transactions allow healthy rows to progress while each row remains atomic. For a personal blog, a recommended compromise is a bounded ordered candidate loop with one transaction per row, explicit per-row failure count, and nonzero command exit if any due candidate failed. Never mark a failed row published or emit a success audit. Tests must define this behavior rather than leaving partial failure ambiguous.

## 5. Local Command Pattern

`apps/api/src/app.ts` already implements one-shot `migrate`, `seed`, `schema:verify`, and `portable-export` commands and always closes the pool. `apps/api/src/security/config.ts` validates which commands need only `DATABASE_URL` versus HTTP/media/admin secrets.

Add `publish-due` to the DB-only command union and package script, for example:

```text
corepack pnpm --filter @blog-x/api publish:due
```

The command should:

- accept no arbitrary SQL, URL, article ID, or unbounded limit from callers;
- use a small bounded default suitable for 2C4G (for example 25);
- print only stable counts/IDs if IDs are considered safe; never content, slug, credentials, environment values, or database URL;
- exit zero only when its defined batch outcome is successful;
- close database resources in `finally`;
- never start Fastify or require `PUBLIC_ORIGIN`, `MEDIA_ROOT`, or administrator credentials.

Do not activate a systemd timer or modify `compose.yaml` in this phase. `ops/systemd/blog-x-backup.service` and `.timer` show the eventual hardened oneshot/timer pattern, but server activation is a separate deployment decision forbidden by the current milestone constraints. Repository delivery should stop at a safe manually invocable local command plus tests/documented invocation.

## 6. Audit-Ledger Extension

Audit is deliberately strict in four synchronized layers:

1. `packages/contracts/src/audit.ts`: event-name enum, changed-field enum, metadata object;
2. `apps/api/src/audit/audit-repository.ts`: exhaustive event-to-target map and append validation;
3. `apps/api/src/db/schema.ts`: `audit_events_event_check` SQL declaration;
4. next migration: replace/extend the deployed check constraint.

`apps/web/app/admin/audit/page.tsx` has an exhaustive `Record<AuditEventName, string>`, so new events cause a useful type error until a human-readable label exists.

Recommended distinct events are initial schedule, reschedule, cancellation, and due publication. Timestamp metadata may safely include `scheduledAt` and `previousScheduledAt` if the audit page needs to show what changed; keep exact optional ISO fields and preserve the 2048-byte limit. At minimum, add `scheduledAt` to `changedFieldSchema` so schedule events do not fall back to vague status changes.

Scheduled due publication should not fabricate a logged-in system user. Persist the administrator who last established the schedule and use that UUID as the audit actor. Rescheduling updates that responsibility; cancellation produces an audit before clearing it. This choice must be covered by restore/export tests, because losing the actor would make a restored pending job unexecutable or falsely attributed.

As today, only successful operations create events. Invalid times, invalid states, not-found rows, validation failures, and rolled-back worker transitions must create zero audit rows.

## 7. Public Visibility Reuse

`apps/api/src/content/public-repository.ts` exports the shared `publicPredicate`:

```ts
status = 'published'
AND deleted_at IS NULL
AND published_at IS NOT NULL
```

It is consumed by:

- home/list: `listPage()`;
- search: `searchPage()`;
- detail: `findDetailBySlug()`;
- related source and candidates: `relatedBySlug()`;
- RSS/Sitemap source: `distribution()`;
- taxonomy lists and detail pages: `taxonomy-repository.ts`;
- archives: `page-repository.ts`.

Therefore a scheduled draft is already excluded everywhere while its status remains `draft`. Do not scatter `scheduledAt` checks across these consumers.

Defense-in-depth recommendation: add `publishedAt <= current_timestamp` to the one predicate. This closes the existing malformed state where `status='published'` plus a future `publishedAt` is publicly visible. Use database time in queries to avoid per-process clock disagreement. Verify existing fixed-date fixtures remain in the past relative to the test runtime or inject a query clock if deterministic future-boundary testing is required.

Strict response schemas in `packages/contracts/src/public-posts.ts`, `public-discovery.ts`, and `distribution.ts` already reject extra schedule/internal fields. `scheduledAt` and `scheduledByAdministratorId` must never be added to public selections or response contracts.

## 8. Portable Export and Recovery Coupling

The protected portable export is not optional bookkeeping. `distribution-export.test.ts` constructs an independent normalized source map and requires it to equal the strict reparsed manifest. `backup-restore.test.ts` compares source and restored manifests. Pending schedules must survive backup/restore or the blog can silently miss publication after recovery.

Update together:

- `packages/contracts/src/distribution.ts` portable article schema;
- `apps/api/src/content/export-repository.ts` selection and ISO serialization;
- `apps/api/test/distribution-export.test.ts` all fixture rows and independent source map;
- restore equality expectations.

Because the manifest remains `version: 1` and is `.strict()`, new schedule fields need a compatibility decision. Follow the existing `legacyMediaReview` precedent if older v1 exports must remain readable: make newly introduced fields optional on read while always emitting explicit nullable values in new exports. Do not omit an active schedule from new exports.

The raw PostgreSQL dump already retains new columns, but the portable manifest is the independent content-authority proof and must agree with it.

## 9. Admin UI and Responsive Conventions

### Existing editor/list behavior

`ArticleEditor.tsx` owns editable metadata, strict client-side parsing, recovery snapshots, dirty-state protection, and lifecycle callbacks. `ArticleActions.tsx` owns saved-post actions and live announcements. The admin index reuses `ArticleActions variant="list"` for every retained post.

Recommended UI placement:

- show a distinct “预约发布时间” datetime-local control only for saved drafts;
- keep published-time display/correction separate for non-drafts;
- show “已预约：…” in both detail lifecycle and list rows;
- offer “预约发布” when unscheduled, “改期” and “取消预约” when scheduled;
- disable schedule controls while the editor is dirty, saving, or a recovery decision is pending, matching current lifecycle controls;
- announce success/failure via existing `role="status"` regions;
- after any schedule mutation, parse the full `adminPostSchema` response and feed it through the existing `onChanged` path.

Do not make the browser responsible for waiting until the deadline or firing publication. Closing the tab must not affect the schedule.

### Recovery snapshots

`article-editor-recovery.ts` has exact-key validation for editor fields and format version 1. Prefer keeping schedule controls outside unsaved content recovery: scheduling should require an already saved, clean draft and commit immediately through its own endpoint. This avoids changing the recovery format and prevents a restored browser draft from silently changing a live schedule.

If the planner instead makes `scheduledAt` an editable unsaved field, it must version the recovery snapshot and support old v1 snapshots. The separate-action design is lower risk.

### Responsive proof

`admin.module.css` collapses `.metadataGrid`, `.taxonomyFields`, `.lifecycle`, `.postRow`, and `.auditRow` to one column at 720px. New controls should reuse these classes or add a small grid that joins this breakpoint. Keep touch controls at least the existing 44px convention.

`apps/web/e2e/article-lifecycle.spec.ts` already tests the entire visible lifecycle, audit labels, and a 390x844 no-horizontal-overflow assertion. Extend this suite rather than add another browser file. Exercise schedule, reschedule, cancel, list/detail display, disabled-dirty behavior, audit visibility, and mobile overflow through accessible labels/roles.

## 10. Test Fixtures and Exact Inventory

### Existing test owners to extend

| Concern | Best existing test owner | Why |
|---|---|---|
| State/time validation, auth, atomic audit, manual lifecycle collision | `apps/api/test/article-lifecycle.test.ts` | Already owns authenticated article transitions, DB row assertions, strict audit counts, and failure rollback. |
| All public surfaces hidden before due | `apps/api/test/phase2-public-visibility.test.ts` plus `public-discovery.test.ts` | First covers list/taxonomy/archive/detail; second covers search/related/distribution behavior and deterministic ordering. |
| RSS/Sitemap feed source | `apps/api/test/public-distribution.test.ts` and existing Web distribution/browser suite | Both Web feeds derive from one strict distribution DTO. |
| Concurrent/idempotent bounded due execution | extend `article-lifecycle.test.ts` or add one clearly owned DB integration suite | Requires real PostgreSQL row locking; mocks alone cannot prove `SKIP LOCKED`. |
| Portable pending schedule restoration | `distribution-export.test.ts`, `backup-restore.test.ts` | Existing byte/equality authority. |
| Visible responsive management | `apps/web/e2e/article-lifecycle.spec.ts` | Already logs in, operates real UI, inspects audit, and checks 390px overflow. |
| Strict schedule schemas | extend a default contract test or add a new default test with inventory updates | API integration parsing is necessary but a pure test gives fast boundary feedback. |

`scripts/test-inventory.mjs` rejects any unowned `*.test.ts` or `*.spec.ts`. It also encodes owner counts in `scripts/local-verify.mjs` (`canonicalIntegrationSelection`) and exact default children in `scripts/default-test.mjs`. Creating `scheduled-publishing.test.ts` is allowed only if the plan updates every coupled owner/count. Extending existing files avoids that infrastructure expansion.

### Required concurrency matrix

Real-PostgreSQL coverage should prove:

1. not-due rows remain draft and unaudited;
2. a due valid row publishes once;
3. two simultaneous workers publish each row once with one audit event;
4. immediate retry returns zero newly published and preserves `publishedAt`/slug;
5. tied deadlines are processed in stable `(scheduledAt, id)` order within the bound;
6. more-than-limit rows leave a deterministic remainder for the next run;
7. cancelled/rescheduled/manual-published/deleted rows observed by a stale competing worker do not publish again;
8. invalid content or missing attribution fails closed with no status/time/audit mutation;
9. an injected failure between candidate handling steps obeys the documented per-row or batch rollback policy;
10. no result/log contains Markdown, title, slug, credentials, cookies, database URL, or environment secrets.

### Required visibility matrix

Seed a scheduled-but-not-due draft whose title/summary/Markdown/slug/tag/category contain unique sentinels, then prove absence from:

- public list/home;
- public search;
- category list/detail;
- tag list/detail;
- archive;
- public detail (same 404 as unknown);
- related-post candidates;
- distribution DTO (therefore RSS and Sitemap);
- generated RSS and Sitemap in browser/integration coverage.

After the due worker commits, prove the same article appears through normal published projections with no schedule fields leaked.

Use an injected fixed clock in service/worker tests rather than sleeps. Browser tests may choose deadlines comfortably in the future and should test management only; database integration should own due-boundary precision and concurrency.

## 11. Collision and Dependency Notes

1. **`publishedAt` semantics are the largest compatibility collision.** Existing API/E2E tests intentionally create drafts with explicit publication times and assert manual publish preserves them. Plans must update those expectations deliberately, not accidentally.
2. **Audit changes are schema-wide.** Event enum, repository target map, Drizzle check, SQL migration, audit UI exhaustive labels, and tests must land together or builds/migrations fail.
3. **Schedule actor is required after logout/restart.** A local job cannot reuse session auth. Durable attribution must be part of the article/job state and portable recovery authority.
4. **Manual lifecycle actions race with the worker.** Publish, delete, reschedule, and cancel must lock the same article row and clear/recheck schedule fields transactionally.
5. **Public predicate is widely shared.** One careful change covers all surfaces; changing individual routes creates divergence.
6. **Export strictness catches omitted fields.** Adding DB columns without portable schema/repository/test updates breaks exact reconstruction.
7. **Schema verification has hard-coded counts.** New migration/index/constraint requires explicit verifier updates and migration retry tests.
8. **Test inventory is sealed.** New package test paths cascade into default/integration ownership counts and local-delivery evidence.
9. **Current API has a legacy direct `/articles/publish` path in `app.ts` lines 155-183.** It creates already-published rows and writes audit directly. Phase 10 should keep it behaviorally consistent with first-public time and public predicate, but must not route scheduled publication through this HTTP endpoint.
10. **No timer activation belongs in local development.** The code may expose a safe command; enabling systemd/cron/Compose scheduling is a later server/deployment task.

## 12. Recommended Plan Boundaries

### 10-01 — Schema, strict contracts, and portable authority

Own:

- Drizzle article/audit schema changes;
- next SQL migration and schema verifier updates;
- admin schedule/audit contract extensions;
- admin/export repository serialization;
- portable export/restore fixtures and migration verification.

Acceptance: migrated schema is retry-safe; old rows are not auto-scheduled; strict admin/export parsing preserves nullable schedule state and attribution.

### 10-02 — Authenticated schedule lifecycle and responsive management UI

Depends on 10-01. Own:

- service schedule/reschedule/cancel methods with injected clock;
- row-locked repository mutations and audit events;
- protected routes and unsafe-route registry;
- editor/list schedule controls, labels, live state, and audit display;
- API lifecycle and browser responsive tests.

Acceptance: a saved clean draft can be scheduled, viewed, changed, and cancelled; invalid requests leave no row/audit mutation; all visible flows work at desktop and 390px.

### 10-03 — Bounded concurrent due publisher and public invisibility

Depends on 10-01 and should consume the shared publishability policy from 10-02. Own:

- repository due claim/transition;
- DB-only one-shot command and bounded result;
- manual publish/delete schedule clearing;
- defense-in-depth public predicate change;
- real PostgreSQL concurrency/idempotency/failure tests;
- all-public-surface absence/presence tests;
- package scripts and any exact test-runner inventory adjustments.

Acceptance: concurrent/retried jobs converge, preserve first public time and slug, never publish not-due/invalid/stale rows, and scheduled drafts are absent from every public surface until the atomic transition commits.

### Final gate

Run smallest tests after each task, then workspace typecheck/build, boundary checks, the full generated integration/local delivery gate, and code review. Human-only UAT may be recorded, but machine-verifiable responsive and lifecycle paths should not be deferred. The repository must remain explicitly release-blocked and no server/timer/deployment operation is part of Phase 10.

## Requirement Traceability

| Requirement | Concrete implementation/proof path |
|---|---|
| CONT-05 | Separate `scheduledAt`; strict authenticated schedule/cancel endpoints; row-locked service mutation; admin detail/list controls; schedule/reschedule/cancel audit; desktop/mobile Playwright. |
| CONT-06 | Draft status until due commit; shared `publicPredicate`; sentinel absence across list/search/taxonomy/archive/detail/related/distribution/RSS/Sitemap; strict DTOs omit schedule fields. |
| CONT-07 | Bounded ordered `FOR UPDATE SKIP LOCKED` worker; atomic row+audit transition; retry/concurrency matrix; set `publishedAt` once; never rewrite slug. |
| CONT-08 | Existing auth/origin/rate/content-type boundary; durable scheduling actor; shared publishability validation at execution; zero audit/mutation on invalid state/time; defined transactional partial-failure policy and secret-free command output. |

