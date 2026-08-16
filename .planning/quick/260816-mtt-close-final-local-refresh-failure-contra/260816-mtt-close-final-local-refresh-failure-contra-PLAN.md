---
phase: quick
plan: "260816-mtt-close-final-local-refresh-failure-contra"
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/refresh-local-runtime-core.mjs
  - scripts/refresh-local-live.mjs
  - scripts/refresh-local.mjs
  - scripts/refresh-local-test-core.mjs
  - scripts/refresh-local.test.mjs
autonomous: true
requirements: []
estimate:
  tokens: 16000
  tasks: 2
  confidence: medium
user_setup: []
must_haves:
  truths:
    - "Failure-report present verification reads the canonical real claim for the exact revision and accepts the report only when its `claimSha256` equals the digest recomputed from those claim bytes; missing, unsafe, noncanonical or mismatched claims fail closed."
    - "The production refresh and evidence-verifier exports are sealed and expose no `collectFacts`, `targetProbe`, `probeTargets` or precomputed-fact injection path. Tests replace only raw process/filesystem/fetch/clock/random boundaries through the explicitly test-only core."
    - "Raw-boundary tests trace raw lockfile reads, original seed-reference inspection and the complete production collector/verifier command set; drift tests change raw bytes or raw command responses and therefore cannot pass by injecting expected fact objects."
    - "Every failure after a successfully published claim—adapter construction, local Docker authority, collector, both builds, migration, schema, cutover, routes, release, rollback, evidence and failure-report publication—retains the canonical claim and yields a strict sanitized report or an artifact-specific unrecoverable invariant."
    - "Claim publication remains outside failure-report try semantics: a claim-publication failure never attempts a report, while every operation after a returned claim is inside the terminal report boundary and cannot make the revision retryable."
    - "Claim, failure-report and evidence atomic writers are fault-tested at open, write, file sync, close, link, directory open/sync/close and unlink boundaries; every failure leaves no trusted final or raises an explicit artifact-specific invariant that truthfully reports an ambiguous/persistent final."
    - "Execution is implementation/test only: no Docker/Compose, bare refresh, real fixed-root claim/report/evidence, network/server/SSH/deploy/push/unfreeze or production action occurs, and release stays `BLOCKED`."
  artifacts:
    - path: scripts/refresh-local-runtime-core.mjs
      provides: internal raw-boundary refresh/verifier core with no precomputed fact or target-probe injection
    - path: scripts/refresh-local-live.mjs
      provides: sealed production exports, canonical claim-bound report validation and artifact-specific atomic publication invariants
    - path: scripts/refresh-local.mjs
      provides: earliest-claim terminal failure boundary and exhaustive post-claim stage reporting
    - path: scripts/refresh-local-test-core.mjs
      provides: test-only raw boundary assembly and complete source trace capture
    - path: scripts/refresh-local.test.mjs
      provides: RED/GREEN coverage for the four final independent-audit gaps
  key_links:
    - from: scripts/refresh-local-live.mjs
      to: /private/tmp/blog-x-refresh-attempts
      via: report-present verification reads `<revision>.json`, recomputes its canonical digest, then validates `<revision>.failure.json` against it
      pattern: "assertPresent|assertFailureReportPresent|claimSha256"
    - from: scripts/refresh-local.mjs
      to: scripts/refresh-local-live.mjs
      via: clean Git and atomic claim complete before the terminal report try boundary owns every later production failure
      pattern: "claimRefreshAttempt|writeFailureReport|UNRECOVERABLE_FAILURE_REPORT_INVARIANT"
    - from: scripts/refresh-local-test-core.mjs
      to: scripts/refresh-local-runtime-core.mjs
      via: tests supply only raw boundaries while using the same command builders, parsers, collectors and verifier as sealed production
      pattern: "processBoundary|readFile|createRefreshTestRuntime"
    - from: scripts/refresh-local.test.mjs
      to: scripts/refresh-local-live.mjs
      via: table-driven stage and atomic-operation fault injection proves canonical claim persistence and final-file invariants
      pattern: "adapter_construction|rollback-api-web|write-evidence|UNRECOVERABLE"
  prohibitions:
    - statement: "Do not run Docker/Compose, `node scripts/refresh-local.mjs` with empty argv, a live adapter, migration/cutover/rollback, or write below the real `/private/tmp/blog-x-refresh-attempts` or `ops/phase6-local-refresh-evidence.json`."
      status: pending
      verification: test
    - statement: "Do not retain or add a production-visible `collectFacts`, `targetProbe`, `probeTargets`, precomputed facts, configurable authority root/evidence path or injected production adapter/verifier bypass."
      status: pending
      verification: test
    - statement: "Do not broaden this quick task into v4 schema, local-environment, redirect, Docker topology, application feature or deployment work beyond regressions needed to preserve current behavior."
      status: pending
      verification: review
    - statement: "Do not modify protected milestone history, Phase 5 receipt, runtime evidence, 06-VERIFICATION, REQUIREMENTS, ROADMAP, STATE or canonical release evidence."
      status: pending
      verification: command
