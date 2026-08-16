---
phase: quick
plan: "260816-pzr-support-docker-compose-v5-ndjson-ps-outp"
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/refresh-local-runtime-core.mjs
  - scripts/refresh-local.test.mjs
autonomous: true
requirements: []
estimate:
  tokens: 4200
  tasks: 2
  confidence: high
user_setup: []
must_haves:
  truths:
    - "The fixed Compose `ps --all --format json` source accepts exactly two bounded encodings: one JSON array of objects, or one-or-more newline-delimited JSON object records as emitted by Docker Compose v5.4.0."
    - "The Compose-ps parser rejects empty output, leading/internal blank records, mixed array-and-record encodings, malformed lines, trailing non-whitespace garbage, and null/scalar/array records; it does not alter the generic JSON parser used by other runtime sources."
    - "Both accepted encodings still flow through the existing exact `api`, `postgres`, `web` service authority; missing, extra, duplicate or non-string service identities fail closed."
    - "Tests use a sanitized realistic Compose v5 NDJSON fixture with ordinary container fields and `Publishers`, but no host paths, credentials, mount sources or private runtime data."
    - "The terminally consumed clean revision `5cd4ec6b8342a7f086173d03d48e37a6793a2b4a` is historical only: its existing claim/failure report are neither read, deleted, edited nor retried. Any future live attempt requires the new committed implementation revision and a separate authorized execution plan."
    - "This quick task runs unit/static checks only: no Docker/Compose command, bare refresh, real claim/report/evidence operation, network/server/SSH/deploy/push/unfreeze or production action occurs, and release remains `BLOCKED`."
  artifacts:
    - path: scripts/refresh-local-runtime-core.mjs
      provides: narrow Compose-ps array/NDJSON object-record parser wired only to fixed runtime authority collection
    - path: scripts/refresh-local.test.mjs
      provides: RED/GREEN compatibility, malformed-input and exact-service regression coverage
  key_links:
    - from: scripts/refresh-local-runtime-core.mjs
      to: docker-compose -p blogxlocal -f compose.yaml ps --all --format json
      via: `composeAuthority()` parses only the command's stdout as array or strict NDJSON object records before extracting Service
      pattern: "composeAuthority|ps.*--all.*--format.*json|Service"
    - from: scripts/refresh-local.test.mjs
      to: scripts/refresh-local-runtime-core.mjs
      via: raw fake process output exercises the real source/parser and downstream exact-service validation
      pattern: "NDJSON|Publishers|api|postgres|web"
  prohibitions:
    - statement: "Do not call the real Compose CLI or no-option refresh, and do not inspect or mutate the old revision claim/report or final evidence."
      status: pending
      verification: review
    - statement: "Do not make the shared `parseJson` permissive, add streaming/general JSON recovery, ignore blank/malformed lines, accept primitives, or normalize arbitrary trailing garbage."
      status: pending
      verification: test
    - statement: "Do not broaden this task into Docker authority, persistence, evidence schema, failure reporting, deployment or application behavior changes."
      status: pending
      verification: review
    - statement: "Do not modify protected milestone history, Phase 5 receipt, Phase 6 runtime evidence/verification, REQUIREMENTS, ROADMAP, STATE or canonical release evidence."
      status: pending
      verification: command
---

<objective>
Support Docker Compose v5.4.0 newline-delimited JSON output for the fixed `ps` authority check without weakening any other parser or service invariant.

Purpose: Allow a new clean implementation revision to pass the same pre-build read-only authority collection that terminally stopped `5cd4ec6`, while preserving the old attempt as immutable failure history.
Output: One tests-only RED commit, one minimal GREEN parser commit in two declared files, and a quick-task summary; no runtime or infrastructure artifact.
</objective>

<execution_context>
@/Users/xanadu/Desktop/ai-coding/blog-x/.codex/gsd-core/workflows/execute-plan.md
@/Users/xanadu/Desktop/ai-coding/blog-x/.codex/gsd-core/templates/summary.md
</execution_context>

