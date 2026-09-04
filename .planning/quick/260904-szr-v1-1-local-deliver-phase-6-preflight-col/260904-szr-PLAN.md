---
phase: quick
plan: "260904-szr"
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/refresh-local.test.mjs
  - scripts/refresh-local-runtime-core.mjs
autonomous: true
requirements: [DEVX-03]
user_setup: []
estimate:
  tokens: 4800
  raw_tokens: 4800
  tasks: 2
  confidence: low
must_haves:
  truths:
    - "Local-delivery preflight collects protected facts when the former Phase 6 verification path is absent after milestone archival."
    - "Git-tracked archived planning documents and the pre-archive current Phase 6 verification document are both protected when present; changing any returned protected file changes the aggregate digest."
    - "`ops/phase5-full-gate-receipt.json` remains protected independently of planning-file location."
    - "The fix follows tracked Git results and does not replace the stale path with a milestone-version-specific archive path."
    - "Any changed Git command shape has one exact allowlist entry, while old, reordered, extra-pathspec, and unrelated command shapes remain rejected."
    - "Only local, infrastructure-free tests run; no delivery retry, Docker operation, server access, deployment, production mutation, or `main` change occurs."
  artifacts:
    - path: scripts/refresh-local.test.mjs
      provides: "Regression coverage for archived/current tracked planning protection, missing former path, digest drift, and exact Git argv authority"
    - path: scripts/refresh-local-runtime-core.mjs
      provides: "Git-authoritative protected-file discovery without an unconditional stale filesystem read"
  key_links:
    - from: scripts/refresh-local-runtime-core.mjs
      to: "Git tracked planning files"
      via: "`createRawRefreshFactSources().protected()` consumes only paths returned by the exact `git ls-files` invocation"
      pattern: "ls-files.*planning/milestones"
    - from: scripts/refresh-local-runtime-core.mjs
      to: ops/phase5-full-gate-receipt.json
      via: "the fixed receipt path is appended to the Git-discovered planning paths before sorted hashing"
      pattern: "phase5-full-gate-receipt\\.json"
    - from: scripts/refresh-local.test.mjs
      to: scripts/refresh-local-runtime-core.mjs
      via: "the focused test invokes the production protected fact source through a fake argv and memory-filesystem boundary"
      pattern: "createRawRefreshFactSources"
---

<objective>
Repair the local-delivery protected-fact preflight after milestone archival without weakening evidence integrity or binding the implementation to one archive version.

Purpose: Let Git-tracked planning evidence move from the active phase tree into the milestone archive without an `ENOENT`, while retaining fail-closed hashing of every selected planning file and the Phase 5 gate receipt.
Output: A tests-first regression and a narrow production correction in the refresh runtime core; the quick summary is created after execution.
</objective>

<execution_context>
@/Users/xanadu/Desktop/ai-coding/blog-x/.codex/gsd-core/workflows/execute-plan.md
@/Users/xanadu/Desktop/ai-coding/blog-x/.codex/gsd-core/templates/summary.md
</execution_context>

<context>
@AGENTS.md
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/milestones/v1.1-REQUIREMENTS.md
@scripts/refresh-local-runtime-core.mjs
@scripts/refresh-local.test.mjs
@scripts/default-test.mjs
@package.json

