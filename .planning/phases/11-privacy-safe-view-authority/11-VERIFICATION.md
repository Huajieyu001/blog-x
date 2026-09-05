---
phase: 11-privacy-safe-view-authority
verified: "2026-09-05T16:45:00+08:00"
status: passed
score: "13/13 must-have truths and 5/5 requirements verified"
implementation_revision: adbb3ce290b2b18d6de3bd8723adb278e079d34f
branch: dev
requirements:
  total: 5
  passed: [STAT-01, STAT-02, STAT-03, STAT-04, STAT-06]
  gaps: []
must_haves:
  total: 13
  passed: 13
  gaps: []
automated_checks:
  - command: "corepack pnpm test"
    status: passed
    result: "60/60 pass; zero failed, cancelled, skipped, or TODO; releaseState BLOCKED"
  - command: "corepack pnpm -r typecheck"
    status: passed
    result: "contracts, API, and Web typechecks passed"
  - command: "node --test --test-reporter=tap scripts/local-verify.test.mjs scripts/test-inventory.test.mjs"
    status: passed
    result: "48/48 pass; zero failed, cancelled, skipped, or TODO"
  - command: "corepack pnpm local:verify -- --phase11-data"
    status: prior_pass
    result: "47/47 disposable-data/browser/restore evidence recorded by 11-03; releaseState BLOCKED"
  - command: "final full disposable-Docker Phase 11 rerun at adbb3ce"
    status: not_run_nonblocking
    result: "final source and bounded automated evidence are sufficient; retain as residual verification only"
artifacts:
  - path: packages/contracts/src/analytics.ts
    status: verified
  - path: apps/api/src/db/schema.ts
    status: verified
  - path: apps/api/drizzle/0009_article_daily_views.sql
    status: verified
  - path: apps/api/src/content/view-aggregation-repository.ts
    status: verified
  - path: apps/api/src/analytics/view-request-policy.ts
    status: verified
  - path: apps/api/src/routes/public-views.ts
    status: verified
  - path: apps/api/src/content/view-retention.ts
    status: verified
  - path: apps/api/test/backup-restore.test.ts
    status: verified
  - path: apps/api/test/distribution-export.test.ts
    status: verified
  - path: "apps/web/app/posts/[slug]/ViewBeacon.tsx"
    status: verified
  - path: apps/web/e2e/public-reading.spec.ts
    status: verified
  - path: scripts/local-verify.mjs
    status: verified
human_verification: []
production_release: BLOCKED
---

# Phase 11: Privacy-Safe View Authority Verification

## Verdict

Phase 11 passes goal verification. At revision `adbb3ce`, a successfully rendered public article emits one invisible, credential-omitted same-origin POST; the API admits only transiently classified traffic, reuses the canonical public predicate inside a single PostgreSQL aggregate write, and persists only article/day/source counters. Hidden and unknown content remains response-opaque and uncounted. Retention, complete-database recovery, portable-export exclusion, fixed test ownership, and the local-only `BLOCKED` release boundary are all represented in current code and executable evidence.

This is a goal-achievement verdict, not an inference from completed task checkboxes. All three plans, summaries, research, final review/fix reports, requirements, roadmap, Phase 11 commits, implementation files, and their actual test owners were cross-checked.

## Requirement Accounting

| Requirement | Goal-level evidence | Result |
|---|---|---|
| STAT-01 | `ViewBeacon.tsx` is mounted only after `getPublicPost` returns public detail, sends the relative encoded-slug POST, renders no UI, and omits credentials. `public-reading.spec.ts` exercises a real published navigation, retained-route navigation, a later genuine open, and zero beacons for unavailable pages. `public-visibility.test.ts` independently proves draft, unpublished, deleted, future, null-publication, and unknown slugs are uncounted with identical `204`/empty/`no-store` responses. | PASS |
| STAT-02 | `article_daily_views` contains only article UUID, Shanghai day, total PV, and five fixed source counters. No raw-event table or persistent IP, User-Agent, Referrer URL, cookie, session, fingerprint, or visitor identifier was added. The route is log-silent and only a fixed source enum crosses the repository seam. | PASS |
| STAT-03 | `recordPublicView` uses one `INSERT ... SELECT ... ON CONFLICT DO UPDATE`; total and one validated source bucket increment together. Database constraints enforce nonnegative counters and total/source equality. Parallel database requests prove exact arithmetic. Prefetch/crawler rejection and the dedicated finite, expiring socket-keyed limiter fail closed before database work with opaque responses. | PASS |
| STAT-04 | `cleanup-views` accepts exactly one integer limit in `1..10000` before resource creation. PostgreSQL derives `retained_from_day` as Shanghai current date minus 399, locks an ordered finite batch with `FOR UPDATE SKIP LOCKED`, deletes only older rows, and returns aggregate-only output. Boundary, convergence, idempotence, and concurrent-cleaner tests pass in recorded disposable-database evidence. | PASS |
| STAT-06 | The generated restore fixture seeds multiple articles, days, and source distributions. `backup-restore.test.ts` independently normalizes and deeply compares every restored aggregate row/counter. `distribution-export.test.ts` seeds analytics but keeps `blog-x-portable-export` version 1 backward-compatible and asserts the serialized archive contains no analytics schema, counter, or seeded aggregate value. | PASS |

