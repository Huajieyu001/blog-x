---
phase: quick
plan: "260816-rol-correct-sealed-refresh-archive-route-con"
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/refresh-local-facts.mjs
  - scripts/refresh-local-runtime-core.mjs
  - scripts/refresh-local.test.mjs
autonomous: true
requirements: []
estimate:
  tokens: 4800
  tasks: 2
  confidence: high
user_setup: []
must_haves:
  truths:
    - "The sealed refresh route authority requests and requires canonical `/archives` with HTTP 200 and a bounded body digest; it never requests or persists singular `/archive`."
    - "Strict raw facts, sanitized projections, evidence v4 schema validation and read-only verifier reconstruction all use the identical `/archives` key; singular `/archive`, or both keys together, fail as unexpected/missing route authority."
    - "Tests trace the real route-source fetch list and prove `/archives` is present exactly once while `/archive` is absent, matching application navigation, Sitemap and browser E2E contracts."
    - "Only current implementation/tests change. The active 06-11 plan contains no exact singular route and needs no correction; older 06-05/06-06/06-08 plans remain immutable historical audit records rather than being rewritten."
    - "The terminally consumed revision `eb6ea25b6fc15d9f1c77a21f82eb3fd5722a912c` remains historical: its claim/failure report are not read, removed, edited or retried. Any later attempt requires the new committed implementation revision and separate authorization."
    - "Implementation and verification are fake-boundary/static only: no Docker/Compose, bare refresh, real claim/report/evidence, browser/network/server/SSH/deploy/push/unfreeze or production action occurs, and release remains `BLOCKED`."
  artifacts:
    - path: scripts/refresh-local-facts.mjs
      provides: canonical raw and projected `/archives` route contract with strict unknown-key rejection
    - path: scripts/refresh-local-runtime-core.mjs
      provides: `/archives` fetch source plus matching strict evidence/verifier route schema
    - path: scripts/refresh-local.test.mjs
      provides: RED/GREEN route-source, projection, evidence and verifier regression coverage
  key_links:
    - from: scripts/refresh-local-runtime-core.mjs
      to: http://127.0.0.1:3100/archives
      via: sealed routeSource fetches the canonical plural page and records its bounded status/body digest
      pattern: "routeSource|/archives|redirect.*error"
    - from: scripts/refresh-local-facts.mjs
      to: scripts/refresh-local-runtime-core.mjs
      via: raw fact validation, sanitized projection and evidence schema share one exact plural route-key set
      pattern: "ROUTE_KEYS|assertRouteFacts|/archives"
    - from: scripts/refresh-local.test.mjs
      to: scripts/refresh-local-runtime-core.mjs
      via: fake fetch tracing and v4 verification fixtures prove plural presence and singular exclusion
      pattern: "/archives|/archive|routes|verify"
  prohibitions:
    - statement: "Do not invoke Docker/Compose, the no-option refresh, a browser or network request, and do not inspect or mutate the old revision claim/report or final evidence."
      status: pending
      verification: review
    - statement: "Do not accept `/archive` as an alias, probe both paths, tolerate either key, redirect-follow the singular route, or keep singular data in evidence for compatibility."
      status: pending
      verification: test
    - statement: "Do not rewrite historical plans, summaries, evidence or failure reports; current 06-11 documentation changes only if an exact active singular contract is discovered before execution."
      status: pending
      verification: command
    - statement: "Do not modify application routing/navigation/Sitemap/E2E files, persistence behavior, evidence version, release authority, REQUIREMENTS, ROADMAP or STATE."
      status: pending
      verification: command
---

<objective>
Correct the sealed local-refresh archive route contract from singular `/archive` to canonical plural `/archives` under a tiny TDD change, without touching the consumed attempt or infrastructure.

Purpose: Let a future clean revision validate the actual fixed 3100 archive page consistently with navigation, Sitemap and existing browser E2E, while preserving strict evidence reconstruction.
Output: One tests-only RED commit, one GREEN implementation commit across three exact files, and a quick-task summary; no runtime, claim, report or evidence artifact.
</objective>