<interfaces>
- `assertAllowedRefreshCommand(command, args, options)` is the complete token-level child-process authority gate. The intended Git discovery command is exactly `git ls-files .planning/milestones .planning/phases/06-public-discovery-data/06-VERIFICATION.md`; no shell, glob expansion, environment override, or alternate argument order is authorized.
- `createRawRefreshFactSources({ run, fetch, root, fs, state }).protected()` returns `{ count, sha256 }`. It must construct its planning-file set only from non-empty paths returned by that Git command, add `ops/phase5-full-gate-receipt.json`, sort deterministically, read every selected file, and hash `{ path, sha256 }` rows through `factsSha256`.
- Git is authoritative for optional tracked candidates: the active Phase 6 verification path may be returned before archival or omitted after archival. Every file beneath `.planning/milestones` returned by Git remains protected, including the archived Phase 6 verification evidence.
- `memoryArtifactFs` and fake argv runners provide an infrastructure-free seam for proving missing-file behavior and content drift. The focused regression must not invoke Docker, Compose, HTTP, delivery orchestration, claim creation, or receipt publication.
- The failed delivery attempt belongs to the earlier source revision. This quick task creates a new source revision but does not run `local:deliver`; the parent workflow alone may deliver the new SHA once.
</interfaces>
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Commit RED coverage for Git-authoritative protected planning evidence</name>
  <precondition>The branch is `dev`, both task-owned files are clean, and the failed delivery revision is not retried.</precondition>
  <files>scripts/refresh-local.test.mjs</files>
  <behavior>
    - "Archived layout: the former active Phase 6 path is absent, Git returns archived planning files, and protected collection succeeds without reading the absent path."
    - "Current layout: when Git returns the active Phase 6 verification file, it is included in the protected count and digest."
    - "Changing one Git-returned planning file or the fixed Phase 5 receipt changes the protected digest, proving both remain fail-closed inputs."
    - "The new exact three-path-token Git argv is admitted, while its old narrower form, reordered form, extra pathspec, and unrelated paths are rejected."
  </behavior>
  <action>
    Add one focused test around the exported `createRawRefreshFactSources` production seam, using a recording fake `run` boundary and `memoryArtifactFs` variants. Model an archived layout with no former active Phase 6 file and at least two Git-returned milestone files, then model the active layout with the current Phase 6 evidence returned by Git. Assert selected reads, deterministic count/digest, digest changes after protected-file and receipt mutations, and absence of any attempted read for a path Git omitted. Extend the existing exact-command-policy test with the desired `git ls-files` argv and negative near shapes. Run only the named regression and require RED from the existing unconditional stale path read or missing exact argv authority, not from fixture syntax or unrelated runtime behavior. Commit only the test file as `test(quick-260904-szr): expose archived protected-path failure`.
  </action>
  <verify>
    <automated>node --test --test-name-pattern="protected planning evidence follows tracked archival state|live command policy permits only fixed local argv" scripts/refresh-local.test.mjs</automated>
  </verify>
  <done>The tests-only commit captures both tracked layouts, proves protected digest drift, and fails against the current production implementation for the intended missing-path/argv reason without touching infrastructure or retrying delivery.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Make tracked Git results the sole planning-path authority</name>
  <precondition>Task 1's focused RED failure is caused by the unconditional former Phase 6 read and the exact desired Git argv is fixed by the test.</precondition>
  <files>scripts/refresh-local-runtime-core.mjs</files>
  <behavior>
    - "Only existing tracked planning paths returned by Git are read, regardless of whether Phase 6 is active or archived."
    - "All returned milestone files, an optionally returned active Phase 6 verification file, and the fixed Phase 5 receipt contribute to the protected digest."
    - "No milestone version, archived Phase 6 destination, filesystem search, directory walk, user input, or broad child-process permission determines protected paths."
  </behavior>
  <action>
    Change `protected()` to request the milestone root and active Phase 6 verification candidate in one exact `git ls-files` invocation, then derive the planning paths exclusively from its non-empty tracked output. Remove the unconditional append of the former active path; retain the fixed Phase 5 gate receipt, deterministic sorting, per-file SHA-256 rows, aggregate `factsSha256`, and rejection of any selected unreadable file. Update `assertAllowedRefreshCommand` to admit exactly the new argv and retire the no-longer-used narrower argv. Do not add an archive-version path, wildcard, filesystem discovery, fallback-on-error, or missing-file suppression. First restore the focused regression to GREEN, then run the zero-argument default test coordinator and formatting check. Commit only the runtime-core file as `fix(quick-260904-szr): follow tracked protected evidence`.
  </action>
  <verify>
    <automated>node --test --test-name-pattern="protected planning evidence follows tracked archival state|live command policy permits only fixed local argv" scripts/refresh-local.test.mjs &amp;&amp; corepack pnpm test &amp;&amp; git diff --check -- scripts/refresh-local.test.mjs scripts/refresh-local-runtime-core.mjs</automated>
  </verify>
  <done>The focused regression and default suite pass; protected collection no longer reads an absent untracked path, every Git-returned protected file and the fixed receipt still affect the digest, and the child-process policy admits only the exact command used by production.</done>