All five Phase 11 requirement IDs are implemented and verified. `STAT-05` remains correctly outside this phase and assigned to Phase 12.

## Plan Must-Haves

### Plan 11-01 — aggregate authority (4/4)

| Must be true | Code/test cross-reference | Result |
|---|---|---|
| A strict same-origin empty POST for a public slug adds one anonymous PV and returns empty `204`/`no-store`. | Strict Zod slug/body contracts; `public-views.ts`; the disposable PostgreSQL request-to-row assertion in `public-visibility.test.ts`. | PASS |
| Unknown and every non-public lifecycle state are indistinguishable and never mutate aggregates. | The repository write embeds exported `publicPredicate` (`published`, undeleted, non-null publication, `<= CURRENT_TIMESTAMP`); integration coverage includes draft, unpublished, deleted, future, null-publication, and unknown. | PASS |
| Durable analytics is exactly one article/day row whose total equals five fixed buckets. | Drizzle schema, migration `0009`, composite primary key, six counters, nonnegative check, and total-equals-source-sum check agree. | PASS |
| Concurrent accepted requests cannot lose increments or expose intermediate mismatch. | One PostgreSQL conflict update increments total and the selected fixed column atomically; 24 parallel requests produce exact `25 == source_sum`. | PASS |

The Plan 11-01 prohibitions also hold: there is no event/visitor table, host-calendar calculation, JavaScript read-add-write, queue, resident analytics service, third-party endpoint, new dependency, server operation, deployment, or production authorization. Generated SQL, snapshot, journal, runtime schema inventory, and ten-migration authority are mutually cross-checked by `local-verify.test.mjs`.

### Plan 11-02 — transient request boundary (4/4)

| Must be true | Code/test cross-reference | Result |
|---|---|---|
| Only exact same-origin, valid, non-prefetch, non-recognised-crawler traffic reaches the writer. | `classifyAnonymousViewRequest` performs exact origin equality and rejects `Purpose`, `Sec-Purpose`, `Next-Router-Prefetch`, and the fixed crawler token list before rate limiting/database work. | PASS |
| Referrers collapse in memory to five fixed coarse categories. | Exact/dot-subdomain search and social roots prevent lookalikes; malformed/non-HTTP referrers become `direct`; only `direct|internal|search|social|external` is passed to `recordPublicView`. | PASS |
| Dedicated limiter capacity and expiry are finite and fail closed opaquely. | `BoundedRateLimitStore` is process-local, timer-free, capacity 4096 by default, fixed at 120/minute for anonymous views, prunes expired entries, and exposes no retry hint on the view route. | PASS |
| Default tests exactly own and execute the privacy/security contract. | `public-view-security.test.ts` is a single `api-unit/default/null-owner` inventory entry and a sealed API child. Omission, duplication, owner drift, default/integration swaps, zero tests, skips, and TODOs fail closed. | PASS |

Raw Origin, Referer, User-Agent, socket address, cookie, session, and private ingress headers are inspected only transiently. They are absent from the writer arguments, aggregate schema, audit events, results, and route output. The view route does not invoke administrator mutation/session/CSRF semantics and makes no UV, complete-bot-detection, anti-fraud, attribution, geography, or billing claim.

The post-review proxy fix is also goal-relevant: the Web edge globally strips caller-supplied forwarding/private headers, production requires a timing-safe authenticated ingress handshake carrying exactly one canonical IP address, and the API trusts only an exact private Web address. The API/PostgreSQL services are not host-published. Invalid/missing production proxy authority fails closed. Unit and verifier contracts exercise header scrubbing, canonical address validation, secret authentication, exact trusted-proxy CIDR validation, source sealing, and release `BLOCKED`.

### Plan 11-03 — lifecycle, recovery, and browser delivery (5/5)