<context>
@AGENTS.md
@.planning/STATE.md
@.planning/quick/260816-mtt-close-final-local-refresh-failure-contra/260816-mtt-close-final-local-refresh-failure-contra-SUMMARY.md
@.planning/phases/06-public-discovery-data/06-11-PLAN.md
@scripts/refresh-local-runtime-core.mjs
@scripts/refresh-local.test.mjs
@ops/release-evidence.blocked.json
</context>

<interfaces>
- Add one private Compose-ps-specific parser in `refresh-local-runtime-core.mjs`; do not change `parseJson`. It receives the raw command stdout so syntax is not erased by broad trimming. Accept a conventional JSON array only when it is nonempty and every element is a non-null, non-array object. Otherwise accept strict NDJSON only when every logical record is a nonempty line whose entire contents parse as one non-null, non-array object.
- Permit the CLI's ordinary single terminal `LF` or `CRLF`, but reject empty/whitespace-only output, a leading blank, an internal blank, multiple blank terminators, array-plus-record mixtures, malformed JSON, concatenated/trailing garbage and any record resolving to `null`, boolean, number, string or array. Parsing is bounded by the already captured process stdout and performs no recovery or recursive scanning.
- After decoding, require every record's `Service` to be a nonempty string, sort the service values, and retain the existing fixed-authority equality against exactly `api`, `postgres`, `web`. Tests prove missing, extra and duplicate service records still fail, for both array and NDJSON shapes where relevant.
- Build one sanitized Compose v5 fixture as three independent JSON lines. Each record may contain only realistic non-sensitive fields such as `ID`, `Name`, `Project`, `Service`, `State`, `Health`, `ExitCode`, `Image` and `Publishers`; API/PostgreSQL use `Publishers: []`, while Web uses a loopback publisher for target port 3000 and published port 3100. Do not include host paths, mount sources, commands, labels with working-directory data, credentials or external addresses.
- Keep command argv, local daemon checks, fact projection, evidence/failure schemas and all persistence behavior unchanged. The parser is invoked only by `createRawRefreshFactSources(...).composeAuthority()` after the exact existing command returns.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Commit RED Compose v5 array/NDJSON boundary tests</name>
  <files>scripts/refresh-local.test.mjs</files>
  <behavior>
    - "A sanitized three-line Compose v5 fixture decodes to exact sorted services `api`, `postgres`, `web`; the legacy JSON-array fixture remains accepted."
    - "Empty/whitespace output, leading or internal blank lines, repeated terminal blanks, mixed array+NDJSON, malformed/trailing garbage, and null/scalar/array records are rejected."
    - "Missing, extra, duplicate and non-string Service values fail the existing exact fixed-runtime authority check rather than being silently deduplicated or filtered."
    - "The fake runner records only the existing fixed Compose argv; no test calls real Docker/Compose or fixed claim/report/evidence paths."
  </behavior>
  <action>
    Add focused tests through the real raw fact-source `composeAuthority()` path, not a duplicate test parser. Introduce one sanitized realistic v5.4.0 NDJSON fixture with three object lines and `Publishers`, retain the array fixture as a compatibility case, and table-drive every rejection class named above. Include downstream collection/authority assertions for missing, extra and duplicate services so parsing success cannot weaken the exact three-service contract. Run the focused suite and require the NDJSON acceptance case to fail specifically because current code performs one `JSON.parse` over all three lines; malformed-input assertions must remain meaningful. Commit only the test file as `test(quick-260816-pzr): expose Compose v5 NDJSON ps output`.
  </action>
  <verify>
    <automated>node --test scripts/refresh-local.test.mjs</automated>
    <manual>RED is valid only when the realistic NDJSON case reaches the current production parser and fails there; fixture errors or real infrastructure access do not qualify.</manual>
  </verify>
  <done>A tests-only commit proves current array compatibility, the v5 NDJSON gap, strict malformed-input closure and unchanged exact-service authority.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement the narrow Compose-ps decoder and restore GREEN</name>
  <files>scripts/refresh-local-runtime-core.mjs, scripts/refresh-local.test.mjs</files>
  <behavior>
    - "Only valid array-of-object or strict nonempty NDJSON-object output reaches Service extraction."
    - "All malformed, mixed, blank or non-object shapes fail closed with a Compose-ps-specific error."
    - "Exactly three distinct fixed services remain mandatory, and every other raw source keeps strict single-JSON parsing."
  </behavior>
  <action>
    Implement the private bounded parser and wire it only into `composeAuthority()`. Preserve raw line boundaries long enough to reject invalid blanks/garbage, allow only the normal single terminal newline, validate every decoded record as a plain object with a nonempty string `Service`, and return records without deduplication so existing exact-service checks detect duplicate/missing/extra entries. Do not alter the command, generic parser, collector schema or fixed authority list. Make only test refactors required to share the sanitized fixture. Commit the GREEN change as `fix(quick-260816-pzr): support Compose v5 NDJSON ps output`.
  </action>
  <verify>
    <automated>node --test scripts/refresh-local.test.mjs &amp;&amp; node --test scripts/local-verify.test.mjs &amp;&amp; corepack pnpm -r typecheck &amp;&amp; node scripts/check-boundaries.mjs &amp;&amp; node scripts/release-gate.mjs --evidence=ops/release-evidence.blocked.json --expect-blocked &amp;&amp; git diff --check</automated>
    <manual>Inspect the diff and command history: only the two declared files changed, realistic fixtures contain no host paths/private data, and no Docker/Compose, refresh, fixed-root artifact, network or server action ran.</manual>
  </verify>
  <done>The focused and regression suites are GREEN; both permitted Compose shapes enforce exact three-service authority; invalid shapes fail closed; protected artifacts and release BLOCKED remain unchanged.</done>
