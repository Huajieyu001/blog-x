---
phase: quick
plan: "260816-rz2-stage-route-validation-so-stale-prefligh"
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
  tokens: 5200
  tasks: 2
  confidence: high
user_setup: []
must_haves:
  truths:
    - "Raw route collection is observation-only: it requests the seven fixed same-origin paths with redirect:error, bounds every body, records status and body SHA-256, and parses a body only when its media type declares JSON; stale HTML or JSON 404 responses do not abort preflight merely for missing final contracts."
    - "Preflight and postMigration accept structurally valid route observations and require exact observation equality. Rollback requires exact equality with the original preflight observations, including status, body digest and parsed-JSON contract digest/null state."
    - "Strict final contracts apply only after cutover and at terminal proof boundaries: HTML routes are exact 200; health and empty search are exact 200 JSON contracts; unknown related is the exact 404 JSON contract."
    - "Sanitized route projections remain deterministic: all routes retain status/body digest, API routes always retain a contract digest or null according to observed JSON, and raw bodies never enter reports or evidence."
    - "Successful v4 evidence permits stale but equal preflight/postMigration observations, requires strict postCutover routes, and the sealed verifier rejects stale current routes or forged final route contracts."
    - "Failure recollection can hash sanitized preflight/current/rollback projections even when preflight routes are stale; the report remains schema-exact and contains only digests, never route bodies, URLs, headers or credentials."
    - "The consumed revision `b6a72d43dca668cd0208226c2813c848e11e7921` remains historical: its claim/failure report are not read, removed, changed or retried, and all earlier attempts/reports/evidence remain untouched."
    - "Implementation and validation are fake-boundary/static only: no Docker/Compose, no-option refresh, claim/report/evidence CLI, browser/network/server/SSH/deploy/push/unfreeze or production action occurs; release remains `BLOCKED`."
  artifacts:
    - path: scripts/refresh-local-facts.mjs
      provides: separate observation-shape and final-contract validation plus stage-aware sanitized projections
    - path: scripts/refresh-local-runtime-core.mjs
      provides: content-aware raw route observation, stale-safe failure projection and stage-strict v4 evidence/verifier enforcement
    - path: scripts/refresh-local.test.mjs
      provides: stale preflight, build reachability, cutover, rollback, failure-report and verifier regressions
  key_links:
    - from: scripts/refresh-local-runtime-core.mjs
      to: scripts/refresh-local-facts.mjs
      via: routeSource emits observation facts; runtime selects observation or final validation by lifecycle stage
      pattern: "routeSource|assertRouteObservations|assertRouteFacts|routeContract"
    - from: scripts/refresh-local-facts.mjs
      to: ops/phase6-local-refresh-evidence.json
      via: deterministic sanitized projection uses nullable API contract digests for old observations and exact digests for final routes
      pattern: "projectSanitizedFacts|contractSha256|postCutover"
    - from: scripts/refresh-local.test.mjs
      to: scripts/refresh-local-runtime-core.mjs
      via: the fake live flow serves stale old routes before cutover and final routes afterward, proving build and terminal boundaries
      pattern: "preflight|postMigration|postCutover|rollback|verifyEvidence"
  prohibitions:
    - statement: "Do not invoke Docker/Compose, the no-option refresh, claim/report/evidence inspection, a browser, network request or any server/deployment command."
      status: pending
      verification: review
    - statement: "Do not weaken postCutover, final evidence or sealed verifier route contracts, and do not normalize a stale final runtime into success."
      status: pending
      verification: test
    - statement: "Do not persist raw route bodies, content types, headers, URLs or error pages in failure reports/evidence; retain bounded digests and sanitized contract digests only."
      status: pending
      verification: test
    - statement: "Do not alter application routes, Compose/Docker/build/migration/rollback commands, evidence version, release authority, protected history, active 06-11 plan, REQUIREMENTS, ROADMAP or STATE."
      status: pending
      verification: command
---

<objective>
Make sealed local-refresh route validation lifecycle-aware so an intentionally stale fixed runtime can be observed and refreshed, while final cutover/evidence/verifier authority remains strict.

Purpose: A future clean revision must reach offline builds even when the old runtime returns 404 for Phase 6 search/related routes, then prove the new runtime satisfies every final route contract or restore the exact old observations on rollback.
Output: One tests-only RED commit, one GREEN implementation commit across three exact files, and a quick-task summary; no runtime artifact or infrastructure action.
</objective>

<execution_context>
@/Users/xanadu/Desktop/ai-coding/blog-x/.codex/gsd-core/workflows/execute-plan.md
@/Users/xanadu/Desktop/ai-coding/blog-x/.codex/gsd-core/templates/summary.md
</execution_context>

<context>
@AGENTS.md
@.planning/STATE.md
@.planning/phases/06-public-discovery-data/06-11-PLAN.md
@.planning/quick/260816-rol-correct-sealed-refresh-archive-route-con/260816-rol-correct-sealed-refresh-archive-route-con-SUMMARY.md
@scripts/refresh-local-facts.mjs
@scripts/refresh-local-runtime-core.mjs
@scripts/refresh-local.test.mjs
@ops/release-evidence.blocked.json