<execution_context>
@/Users/xanadu/Desktop/ai-coding/blog-x/.codex/gsd-core/workflows/execute-plan.md
@/Users/xanadu/Desktop/ai-coding/blog-x/.codex/gsd-core/templates/summary.md
</execution_context>

<context>
@AGENTS.md
@.planning/STATE.md
@.planning/phases/06-public-discovery-data/06-11-PLAN.md
@.planning/quick/260816-pzr-support-docker-compose-v5-ndjson-ps-outp/260816-pzr-support-docker-compose-v5-ndjson-ps-outp-SUMMARY.md
@scripts/refresh-local-facts.mjs
@scripts/refresh-local-runtime-core.mjs
@scripts/refresh-local.test.mjs
@apps/web/app/_components/PublicHeader.tsx
@apps/web/app/sitemap.ts
@apps/web/app/archives/page.tsx
@apps/web/e2e/public-shell.spec.ts
@ops/release-evidence.blocked.json

<interfaces>
- Replace the route key literal in both strict `ROUTE_KEYS` definitions, `assertRouteFacts` HTML route loop and sealed `routeSource` list: `/archive` becomes `/archives`. Do not add fallback, alias, redirect handling or a second request.
- `assertRouteFacts` requires exactly seven route keys with `/archives`; a singular-only object fails for missing plural authority, and an object containing both singular and plural fails for the unexpected singular key. `/archives` retains the existing HTML contract: status exactly 200 and a lowercase SHA-256 body digest.
- `projectSanitizedFacts` carries only `/archives`. Evidence v4 strict route projection/schema and stage equality therefore require plural across preflight, postMigration and postCutover; old/synthetic evidence containing singular `/archive` is rejected rather than normalized.
- Read-only verifier reconstruction uses the same sealed route source and exact projected-key comparison. Tests alter raw fake fetch results/fixture keys and prove plural status/body drift fails through the real verifier path.
- Update `exactRoutes`, raw `routeBodies`, v4 evidence builders and any route assertion snapshots in `refresh-local.test.mjs` to plural. Add explicit tests that fetch tracing contains `http://127.0.0.1:3100/archives` exactly once and no URL whose pathname is `/archive`.
- Do not edit current active Phase 6 documents unless a fresh exact-literal scan finds `/archive` in 06-11 PLAN/SUMMARY. The current scan found none, so the expected implementation diff is only the three declared code/test files; older phase plans remain truthful records of the contracts they originally planned.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Commit RED plural archive-route authority tests</name>
  <files>scripts/refresh-local.test.mjs</files>
  <behavior>
    - "Raw exact route facts with `/archives` pass; singular-only `/archive` and dual singular/plural objects fail strict key validation."
    - "The sealed fake route source requests `/archives` exactly once and never requests `/archive`."
    - "Sanitized projection and strict v4 evidence/verifier fixtures expose `/archives` only and reject singular route drift."
    - "All existing API, category, tag and root route contracts remain byte-for-byte equivalent apart from the archive key replacement."
  </behavior>
  <action>
    Add focused assertions before changing production literals. Convert the canonical positive fixture to `/archives`, add singular-only and dual-key negative cases for `assertRouteFacts`, trace fake fetch URLs from the real raw route source, and add an evidence/verifier case that fails if singular `/archive` is stored or reconstructed. Update only test setup necessary to reach the current code, then run the focused suite and require RED failures attributable to the current singular production key. Commit only `scripts/refresh-local.test.mjs` as `test(quick-260816-rol): expose singular archive route contract`.
  </action>
  <verify>
    <automated>node --test scripts/refresh-local.test.mjs</automated>
    <manual>RED is valid only if plural positive/fetch/evidence cases reach current production code and fail because it still owns `/archive`; fixture syntax or infrastructure access does not qualify.</manual>
  </verify>
  <done>A tests-only commit locks plural route authority, singular exclusion and v4 reconstruction behavior without changing implementation or historical artifacts.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Replace the sealed route key and restore GREEN</name>
  <files>scripts/refresh-local-facts.mjs, scripts/refresh-local-runtime-core.mjs, scripts/refresh-local.test.mjs</files>
  <behavior>
    - "Facts, source collection, projection, evidence schema and verifier all agree on exact `/archives`."
    - "The singular key is neither requested nor accepted anywhere in active refresh implementation/tests."
    - "Every non-archive route and all release/persistence/failure contracts remain unchanged."
  </behavior>
  <action>
    Perform the literal singular-to-plural replacement only in active refresh facts/runtime contracts and corresponding fixtures. Keep key counts, status/body rules, route order, redirect:error behavior, evidence version and exact unknown-key rejection intact. Run a scoped static scan over the three declared files and require no standalone `/archive` literal remains; exclude historical planning documents from this source gate. Do not modify app routing because it is already canonical. Commit the GREEN implementation as `fix(quick-260816-rol): correct sealed archive route contract`.
  </action>
  <verify>
    <automated>node --test scripts/refresh-local.test.mjs &amp;&amp; node --test scripts/local-verify.test.mjs &amp;&amp; corepack pnpm -r typecheck &amp;&amp; node scripts/check-boundaries.mjs &amp;&amp; node scripts/release-gate.mjs --evidence=ops/release-evidence.blocked.json --expect-blocked &amp;&amp; git diff --check</automated>
    <manual>Review the scoped diff/static scan: only the three declared files changed, active refresh code/tests contain plural authority only, historical docs remain untouched, and no infrastructure/network command ran.</manual>
  </verify>
  <done>All focused/regression/static checks are GREEN; plural `/archives` is the sole active refresh/evidence route key; old attempt and protected artifacts remain unchanged.</done>
