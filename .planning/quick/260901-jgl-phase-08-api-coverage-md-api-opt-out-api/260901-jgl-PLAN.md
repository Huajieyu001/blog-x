---
phase: quick
plan: "260901-jgl"
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/phases/08-reliable-local-delivery/COVERAGE.md
autonomous: true
requirements: [DEVX-01, DEVX-02, DEVX-03]
estimate:
  tokens: 3000
  raw_tokens: 3000
  tasks: 1
  confidence: low
user_setup: []
must_haves:
  truths:
    - "Phase 08 explicitly and truthfully declares that it integrates no external API, SDK, service, webhook, remote credential, or cloud connection; its delivered surface is first-party local Blog X delivery and verification only."
    - "The declaration uses the canonical, reason-required `No external API integration: ...` form as ordinary unquoted prose, with no contradictory coverage rows."
    - "The blocking API-coverage verify-pre gate returns `block:false`, `passed:true`, `coverage_present:true`, and `none_declared:true` for Phase 08."
    - "Only the Phase 08 coverage evidence file changes; runtime code, application behavior, server configuration, credentials, canonical local runtime, production state, and both cloud servers remain untouched."
  artifacts:
    - path: .planning/phases/08-reliable-local-delivery/COVERAGE.md
      provides: canonical reasoned no-external-API declaration for the completed Phase 08 scope
  key_links:
    - from: .planning/phases/08-reliable-local-delivery/COVERAGE.md
      to: .codex/gsd-core/bin/lib/api-coverage.cjs
      via: the parser-recognized no-integration declaration line, outside blockquotes, fences, and HTML comments
      pattern: "^No external API integration: \\S"
    - from: .codex/gsd-core/bin/lib/api-coverage.cjs
      to: api-coverage.verify-pre
      via: `validateCoverageMatrix` returns `none_declared`, which the seal-time command accepts even when the fallback detector reports signals
      pattern: "none_declared|block: false|passed: true"
  prohibitions:
    - statement: "Do not change runtime code, tests, application behavior, dependencies, Docker/Compose state, server configuration, credentials, release evidence, or production authority."
      status: pending
      verification: review
    - statement: "Do not connect, inspect, deploy to, or modify either cloud server; production remains BLOCKED."
      status: pending
      verification: review
    - statement: "Do not fabricate an API capability matrix or add INTEGRATE/OPT-OUT rows when Phase 08 has no external API surface."
      status: pending
      verification: command
---

<objective>
Close the Phase 08 API-coverage evidence gap with the canonical reasoned declaration that the completed local-delivery phase integrates no external API.

Purpose: Make the existing no-external-integration decision explicit and machine-readable so the blocking `api-coverage.verify-pre` seal gate passes without misrepresenting first-party Blog X routes as a third-party API surface.
Output: `.planning/phases/08-reliable-local-delivery/COVERAGE.md` and a structured gate result proving `block:false`; no runtime, infrastructure, server, or production mutation.
</objective>

<execution_context>
@/Users/xanadu/Desktop/ai-coding/blog-x/.codex/gsd-core/workflows/execute-plan.md
@/Users/xanadu/Desktop/ai-coding/blog-x/.codex/gsd-core/templates/summary.md
</execution_context>

<context>
@AGENTS.md
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/08-reliable-local-delivery/08-CONTEXT.md
@.planning/phases/08-reliable-local-delivery/08-RESEARCH.md
@.planning/phases/08-reliable-local-delivery/08-VERIFICATION.md
@.planning/phases/08-reliable-local-delivery/08-01-SUMMARY.md
@.planning/phases/08-reliable-local-delivery/08-02-SUMMARY.md
@.planning/phases/08-reliable-local-delivery/08-03-SUMMARY.md
@.planning/phases/08-reliable-local-delivery/08-04-SUMMARY.md
@.planning/phases/08-reliable-local-delivery/08-05-SUMMARY.md
@.planning/phases/08-reliable-local-delivery/08-06-SUMMARY.md
@.planning/phases/08-reliable-local-delivery/08-07-SUMMARY.md
@.planning/phases/08-reliable-local-delivery/08-08-SUMMARY.md
@.planning/phases/08-reliable-local-delivery/08-09-SUMMARY.md
@.codex/gsd-core/bin/lib/api-coverage.cjs
@.codex/gsd-core/bin/lib/check-command-router.cjs