<interfaces>
- Split route authority into two explicit layers in `refresh-local-facts.mjs`. `assertRouteObservations` (name may vary, semantics may not) requires exactly the existing seven canonical keys, an integer non-redirect HTTP status, a lowercase SHA-256 body digest, and an optional JSON body only when collection decoded JSON. `assertRouteFacts` composes that structural check with the existing exact final HTML/API status and body contracts.
- `collectRefreshFacts` invokes observation validation only. `assertPersistenceTransition(..., { stage: "postMigration" })` keeps exact raw route equality before cutover; `postCutover` invokes strict final validation; `rollback` requires an explicit preflight route baseline and exact restoration rather than treating a missing baseline as acceptable.
- Make sanitized projection mode explicit, for example `projectSanitizedFacts(facts, { routeContract: "observed" | "final" })`, with a fail-closed default of `final`. Every projected HTML route has exact keys `status` and `bodySha256`. Every projected API route has exact keys `status`, `bodySha256` and `contractSha256`; the last value is a lowercase SHA-256 of canonical parsed JSON or `null` for a non-JSON observation. Raw route bodies never leave in-memory facts.
- `routeSource` preserves the exact fixed route list, same-origin final URL checks, `redirect: "error"` and 1 MiB bound. It no longer parses by `/api/` prefix. It inspects the response media type case-insensitively (accepting `application/json` and `+json`, ignoring parameters), parses only JSON-declared bodies, rejects malformed JSON declared as JSON, and leaves HTML/text bodies unparsed. Do not follow redirects or accept alternate origins.
- During failure recollection, project preflight/current/rollback with observation mode before hashing so stale routes cannot erase the sanitized baseline. Preservation logic and the canonical failure-report schema remain unchanged; reports still contain only three nullable SHA-256 values.
- During successful evidence publication, project preflight and postMigration in observation mode, require their projected routes to be exactly equal, and project postCutover in final mode. Evidence remains strict deterministic v4: preflight/postMigration API `contractSha256` may be null, while postCutover must have the exact statuses and canonical contract digests for health/search/related plus 200 HTML routes.
- `assertEvidenceSchema` validates generic deterministic projection shape for the first two stages, exact route equality across them, and strict projected final contracts for postCutover. `verifyRawRefreshEvidence` reconstructs current facts using the raw source, then applies final projection/contract validation before exact comparison with evidence postCutover.
- Update the fake live fixture so snapshot/pre-cutover responses model the old runtime: search is a 404 HTML response and related is a 404 JSON response (also cover the inverse/content variation in a focused source test). After cutover it serves exact final bodies. On rollback it returns byte-identical old statuses/bodies/media types. Response doubles expose realistic `headers.get("content-type")` behavior.
- Do not update 06-11 PLAN: its final same-origin route proof remains correct and it does not require final contracts at preflight. Do not rewrite old quick summaries or any consumed-attempt record.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Commit RED lifecycle-aware stale route tests</name>
  <files>scripts/refresh-local.test.mjs</files>
  <behavior>
    - "Observation collection accepts bounded same-origin stale search/related 404 responses in HTML and JSON forms without an unconditional JSON parse failure; malformed JSON declared as JSON still fails."
    - "A fake refresh with stale preflight/postMigration routes reaches build-api/build-web and cutover; equal old observations pass before cutover, but drift between preflight and postMigration fails."
    - "PostCutover rejects stale HTML/API status or contract drift, while rollback after a later failure restores the exact preflight observation object."
    - "Failure recollection returns sanitized non-null preflight/current digests for stale routes, and neither report bytes nor projections contain raw HTML/JSON bodies."
    - "Successful evidence stores equal stale preflight/postMigration projections, strict final postCutover routes, and verifier reconstruction rejects stale current routes or forged final contract digests."
  </behavior>
  <action>
    Add focused facts/source and fake-live lifecycle tests before changing production behavior. Introduce distinct stale and final route fixtures with realistic content-type headers, fetch-stage tracing and rollback restoration assertions. Require the tests to demonstrate that the current collector fails during preflight before any build, and that projection/failure/evidence cases fail specifically because current validation is globally final-strict. Commit only `scripts/refresh-local.test.mjs` as `test(quick-260816-rz2): expose stale preflight route gate`.
  </action>
  <verify>
    <automated>node --test scripts/refresh-local.test.mjs</automated>
    <manual>RED is valid only when stale inputs are structurally realistic, route-source/fake-flow production paths are reached, and failures originate from global final validation or unconditional API JSON parsing; fixture syntax and infrastructure access do not qualify.</manual>
  </verify>
  <done>A tests-only commit locks observation parsing, build reachability, exact pre-cutover/rollback equality, strict postCutover, sanitized failure digests and strict verifier behavior.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement stage-aware observation and final route authority</name>
  <files>scripts/refresh-local-facts.mjs, scripts/refresh-local-runtime-core.mjs, scripts/refresh-local.test.mjs</files>
  <behavior>
    - "Raw collection and stale-safe sanitized projection validate observations without claiming final route success."
    - "Preflight/postMigration equality and rollback restoration are exact; postCutover and verifier authority remain final-strict."
    - "Failure reports retain sanitized stale-baseline digests; v4 success evidence is deterministic and strict at its final stage."
    - "The fake refresh reaches builds from stale preflight and completes only after exact final routes."
  </behavior>
  <action>
    Implement the interfaces above with small explicit observation/final validators and projection modes. Replace path-based unconditional JSON parsing with media-type-aware parsing, wire observation mode only into failure and pre-cutover evidence paths, and keep final mode fail-closed for postCutover publication and read-only reconstruction. Preserve the route list, body bound, evidence version, command policy, persistence rules and release state. Commit the GREEN change as `fix(quick-260816-rz2): stage strict route validation`.
  </action>
  <verify>
    <automated>node --test scripts/refresh-local.test.mjs &amp;&amp; node --test scripts/local-verify.test.mjs &amp;&amp; corepack pnpm -r typecheck &amp;&amp; node scripts/check-boundaries.mjs &amp;&amp; node scripts/release-gate.mjs --evidence=ops/release-evidence.blocked.json --expect-blocked &amp;&amp; git diff --check</automated>
    <manual>Review the scoped diff and fake call trace: builds occur after stale preflight, no strict check moved later than postCutover, no raw body enters an artifact, only the three declared files changed, and no infrastructure/network command ran.</manual>
  </verify>
  <done>All focused/regression/static checks are GREEN; stale old routes can be refreshed, final routes remain strict, reports/evidence stay sanitized, and protected runtime/history artifacts are unchanged.</done>