</task>

</tasks>

<threat_model asvs_level="1" block_on="high">
| ID | Category | Component | Severity | Disposition | Mitigation / verification |
|---|---|---|---|---|---|
| T-Q-PZR-01 | Tampering | Compose ps parser | high | mitigate | Only full array or per-line object JSON is accepted; mixed, blank, garbage and primitive inputs fail closed. |
| T-Q-PZR-02 | Spoofing | fixed service authority | high | mitigate | No filtering/deduplication; exact `api`, `postgres`, `web` equality remains downstream and is regression-tested. |
| T-Q-PZR-03 | Information disclosure | realistic fixtures | medium | mitigate | Sanitized fields and loopback Publishers only; no paths, mounts, credentials or private addresses. |
| T-Q-PZR-04 | Elevation of privilege | terminal attempt/infrastructure | high | mitigate | New code revision only; old claim/report untouched; fake unit boundaries and explicit no-infrastructure prohibition. |
</threat_model>

<verification>
- RED and GREEN commits are separate and ordered; RED changes only `scripts/refresh-local.test.mjs`, GREEN changes only the two declared files.
- Focused refresh tests, local-verifier regressions, workspace typecheck, boundary scan, canonical BLOCKED gate and diff check pass.
- Protected repository paths remain byte-identical: `.planning/milestones`, `ops/phase5-full-gate-receipt.json`, `ops/phase6-local-refresh-evidence.json`, `.planning/phases/06-public-discovery-data/06-VERIFICATION.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md` and `ops/release-evidence.blocked.json`.
- No command inspects, edits or deletes `/private/tmp/blog-x-refresh-attempts/5cd4ec6b8342a7f086173d03d48e37a6793a2b4a{.json,.failure.json}`; no same-revision retry occurs.
</verification>

<success_criteria>
- Compose v5.4.0 three-object NDJSON and the existing JSON-array encoding both produce exact fixed service facts.
- All specified malformed, mixed, blank, trailing-garbage and non-object cases fail closed without broad parser changes.
- Missing, extra and duplicate services remain rejected.
- The old claimed failure remains immutable history; implementation/testing creates no claim, report or evidence and performs no infrastructure/network/server action.
</success_criteria>

<output>
After implementation, create `.planning/quick/260816-pzr-support-docker-compose-v5-ndjson-ps-outp/260816-pzr-support-docker-compose-v5-ndjson-ps-outp-SUMMARY.md`. The quick executor commits RED and GREEN code tasks atomically and does not update ROADMAP or STATE; the quick orchestrator owns later docs/state handling.
</output>