<interfaces>
- `api-coverage.cjs` recognizes a declaration only when an ordinary prose line begins with the case-insensitive canonical phrase `No external API integration`, uses an accepted separator, and contains a non-empty one-line reason. A blockquote, fenced example, HTML comment, or bare phrase does not qualify.
- A valid no-integration declaration must contain zero coverage rows. The gate reports it as `coverage_present:true`, `none_declared:true`, and passes it even if the fallback detector finds prose signals; any such signals remain visible for human accuracy review.
- The phase evidence establishes that DEVX-01, DEVX-02, and DEVX-03 are completed through first-party local Blog X Web/API/PostgreSQL, Node, Git, Docker/Compose, and browser verification boundaries. It introduces no third-party API/SDK/service, webhook, external credential, registry publication, deployment integration, or cloud-server operation.
</interfaces>
</context>

<tasks>

<task type="tracer">
  <name>Task 1: Carry the completed local-only Phase 08 scope through the canonical coverage declaration and blocking gate</name>
  <precondition>The Phase 08 directory and its CONTEXT, RESEARCH, VERIFICATION, and 08-01 through 08-09 SUMMARY evidence remain readable; if a new COVERAGE.md appears before execution, stop and reconcile it instead of overwriting concurrent work.</precondition>
  <files>.planning/phases/08-reliable-local-delivery/COVERAGE.md</files>
  <action>
    Confirm from the listed Phase 08 artifacts that the completed implementation remains within the fixed first-party local authority established by D-01, D-02, D-03, D-04, D-05, D-06, D-07, D-08, D-09, D-10, D-11, D-12, D-13, D-14, D-15, D-16, D-17, D-18, and D-19: repository-local delivery, offline tooling, retained local data, generated/local acceptance, immutable evidence, and terminal production `BLOCKED`, with neither cloud server contacted. Create `COVERAGE.md` as exactly one ordinary, non-blockquoted declaration line plus its terminating newline: `No external API integration: Phase 08 uses only Blog X's first-party local Web/Fastify/PostgreSQL/Compose delivery and verification tooling; it adds no third-party API, SDK, service, webhook, remote credential, or cloud connection.` Do not add a heading, table, capability row, blockquote, code fence, HTML comment, example, or second declaration. This is a documentation/evidence correction only: do not run Docker, Compose, delivery, curl, SSH, network, deployment, package-install, or server commands, and do not edit runtime code, configuration, credentials, receipts, release state, ROADMAP, REQUIREMENTS, STATE, VERIFICATION, or existing SUMMARY files.
  </action>
  <verify>
    <automated>node .codex/gsd-core/bin/gsd-tools.cjs check api-coverage.verify-pre .planning/phases/08-reliable-local-delivery --raw
node -e "const { execFileSync } = require('node:child_process'); const result = JSON.parse(execFileSync(process.execPath, ['.codex/gsd-core/bin/gsd-tools.cjs', 'check', 'api-coverage.verify-pre', '.planning/phases/08-reliable-local-delivery', '--raw'], { encoding: 'utf8' })); if (result.block !== false || result.passed !== true || result.coverage_present !== true || result.none_declared !== true) { console.error(result); process.exit(1); }"
test "$(wc -l &lt; .planning/phases/08-reliable-local-delivery/COVERAGE.md | tr -d ' ')" = "1"
git diff --check -- .planning/phases/08-reliable-local-delivery/COVERAGE.md</automated>
    <human-check>Read the declaration against Phase 08 CONTEXT/RESEARCH/VERIFICATION and all nine SUMMARY files: it describes only the delivered local first-party surface, contains no secret or server address, and does not claim a capability matrix.</human-check>
  </verify>
  <done>`COVERAGE.md` contains one reasoned declaration with no rows; the required raw gate invocation reports `block:false`, and the structured assertion proves `passed:true`, `coverage_present:true`, and `none_declared:true`; no file outside the declared coverage artifact was changed by this task.</done>
</task>

</tasks>

<threat_model asvs_level="1" block_on="high">
## Trust Boundaries