---

<objective>
Close the final four independent-audit gaps in local-refresh failure authority under one quick TDD execution, without consuming a live attempt.

Purpose: Ensure a failure report is cryptographically bound to the real attempt claim, production facts cannot be injected, every post-claim failure is terminal and truthful, and atomic publication cannot leave a silently trusted final.
Output: One tests-only RED commit, one GREEN implementation commit across the five exact files, and a quick-task summary; no infrastructure artifact.
</objective>

<execution_context>
@/Users/xanadu/Desktop/ai-coding/blog-x/.codex/gsd-core/workflows/execute-plan.md
@/Users/xanadu/Desktop/ai-coding/blog-x/.codex/gsd-core/templates/summary.md
</execution_context>

<context>
@AGENTS.md
@.planning/STATE.md
@.planning/phases/06-public-discovery-data/06-10-PLAN.md
@.planning/phases/06-public-discovery-data/06-10-SUMMARY.md
@.planning/phases/06-public-discovery-data/06-11-PLAN.md
@scripts/refresh-local-facts.mjs
@scripts/refresh-local-live.mjs
@scripts/refresh-local.mjs
@scripts/refresh-local-test-core.mjs
@scripts/refresh-local.test.mjs
@ops/release-evidence.blocked.json
@ops/phase5-full-gate-receipt.json

<interfaces>
- Keep `createProductionRefreshAttemptStore()`, `createProductionLiveRefreshAdapter()` and `verifyProductionLiveRefreshEvidence()` as zero-argument sealed production entry points. Move reusable adapter/verifier assembly into `refresh-local-runtime-core.mjs` with raw process/filesystem/fetch/clock/random boundaries only; neither that core nor the test runtime accepts complete facts, target probe results, evidence paths or authority roots. `refresh-local-live.mjs` must no longer publicly export the former fact/probe-injectable `createLiveRefreshAdapter` or `verifyLiveRefreshEvidence` contracts.
- `refresh-local-test-core.mjs` is the sole test assembly surface. It records every process argv, raw filesystem read and fetch request, delegates to the same internal command constructors/parsers/collectors/verifier used by production, and exposes no `collectFacts`, `targetProbe` or `probeTargets` member or option. Rewrite the current `liveFixture` and verifier fixtures so all facts arise from fake raw outputs.
- The full raw source trace includes: exact raw `pnpm-lock.yaml` bytes; Git status/revision/show/ancestor/diff authority; Docker context and socket authority; original API/Web seed-reference image inspection; target image/store/filesystem probes; Compose config/ps; container and volume inspect; pg_dump business data; PostgreSQL identity/schema/sequences/ledger; media inventory; protected-history reads; all fixed routes; release-gate command; and the verifier's repeated seed/target/current-runtime reconstruction. Drift cases alter one raw source at a time and must be rejected by the real collector/verifier path.
- `assertFailureReportPresent(revision)` first calls the same safe canonical `assertPresent(revision)` used by claim inspection. It then reads the fixed report, applies parent/final type/symlink/UID/mode/realpath and strict canonical-schema checks, requires `report.implementationRevision === revision`, requires `report.claimSha256 === canonicalClaim.sha256`, and returns the SHA-256 of exact canonical report bytes. A forged digest, absent/noncanonical claim, wrong revision or unsafe report fails before canonical present output.
- Preserve the empty-argv order: resolve clean full Git revision; assert claim absent; atomically publish claim; only after `claimRefreshAttempt` returns enter the failure-report `try`. Claim publication failures stay outside that `try` and cannot call `writeFailureReport`; adapter construction and every later local-authority/collector/build/mutation/recollection/evidence operation remain inside it. A returned claim is never removed.
- Use a table-driven terminal-stage harness over exact stages `adapter_construction`, `local_docker_authority`, `preflight_collection`, `build-api`, `build-web`, `migrate`, `schema-verify`, `cutover-api-web`, `routes`, `release-blocked`, `rollback-api-web`, `verify-rollback`, `write-evidence` and `failure_report_publication`. For every injected failure after claim return, assert canonical claim-present bytes/digest, no same-revision adapter retry, sanitized report bound to that digest when publication succeeds, evidence absent unless its own cleanup is explicitly unrecoverable, exact one-off cleanup where applicable, and correct proved/not-applicable/unproved preservation semantics. Report writer failure must surface `UNRECOVERABLE_FAILURE_REPORT_INVARIANT` while retaining the claim and original failure as cause.
- Replace ad-hoc atomic tests with a reusable fake-filesystem fault matrix for each artifact type (`claim`, `failure-report`, `evidence`) and each operation/site: temporary-file open, write, file sync, file close, link, final validation, directory open, first directory sync/close, temporary unlink, second directory open/sync/close and failure cleanup unlink/sync. Before-link failures require final absence; after-link failures must either remove+directory-fsync the final or raise `UNRECOVERABLE_CLAIM_INVARIANT`, `UNRECOVERABLE_FAILURE_REPORT_INVARIANT` or `UNRECOVERABLE_EVIDENCE_INVARIANT` with truthful final-state expectations. No close/unlink/sync failure is swallowed.
- Preserve strict sanitization: reports contain only fixed schema fields, revision/claim digest, stage/error class and fact digests/status; no raw rows, Markdown/media content, database credentials, environment, commands, mountpoints or host paths.
</interfaces>
</context>