| Must be true | Code/test cross-reference | Result |
|---|---|---|
| Cleanup is bounded, Shanghai-calendar authoritative, retains exactly 400 dates, and converges to zero. | Strict CLI parser plus one ordered `SKIP LOCKED` CTE/delete statement; disposable tests cover pre-boundary, boundary, current day, repeated runs, and two cleaners. | PASS |
| Complete backup/isolated restore preserves every article/day/source row exactly. | The runner seeds three aggregate rows across two articles and two days; restore comparison checks exact keys and all six counters independently of portable export. | PASS |
| Portable export remains content-only version 1 and backward compatible. | Export is reparsed through the existing strict v1 contract; legacy missing optional scheduling/media-review fields still parse; analytics table/fields/seed values are explicitly absent. | PASS |
| A rendered public article sends one invisible credential-omitted same-origin beacon per open; unavailable pages send none. | Client component uses relative URL, exact `{}`, `credentials: "omit"`, `cache: "no-store"`, no retry/UI, and a slug-aware replay guard. Browser evidence asserts published and retained-route opens, no Cookie/Authorization, `Origin`, `204`/`no-store`, no failed request, and zero unavailable-page beacons. Database evidence completes future/null-publication coverage. | PASS |
| Focused/canonical local gates bind exact schema, migration, recovery, browser, and inventory authority and remain production `BLOCKED`. | `phase11Selection("data")` seals public visibility, distribution export, backup restore, public-reading browser, and verifier suites. It rejects caller-selected paths/conflicting modes/non-pass counts and binds SHA-256 hashes for the current `.next` plus `server.mjs` read-only runtime snapshot. | PASS |

No cleanup queue, scheduler, resident analytics process, cross-origin browser URL, credentialed beacon, portable analytics section, export version bump, caller-selected verifier path, server connection, production deployment, or `main` mutation was found.

## Actual Implementation Links

| From | To | Verified behavior |
|---|---|---|
| `ViewBeacon.tsx` | `/api/public/articles/{encodedSlug}/view` | Relative, empty JSON, credential-omitted, no-store, invisible fire-and-forget request. |
| `public-views.ts` | `view-request-policy.ts` | Raw transient headers collapse to ignore or one fixed source enum. |
| `public-views.ts` | `rate-limiter.ts` | Dedicated `anonymous-view` key uses the trusted canonical `request.ip`; exhaustion remains opaque. |
| `public-views.ts` | `view-aggregation-repository.ts` | Only validated slug/source reach the writer; failures are swallowed into the same empty response. |
| `view-aggregation-repository.ts` | `public-repository.ts` | The exact shared `publicPredicate` is embedded in the write statement. |
| `view-aggregation-repository.ts` | `article_daily_views` | PostgreSQL supplies Shanghai day and atomic upsert/cleanup authority. |
| `local-verify.mjs` | backup/restore/export/browser suites | Generated namespaces, exact owners, independent restore equality, current Web runtime digest, and `BLOCKED` result are sealed together. |

## Automated Evidence

Current-revision checks run during this verification:

- `corepack pnpm test`: 60/60 passed across the exact 41-file inventory accounting (11 default, 30 integration); zero fail/cancel/skip/TODO; production `BLOCKED`.
- `corepack pnpm -r typecheck`: contracts, API, and Web passed.
- `node --test --test-reporter=tap scripts/local-verify.test.mjs scripts/test-inventory.test.mjs`: 48/48 passed, including Phase 11 selection/runtime sealing, migration authority, topology, and exact ownership.
- `git diff --check`: passed; the worktree remained clean before creation of this report.

Recorded implementation evidence additionally includes:

- Phase 11 disposable data/browser/restore gate: 47/47 passed with release `BLOCKED`.
- Canonical generated integration: 60/60 passed with generated cleanup acknowledgement.
- Default suite after all review fixes: 60/60 passed.
- Final focused Web runtime and Phase 11 verifier suites: 44 passed.
- Workspace typechecks, Compose parsing, repository boundary scan (519 files, zero findings), exact migration generation, and fixed local health/root probes passed in execution/review evidence.
- Final deep review inspected 36 files and reported zero critical, warning, or informational findings after CR-01, WR-01, and WR-02 were fixed.

## Residual Verification

The complete disposable-Docker `--phase11-data` gate was not rerun after the final small Compose/API-address stability change and final review-fix commit. This is nonblocking residual verification, not a goal gap: the final source has current-revision unit/type/inventory coverage, the runner seals the built Web runtime and authenticated ingress topology, prior disposable database/browser/restore evidence exists, and the final independent deep review found no remaining issue. A later local-only run of `corepack pnpm local:verify -- --phase11-data` may renew the end-to-end receipt for `adbb3ce`; it must not contact either server or change production state.

## Human Verification

None. The beacon is intentionally invisible, and its observable network, privacy, lifecycle, persistence, concurrency, retention, and recovery properties are deterministic and covered by automated or inspectable evidence. No subjective UAT is required for Phase 11.

## Production Boundary

Production remains `BLOCKED`. No server connection, credential use, deployment, `main` mutation, destructive production command, or release authorization occurred during this verification. A future production ingress must supply and overwrite the canonical client-address handshake using externally managed secret authority; that remains a deployment gate outside Phase 11 execution.

---

*Final verification: 2026-09-05T16:45:00+08:00*