</task>

</tasks>

<threat_model asvs_level="1" block_on="high">
| ID | Category | Component | Severity | Disposition | Mitigation / verification |
|---|---|---|---|---|---|
| T-Q-ROL-01 | Spoofing | route authority | high | mitigate | One canonical plural route in facts/source/schema; singular and dual-key inputs fail closed. |
| T-Q-ROL-02 | Tampering | evidence reconstruction | high | mitigate | Same strict ROUTE_KEYS in projection and v4 verifier; no compatibility normalization. |
| T-Q-ROL-03 | Repudiation | consumed attempt | high | mitigate | `eb6ea25` claim/report remain immutable; future execution requires a new revision and plan. |
| T-Q-ROL-04 | Elevation of privilege | infrastructure scope | high | mitigate | Fake-boundary unit/static checks only; explicit Docker/network/server/deploy prohibition. |
</threat_model>

<verification>
- RED and GREEN commits are separate and ordered; RED modifies tests only and GREEN modifies only the three declared files.
- Focused refresh tests, local-verifier regression, workspace typecheck, boundary scan, canonical BLOCKED release gate and diff check pass.
- Scoped source scan finds `/archives` and no standalone `/archive` in `refresh-local-facts.mjs`, `refresh-local-runtime-core.mjs` or `refresh-local.test.mjs`.
- Protected paths remain byte-identical: historical Phase 6 plans/summaries, `.planning/milestones`, `ops/phase5-full-gate-receipt.json`, `ops/phase6-local-refresh-evidence.json`, `06-VERIFICATION.md`, REQUIREMENTS, ROADMAP, STATE and `ops/release-evidence.blocked.json`.
- No command accesses `/private/tmp/blog-x-refresh-attempts/eb6ea25b6fc15d9f1c77a21f82eb3fd5722a912c.json` or its failure report, and no same-revision retry occurs.
</verification>

<success_criteria>
- `/archives` is the sole exact archive route in active refresh facts, collection, projection, evidence schema and verifier fixtures.
- `/archive` is neither requested nor accepted, while all other route contracts remain unchanged.
- Historical planning/evidence and the consumed `eb6ea25` attempt remain untouched.
- Implementation/testing performs no Docker, bare refresh, real artifact, network/server or deployment action; release stays `BLOCKED`.
</success_criteria>

<output>
After implementation, create `.planning/quick/260816-rol-correct-sealed-refresh-archive-route-con/260816-rol-correct-sealed-refresh-archive-route-con-SUMMARY.md`. The quick executor commits RED and GREEN tasks atomically and does not update ROADMAP or STATE; the quick orchestrator owns later docs/state handling.
</output>