<source_audit>
| Source | Gap | Coverage | Task |
|---|---|---|---|
| Independent audit | Present report must read canonical real claim and match its digest | Covered | 1 RED matrix; 2 implementation |
| Independent audit | Remove facts/probes bypass and trace real raw production sources/drift | Covered | 1 RED trace; 2 sealed core |
| Independent audit | Every post-claim stage is terminal and truthfully reported | Covered | 1 RED stage table; 2 terminal boundary |
| Independent audit | Exhaustive atomic fault matrix and earliest-claim try semantics | Covered | 1 RED operation matrix; 2 artifact-specific invariants |
</source_audit>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Commit RED tests for the four final audit gaps</name>
  <files>scripts/refresh-local.test.mjs</files>
  <behavior>
    - "Report-present cases: canonical claim+matching digest passes; missing, unsafe, noncanonical or digest-mismatched claim fails before output."
    - "Sealing cases: production exports/signatures contain no fact/probe injection; raw test boundaries produce the entire adapter and verifier trace including lock/seed facts; raw drift fails."
    - "Terminal cases: each named post-claim stage preserves the claim and publishes a bound sanitized report or explicit unrecoverable invariant; claim-publication failure writes no report."
    - "Atomic cases: every open/write/sync/close/link/directory-sync/unlink site for claim/report/evidence has an asserted final-state and artifact-specific error contract."
  </behavior>
  <action>
    Replace the current partial success/rollback, factory and unlink-only assertions with table-driven failing tests matching the interfaces above. The fake process boundary must provide raw stdout/stderr for the same production command parsers; the fake filesystem must log raw lock reads and inject one fault at one named operation/site. Delete all `liveFixture` use of `collectFacts` and `targetProbe`, and make verifier drift tests mutate raw responses or bytes rather than projected facts. Add static export/signature assertions proving production modules have no public fact/probe bypass and the production graph never imports `refresh-local-test-core.mjs`. Run the focused suite and require the new named tests to fail for the four audited reasons, while pre-existing tests remain classified. Commit only `scripts/refresh-local.test.mjs` as `test(quick-260816-mtt): expose final refresh failure gaps`.
  </action>
  <verify>
    <automated>node --test scripts/refresh-local.test.mjs</automated>
    <manual>RED is valid only when failures demonstrate claim-digest, injection-surface, terminal-stage and atomic-operation gaps; fixture/parser mistakes do not qualify.</manual>
  </verify>
  <done>A tests-only commit contains complete non-vacuous RED coverage for exactly the four audit groups, with no production or infrastructure change.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Seal production cores and make all claimed failures atomically truthful</name>
  <files>scripts/refresh-local-runtime-core.mjs, scripts/refresh-local-live.mjs, scripts/refresh-local.mjs, scripts/refresh-local-test-core.mjs, scripts/refresh-local.test.mjs</files>
  <behavior>
    - "Failure-report present is impossible without the exact canonical real claim and equal recomputed claim digest."
    - "Only sealed production factories are public; test injection stops at raw process/filesystem/fetch/clock/random boundaries."
    - "All named post-claim stage failures are terminal for the revision and durably report safe preservation status or an explicit invariant."
    - "Every atomic fault has a deterministic final-absence or explicit artifact-specific ambiguity result; cleanup errors are never ignored."
  </behavior>
  <action>
    Implement the smallest refactor satisfying the RED suite. Extract shared raw-boundary runtime assembly without exporting precomputed fact/probe seams; keep production wrappers zero-argument and make the test-only wrapper the only injectable test entry. Bind report-present verification to a freshly read canonical claim and exact digest. Keep claim publication lexically outside the report `try`, then route adapter/local authority/collector/build/migration/schema/cutover/routes/release/rollback/evidence failures through one stage-aware terminal reporter. Harden the common claim/report writer and evidence writer with artifact-specific cleanup/state invariants across the full operation matrix. Preserve current evidence v4, Docker argv/local-authority, same-origin route and persistence behavior without expanding scope. Commit the GREEN implementation and any necessary test refactor as `fix(quick-260816-mtt): close final refresh failure contracts`.
  </action>
  <verify>
    <automated>node --test scripts/refresh-local.test.mjs &amp;&amp; node --test scripts/local-verify.test.mjs &amp;&amp; corepack pnpm -r typecheck &amp;&amp; node scripts/check-boundaries.mjs &amp;&amp; node scripts/release-gate.mjs --evidence=ops/release-evidence.blocked.json --expect-blocked &amp;&amp; git diff --check</automated>
    <manual>Review production exports/import graph and the raw trace: no fact/probe injection remains, every requested source is exercised, and no test reaches real Docker, network or fixed artifact paths.</manual>
  </verify>
  <done>All four audit gaps are GREEN in one atomic implementation commit; existing behavior remains GREEN; protected/runtime artifacts are byte-identical and release remains BLOCKED.</done>