</task>

</tasks>

<threat_model asvs_level="1" block_on="high">
| ID | Category | Component | Severity | Disposition | Mitigation / verification |
|---|---|---|---|---|---|
| T-Q-RZ2-01 | Spoofing | final route authority | high | mitigate | Observation acceptance is stage-limited; postCutover/evidence/verifier require exact statuses and canonical JSON contract digests. |
| T-Q-RZ2-02 | Tampering | pre-cutover/rollback routes | high | mitigate | Exact raw and projected equality preflight→postMigration; rollback must equal the explicit preflight baseline. |
| T-Q-RZ2-03 | Information disclosure | stale response bodies | high | mitigate | 1 MiB bound; projection stores body and canonical-contract digests only; reports contain projection digests only. |
| T-Q-RZ2-04 | Repudiation | consumed failed attempt | high | mitigate | `b6a72d4` claim/report and every old attempt remain untouched; future execution requires a new revision. |
| T-Q-RZ2-05 | Elevation of privilege | infrastructure scope | high | mitigate | Unit/fake/static checks only with explicit Docker/network/server/refresh prohibition. |
</threat_model>

<verification>
- RED and GREEN commits are separate and ordered; RED changes tests only and GREEN changes only the three declared files.
- Focused refresh tests, local-verifier regression, workspace typecheck, boundary scan, canonical BLOCKED release gate and diff check pass.
- Test traces prove stale preflight reaches both build steps, preflight/postMigration routes are identical, rollback is byte/digest exact, and postCutover/verifier reject stale or forged final routes.
- Sanitization assertions find no raw stale HTML, JSON error bodies, response headers, URL/origin strings, mounts, commands or credentials in failure-report/evidence bytes beyond already authorized fixed metadata.
- Protected paths remain byte-identical: old quick plans/summaries, Phase 6 plans/summaries, `.planning/milestones`, `ops/phase5-full-gate-receipt.json`, `ops/phase6-local-refresh-evidence.json`, `06-VERIFICATION.md`, REQUIREMENTS, ROADMAP, STATE and `ops/release-evidence.blocked.json`.
- No command accesses `/private/tmp/blog-x-refresh-attempts/b6a72d43dca668cd0208226c2813c848e11e7921.json` or its failure report, and no same-revision retry occurs.
</verification>

<success_criteria>
- Stale fixed-runtime search/related 404 observations no longer fail preflight solely for absent final contracts or HTML JSON parsing.
- Preflight and postMigration observations match exactly; rollback restores the exact preflight observations.
- PostCutover, successful v4 evidence and sealed verification still require exact final HTML/health/search/related contracts.
- Failure reports can carry sanitized stale-baseline digests without raw route content.
- Historical attempts and all protected artifacts remain untouched; implementation/testing performs no infrastructure, real artifact, network/server or deployment action; release stays `BLOCKED`.
</success_criteria>

<output>
After implementation, create `.planning/quick/260816-rz2-stage-route-validation-so-stale-prefligh/260816-rz2-stage-route-validation-so-stale-prefligh-SUMMARY.md`. The quick executor commits RED and GREEN tasks atomically and does not update ROADMAP or STATE; the quick orchestrator owns later docs/state handling.
</output>