| Boundary | Description |
|---|---|
| Phase evidence to COVERAGE.md | Completed implementation evidence is summarized into a human-authored no-integration declaration. |
| COVERAGE.md to verify-pre gate | Semi-trusted Markdown is parsed into a bounded typed coverage decision used by the blocking phase-seal gate. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|---|---|---|---|---|---|
| T-Q-JGL-01 | Tampering | no-integration declaration | high | mitigate | Cross-check CONTEXT, RESEARCH, VERIFICATION, and all nine SUMMARY artifacts; write the exact truthful local-only reason; require the parser's `none_declared:true` result. |
| T-Q-JGL-02 | Spoofing | first-party API described as external integration | medium | mitigate | Distinguish Blog X's own local Web-to-Fastify route boundary from a third-party API/SDK/service and create no fabricated capability rows. |
| T-Q-JGL-03 | Information disclosure | COVERAGE.md reason | medium | mitigate | Keep the reason topology-light and value-free: no server addresses, credentials, tokens, private paths, receipt contents, or environment data. |
| T-Q-JGL-04 | Repudiation | seal-gate outcome | low | mitigate | Preserve the raw gate output in execution logs and machine-assert all four decisive fields before completion. |
| T-Q-JGL-05 | Elevation of privilege | documentation-only execution | high | mitigate | Limit files to COVERAGE.md and prohibit runtime, Docker, network, server, deployment, release-authority, and production actions. |
</threat_model>

<verification>
- Run `node .codex/gsd-core/bin/gsd-tools.cjs check api-coverage.verify-pre .planning/phases/08-reliable-local-delivery --raw` from the repository root and retain its structured output.
- Require the result to contain `block:false`, `passed:true`, `coverage_present:true`, and `none_declared:true`; a warning that the declaration overrides detected prose signals is acceptable only after the Phase 08 evidence review confirms the declaration's accuracy.
- Confirm the coverage file has one ordinary declaration line, no coverage table/JSON fence, no sensitive values, and no misleading external capability.
- Confirm task-owned changes are limited to `.planning/phases/08-reliable-local-delivery/COVERAGE.md`; do not include unrelated pre-existing workspace changes in the task commit.
</verification>

<success_criteria>
- The Phase 08 no-external-API decision is explicit, reasoned, human-readable, and accepted by the canonical parser.
- The blocking verify-pre gate proves `block:false` for the real Phase 08 directory.
- DEVX-01 through DEVX-03 evidence remains accurate and untouched; the quick task changes no runtime behavior or production authority.
- Neither cloud server is contacted, and production remains `BLOCKED`.
</success_criteria>

## Multi-Source Coverage Audit

| Source | Items audited | Plan coverage |
|---|---|---|
| GOAL | Reliable, reproducible fixed-3100 local delivery with machine-readable verification | Task 1 documents the already verified first-party local delivery boundary in the machine-readable coverage artifact and exercises the real seal gate. |
| REQ | DEVX-01, DEVX-02, DEVX-03 | All three are already passed in `08-VERIFICATION.md`; Task 1 records that their delivered surface needs no external API matrix and does not alter their implementation or evidence. |
| RESEARCH | Existing Node/pnpm/Git/Docker/Compose/Playwright stack; no new dependency; local-only/offline constraints | Task 1 uses only the existing local Node gate and adds no package, service, credential, runtime, or network operation. |
| CONTEXT | D-01, D-02, D-03, D-04, D-05, D-06, D-07, D-08, D-09, D-10, D-11, D-12, D-13, D-14, D-15, D-16, D-17, D-18, D-19 | Task 1 cites and preserves every locked local authority, offline, persistence, acceptance, evidence, and BLOCKED-production decision while correcting only the missing coverage declaration. |

Deferred production deployment, main-server cutover, TLS work, secondary-server rollout, automatic CI/registry publishing, and later internal-fetch hardening remain excluded. No source item is unplanned within this documentation-only quick task.

<output>
After implementation, create `.planning/quick/260901-jgl-phase-08-api-coverage-md-api-opt-out-api/260901-jgl-SUMMARY.md` with `status: complete`. The quick executor commits the single evidence change atomically and does not update ROADMAP or STATE; the quick orchestrator owns later plan/summary/state documentation handling.
</output>