</task>

</tasks>

<threat_model asvs_level="1" block_on="high">
| ID | Category | Component | Severity | Disposition | Mitigation / verification |
|---|---|---|---|---|---|
| T-Q-01 | Tampering | failure report ↔ claim | high | mitigate | Re-read canonical claim, recompute digest and require exact report binding before present output. |
| T-Q-02 | Spoofing | production collector/verifier | high | mitigate | Sealed production exports and raw-only test boundary; full argv/read trace plus real raw drift tests. |
| T-Q-03 | Repudiation | post-claim terminal failures | high | mitigate | Table-driven stage coverage, persistent claim and sanitized bound report or explicit invariant. |
| T-Q-04 | Tampering | claim/report/evidence final files | high | mitigate | Exhaustive atomic-operation fault matrix with final absence or artifact-specific unrecoverable state. |
| T-Q-05 | Elevation of privilege | infrastructure scope | high | mitigate | Fake boundaries only; explicit bans on Docker, network, servers, deployment and real authority paths. |
</threat_model>

<verification>
- RED and GREEN commits are separate and ordered; the first changes tests only and the second changes only the five declared implementation/test files.
- Focused and compatibility suites, workspace typecheck, boundary check and canonical BLOCKED release gate pass.
- Before and after execution, diff protected paths: `.planning/milestones`, `ops/phase5-full-gate-receipt.json`, `ops/phase6-local-refresh-evidence.json`, `.planning/phases/06-public-discovery-data/06-VERIFICATION.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`, and `ops/release-evidence.blocked.json`.
- Audit command history and test boundaries confirm zero Docker/Compose, bare refresh, real fixed-root artifact, network/server/deployment or push actions.
</verification>

<success_criteria>
- All four independent-audit gaps are covered with direct failing-then-passing tests and no deferred item.
- Report presence is cryptographically and structurally dependent on the exact real canonical claim.
- Production facts/probes cannot be substituted; raw production sources and drift are exercised end-to-end through fake boundaries.
- Every post-claim stage and atomic operation has a deterministic persistent-claim/report/final-state contract.
- No infrastructure or protected authority changes; production remains frozen and release remains `BLOCKED`.
</success_criteria>

<output>
After implementation, create `.planning/quick/260816-mtt-close-final-local-refresh-failure-contra/260816-mtt-close-final-local-refresh-failure-contra-SUMMARY.md`. The quick executor commits the two code tasks atomically and does not update ROADMAP or STATE; the quick orchestrator owns later docs/state handling.
</output>