</task>

</tasks>

<threat_model asvs_level="1" block_on="high">
## Trust Boundaries

| Boundary | Description |
|---|---|
| Git index to filesystem reads | Repository paths selected by an exact read-only Git command become inputs to protected evidence hashing. |
| Protected files to delivery evidence | Planning and gate-receipt content determines the aggregate preflight fingerprint used to detect mutation. |
| Quick task to local delivery workflow | A source repair follows a failed revision attempt but must not reuse its claim or mutate local runtime state. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|---|---|---|---|---|---|
| T-Q-SZR-01 | Tampering | `protected()` path selection | high | mitigate | Take optional planning paths only from the exact Git tracked-file result and test that every returned file changes the digest when mutated. |
| T-Q-SZR-02 | Elevation of privilege | Git command policy | high | mitigate | Replace the exact allowlist member together with production argv; reject old, reordered, extended, and unrelated shapes in the focused test. |
| T-Q-SZR-03 | Repudiation | failed delivery attempt | high | mitigate | Run no delivery command in this plan and explicitly reserve a single attempt for the new committed SHA to the parent workflow. |
| T-Q-SZR-04 | Information disclosure | protected fact projection | low | accept | Only counts and SHA-256 digests leave the collector; raw planning or receipt bytes are not emitted. |
| T-Q-SZR-05 | Denial of service | archived path absence | medium | mitigate | Do not read optional candidates omitted by Git; continue failing closed for files Git selected but the filesystem cannot read. |
| T-Q-SZR-SC | Tampering | package supply chain | high | mitigate | Install no package and change no dependency or lockfile; use only the repository's existing Node/pnpm tests. |
</threat_model>

<verification>
- The tests-only RED run fails for the existing unconditional stale path or missing exact argv authority, then the same focused command passes after the production correction.
- The default `corepack pnpm test` coordinator passes without Docker, Compose, HTTP, or server access.
- Source review confirms one exact Git argv in both caller and allowlist, no milestone-version destination, and no fallback that ignores a selected-file read failure.
- Git diff and commit inspection show only `scripts/refresh-local.test.mjs` in the RED commit and only `scripts/refresh-local-runtime-core.mjs` in the GREEN commit.
- Do not run `local:deliver`, `refresh-local.mjs`, Docker/Compose, SSH/SCP/rsync, network checks, deployment, receipt/claim mutation, or any command against either server; do not switch to or modify `main`.
</verification>

<success_criteria>
- Milestone archival no longer causes `preflight_collection` to fail because the former active Phase 6 path is absent.
- Both active and archived tracked layouts remain covered without a destination-specific replacement path.
- Protected planning evidence and the fixed Phase 5 gate receipt remain fail-closed digest inputs.
- Exact argv authority, default regression coverage, local-only scope, `dev` isolation, and the no-same-SHA retry rule are preserved.
</success_criteria>

## Multi-Source Coverage Audit

| Source | ID / item | Plan coverage | Status |
|---|---|---|---|
| GOAL | Restore local-delivery protected preflight after archival without weakening integrity | Tasks 1-2 provide a tests-first tracked-path repair and exact authority update. | COVERED |
| REQ | DEVX-03 current-revision local delivery verification | Task 2 restores the preflight required before the parent can deliver a new revision. | COVERED |
| RESEARCH | No task-specific research artifact; existing runtime uses exact argv and fake-boundary testing | Both tasks retain those established patterns and add no dependency. | COVERED |
| CONTEXT | Project production freeze, local development topology, secret safety, and release gate | Verification is infrastructure-free, production remains untouched, and no server or credential path is used. | COVERED |

No deferred server, deployment, TLS, production scheduler, analytics, or unrelated application work appears in this plan.

<output>
After implementation, create `.planning/quick/260904-szr-v1-1-local-deliver-phase-6-preflight-col/260904-szr-SUMMARY.md`. The executor owns the two task commits; the parent workflow owns any later metadata commit, push of `dev`, and one local delivery attempt for the new committed SHA. Never retry the failed SHA, access either server, or modify `main`.
</output>
