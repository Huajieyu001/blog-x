---
phase: quick
plan: "260904-jio"
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/refresh-local.test.mjs
  - scripts/refresh-local-runtime-core.mjs
  - .planning/phases/08-reliable-local-delivery/08-UAT.md
autonomous: true
requirements: [DEVX-03]
estimate:
  tokens: 5200
  raw_tokens: 5200
  tasks: 3
  confidence: low
user_setup: []
must_haves:
  truths:
    - "A revision-addressed local-delivery receipt created by code containing this correction may be reverified from a later clean `dev` descendant whose intervening history adds the exact Phase 08 UAT closeout path alongside the already approved receipt/closeout documents."
    - "The descendant policy remains a finite exact-path allowlist: near-miss UAT names, UAT files from another phase, review/plan/context/config files, and runtime/source changes still fail closed."
    - "The acceptance-policy regression reaches the real merge-aware NUL-delimited history branch of `verifyRawRefreshEvidence`; no prefix, suffix, directory, glob, regex, or extension-wide permission is introduced."
    - "Phase 08 UAT Test 17 truthfully records the current default coordinator result as 42 of 42 semantic tests, with zero non-pass results and unchanged 25/25 UAT totals."
    - "The existing receipt and fixed local runtime remain immutable local-only evidence with production `BLOCKED`; this maintenance change does not claim that the older receipt can cross the new runtime-source commit."
    - "The orchestrator-owned uncommitted `08-VERIFICATION.md` remains byte-identical, unstaged, and uncommitted; ROADMAP, STATE, main, Docker, both servers, and production are untouched."
  artifacts:
    - path: scripts/refresh-local.test.mjs
      provides: tests-first exact allowlist acceptance and near-miss rejection coverage for Phase 08 UAT closeout
    - path: scripts/refresh-local-runtime-core.mjs
      provides: one additional exact `08-UAT.md` member in the descendant closeout allowlist
    - path: .planning/phases/08-reliable-local-delivery/08-UAT.md
      provides: corrected Test 17 default-suite count of 42/42 without changing completion totals
  key_links:
    - from: scripts/refresh-local.test.mjs
      to: scripts/refresh-local-runtime-core.mjs
      via: `liveFixture` supplies merge-aware NUL-delimited touched paths to the production verifier branch
      pattern: "later evidence verification admits only|verificationTouchedPaths|git.*log"
    - from: scripts/refresh-local-runtime-core.mjs
      to: .planning/phases/08-reliable-local-delivery/08-UAT.md
      via: one exact `Set` member authorizes only the canonical Phase 08 UAT closeout path
      pattern: "\\.planning/phases/08-reliable-local-delivery/08-UAT\\.md"
    - from: package.json
      to: .planning/phases/08-reliable-local-delivery/08-UAT.md
      via: the zero-argument `corepack pnpm test` result is the evidence source for Test 17's 42/42 wording
      pattern: "\"test\": \"node scripts/default-test.mjs\""
  prohibitions:
    - statement: "Do not read from, connect to, inspect, deploy to, or modify either cloud server; do not run SSH, SCP, rsync, curl to a server, or any production command."
      status: pending
      verification: review
    - statement: "Do not run Docker, Compose, `local:deliver`, receipt publication, claim mutation, fixed-runtime mutation, deployment, or release promotion."
      status: pending
      verification: review
    - statement: "Do not edit, stage, commit, or overwrite `.planning/phases/08-reliable-local-delivery/08-VERIFICATION.md`; it is pre-existing orchestrator-owned work."
      status: pending
      verification: command
    - statement: "Do not widen the descendant allowlist by directory, prefix, suffix, regex, extension, generated filename, or user input."
      status: pending
      verification: test
    - statement: "Do not modify `main`, ROADMAP, STATE, REQUIREMENTS, receipts, claims, summaries, reviews, dependencies, lockfiles, application code, or server configuration."
      status: pending
      verification: command
---

<objective>
Correct the Phase 08 descendant receipt-verification policy so the canonical UAT closeout document is one explicitly admitted documentation path, while preserving every other fail-closed source and authority boundary.

Purpose: Remove the audited omission that rejects an otherwise documentation-only post-delivery UAT closeout, keep the allowlist finite and exact, and align Test 17 with the verified 42/42 default-suite result.
Output: A tests-first regression commit, a one-path production-policy correction, and an isolated UAT count correction; no runtime delivery, old-receipt reauthorization, production mutation, or server access.
</objective>

<execution_context>
@/Users/xanadu/Desktop/ai-coding/blog-x/.codex/gsd-core/workflows/execute-plan.md
@/Users/xanadu/Desktop/ai-coding/blog-x/.codex/gsd-core/templates/summary.md
</execution_context>

<context>
@AGENTS.md
@.planning/STATE.md
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/08-reliable-local-delivery/08-CONTEXT.md
@.planning/phases/08-reliable-local-delivery/08-RESEARCH.md
@.planning/phases/08-reliable-local-delivery/08-UAT.md
@scripts/refresh-local-runtime-core.mjs
@scripts/refresh-local.test.mjs
@scripts/default-test.mjs
@package.json

<interfaces>
- `verifyRawRefreshEvidence` handles a later HEAD only after clean branch-qualified Git validation and `merge-base --is-ancestor`; it consumes merge-aware `git log --format= --name-only -z -m --no-renames REVISION..HEAD --` output and rejects any touched path absent from a literal `Set`.
- Add exactly `.planning/phases/08-reliable-local-delivery/08-UAT.md` beside the ten existing receipt/summary/verification/roadmap/state/requirements members. Do not replace the `Set`, normalize paths, accept a directory, or authorize any other UAT filename.
- The existing `later evidence verification admits only the receipt and finite Phase 08 closeout documents` test already drives the real verifier through a fake process/filesystem boundary. Extend its accepted list with the canonical UAT path and its rejected list with at least `08-UAT.md.bak` and another phase's `07-UAT.md`; keep review, plan, context, config, future-summary, and runtime-source rejection coverage.
- The RED run must fail because production code omits the exact UAT member. The GREEN run must pass only after the production literal is added, while every negative path remains rejected.
- `corepack pnpm test` is the only source of truth used to correct Phase 08 UAT Test 17 from 38/38 to 42/42. Update both the Test 17 heading and `expected:` line only; retain `result: pass`, `source: automated`, `coverage_id: D2`, and the Summary totals of 25 passed and zero issues/pending/skipped/blocked.
- `08-VERIFICATION.md` is already modified by the orchestrator before this quick task. Record its SHA-256 before implementation, verify the same digest after every task, never include it in a task commit, and do not use its uncommitted prose as a production artifact.
- Because changing `scripts/refresh-local-runtime-core.mjs` is itself forbidden descendant source drift relative to the already delivered receipt, this task proves the corrected policy for receipts produced by code that contains the fix. It must not claim formal current-HEAD reverification of the older receipt and must not run the production verifier, Docker, or local delivery.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Commit RED coverage for the exact Phase 08 UAT closeout path</name>
  <precondition>The current branch is `dev`; the only pre-existing uncommitted path is the orchestrator-owned `08-VERIFICATION.md`, whose SHA-256 is recorded before edits; neither task-owned file has concurrent changes.</precondition>
  <files>scripts/refresh-local.test.mjs</files>
  <behavior>
    - "The exact canonical Phase 08 `08-UAT.md` path is accepted together with the existing finite closeout set."
    - "A backup suffix, a UAT document under Phase 07, and every existing forbidden review/plan/context/config/future-summary/runtime path are rejected."
    - "A forbidden path touched and later reverted in merge-aware history still rejects verification."
  </behavior>
  <action>
    Extend only the existing descendant-closeout verifier test. Add the canonical Phase 08 UAT path to its local accepted array, and add exact negative cases for a suffixed near miss and a different-phase UAT path without removing any current rejection. Keep the test on `liveFixture`, `beginVerification`, the production `verifyEvidence` seam, and the merge-aware NUL-delimited `git log` simulation so the assertion tests actual policy instead of duplicating an allowlist in an isolated helper. Run only this named test and require RED specifically from `intervening Git paths exceed the evidence/docs-only allowlist`; a syntax, fixture, filesystem, receipt-schema, or Docker error is not valid RED. Commit only the test file as `test(quick-260904-jio): expose UAT closeout allowlist gap`. Do not stage the orchestrator-owned verification file.
  </action>
  <verify>
    <automated>node --test --test-name-pattern="later evidence verification admits only" scripts/refresh-local.test.mjs</automated>
  </verify>
  <done>The tests-only commit expresses canonical UAT acceptance plus exact near-miss/foreign-phase rejection and fails solely because the production finite set lacks `08-UAT.md`; the recorded `08-VERIFICATION.md` digest is unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add one literal UAT member and restore the verifier suite to GREEN</name>
  <precondition>Task 1's RED commit exists on `dev`, and its focused failure is the missing canonical UAT member rather than any fixture or environmental fault.</precondition>
  <files>scripts/refresh-local-runtime-core.mjs</files>
  <behavior>
    - "The canonical Phase 08 UAT closeout is the only newly accepted descendant path."
    - "No other UAT, planning, review, configuration, source, or runtime path gains authority."
    - "All history parsing, ancestor validation, branch cleanliness, receipt identity, runtime reconstruction, and production `BLOCKED` rules remain unchanged."
  </behavior>
  <action>
    Insert the exact Phase 08 UAT repository path as one new literal member of the existing local `allowed` Set inside `verifyRawRefreshEvidence`. Preserve the set-based exact equality check and every existing member, `git log` argv token, NUL framing validation, merge handling, and downstream receipt/runtime verification. Do not export the set, accept configurable entries, infer sibling files, generalize by extension, or authorize the runtime source change. Run the named regression first, then the complete infrastructure-free refresh suite. Commit only the runtime-core file as `fix(quick-260904-jio): admit Phase 08 UAT closeout`. This commit intentionally makes the old receipt ineligible for current-HEAD formal reverification because its descendant history now contains a runtime-source change; do not weaken that rejection or issue a replacement receipt.
  </action>
  <verify>
    <automated>node --test --test-name-pattern="later evidence verification admits only" scripts/refresh-local.test.mjs &amp;&amp; node --test scripts/refresh-local.test.mjs</automated>
  </verify>
  <done>The focused exact-path test and full fake-boundary refresh suite pass; source inspection shows one new allowlist literal and no generalized permission; the existing receipt, runtime, release decision, and `08-VERIFICATION.md` bytes remain untouched.</done>
</task>

<task type="auto">
  <name>Task 3: Correct UAT Test 17 to verified 42/42 and close with infrastructure-free regression</name>
  <precondition>The zero-argument default coordinator runs locally without Docker and reports exactly 42 tests, 42 passed, and zero failed/cancelled/skipped/TODO before the UAT text is changed.</precondition>
  <files>.planning/phases/08-reliable-local-delivery/08-UAT.md</files>
  <action>
    Run `corepack pnpm test` and retain its exact terminal counts. Only after it proves 42/42 with no non-pass category, replace the stale `38 of 38` phrase with `42 of 42` in both the Test 17 heading and its `expected:` line. Leave its pass result, automated source, D2 coverage identifier, every other test, frontmatter, current-test marker, and 25/25 Summary counters unchanged. Run the default coordinator again, rerun the complete refresh regression, and check formatting. Confirm the recorded SHA-256 of the pre-existing orchestrator-owned `08-VERIFICATION.md` is unchanged and that it is neither staged nor included in this task commit. Commit only `08-UAT.md` as `docs(quick-260904-jio): correct Phase 08 default test count`.
  </action>
  <verify>
    <automated>corepack pnpm test &amp;&amp; node --test scripts/refresh-local.test.mjs &amp;&amp; git diff --check -- scripts/refresh-local.test.mjs scripts/refresh-local-runtime-core.mjs .planning/phases/08-reliable-local-delivery/08-UAT.md</automated>
  </verify>
  <done>The live default coordinator reports 42/42 with no non-pass result; exactly two Test 17 lines say 42 of 42; UAT remains complete at 25/25; the three planned commits exclude `08-VERIFICATION.md` and every out-of-scope path.</done>
</task>

</tasks>

<threat_model asvs_level="1" block_on="high">
## Trust Boundaries

| Boundary | Description |
|---|---|
| Git descendant history to receipt verifier | Untrusted merge-aware NUL-delimited path records cross into a decision about whether an older revision's evidence may be checked from a later clean branch HEAD. |
| Exact documentation path to finite policy | A human-authored UAT closeout gains narrow descendant authority only through literal repository-path equality. |
| Test output to UAT evidence | Current machine counts are summarized into a long-lived human-readable acceptance record. |
| Quick task to shared worktree | Task-owned edits coexist with an orchestrator-owned uncommitted verification artifact that must remain isolated. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|---|---|---|---|---|---|
| T-Q-JIO-01 | Tampering | descendant docs allowlist | high | mitigate | Add one literal path only; retain full-string Set membership and reject suffix, sibling-phase, review, plan, config, summary, and source near misses through the production verifier seam. |
| T-Q-JIO-02 | Spoofing | reverted/merge history | high | mitigate | Preserve merge-aware `git log -m --no-renames -z` inspection and the existing test proving a forbidden touched path cannot hide after endpoint-tree reversion. |
| T-Q-JIO-03 | Repudiation | historical receipt applicability | high | mitigate | State explicitly that the runtime-source correction prevents the existing receipt from crossing this commit; publish no receipt, claim no current-HEAD formal verification, and keep release `BLOCKED`. |
| T-Q-JIO-04 | Information disclosure | test/UAT output | low | mitigate | Record only aggregate 42/42 semantic counts; add no credentials, host data, claim bytes, runtime paths, or server addresses. |
| T-Q-JIO-05 | Elevation of privilege | local maintenance workflow | high | mitigate | Use infrastructure-free fake-boundary/default tests only; prohibit Docker, delivery, network, deployment, main mutation, and all server access. |
| T-Q-JIO-06 | Tampering | orchestrator-owned verification draft | high | mitigate | Record and compare its SHA-256, never edit/stage/commit it, and restrict every task commit to its declared file. |
| T-Q-JIO-SC | Tampering | package supply chain | high | mitigate | Install no package and change no dependency or lockfile; all verification uses the repository's existing Node/pnpm toolchain. |
</threat_model>

<verification>
- The first task produces a tests-only RED failure from the missing exact UAT member; the second adds one production literal and makes the focused and complete refresh tests GREEN.
- Review the runtime diff: the only semantic policy change is one exact `.planning/phases/08-reliable-local-delivery/08-UAT.md` Set entry; no directory/prefix/suffix/regex/extension/configurable allowance exists.
- Run `corepack pnpm test` before and after the UAT edit and require 42 tests, 42 passed, zero failed, cancelled, skipped, and TODO.
- Confirm UAT Test 17 has exactly two `42 of 42` occurrences, no `38 of 38`, and Summary remains total 25 / passed 25 / all other categories zero.
- Compare the before/after SHA-256 for `.planning/phases/08-reliable-local-delivery/08-VERIFICATION.md`; verify it remains unstaged and absent from all three task commits.
- Inspect commit paths: tests-only RED, runtime-only GREEN, UAT-only evidence correction. Do not include pre-existing or unrelated changes.
- Do not run the formal production verifier for the old receipt, Docker/Compose, `local:deliver`, browser/network tests, server commands, deployment, or any production operation.
</verification>

<success_criteria>
- Exact Phase 08 UAT closeout membership is regression-tested through the real descendant-history verifier path.
- The finite policy accepts only the newly named path and preserves all current negative cases, including reverted forbidden history.
- Default semantic evidence and Phase 08 UAT Test 17 agree at 42/42 while the phase remains 25/25 complete.
- The old receipt and fixed local runtime remain unchanged and local-only; production release remains `BLOCKED` and receives no new authority.
- `dev` is the only branch used; `main`, `08-VERIFICATION.md`, ROADMAP, STATE, servers, infrastructure, dependencies, and unrelated files are untouched.
</success_criteria>

## Multi-Source Coverage Audit

| Source | ID / item | Plan coverage | Status |
|---|---|---|---|
| GOAL | Audited quick-task goal: admit canonical `08-UAT.md` to finite descendant verification, add regression, and correct stale UAT count | Tasks 1-3 cover tests-first policy repair and count correction without delivery or production work. | COVERED |
| REQ | DEVX-03 current-revision machine verification | Tasks 1-2 preserve strict receipt/source authority while making future receipt descendants tolerant of the exact UAT closeout; Task 3 keeps human evidence aligned with actual default results. | COVERED |
| RESEARCH | No new dependency; exact argv/path validation; pass-only nonzero counts; local/production authority separation | All tasks use existing Node fake-boundary/default tests, literal path equality, exact counts, and terminal `BLOCKED`; no install, Docker, network, or deployment action exists. | COVERED |
| CONTEXT | D-01, D-02, D-03, D-04, D-05 | The fixed command/port/explicit invocation/output contracts are unchanged; Task 2 preserves clean branch/full-SHA authority and does not run delivery. | COVERED |
| CONTEXT | D-06, D-07, D-08, D-09 | Offline seed/build/public-origin behavior is untouched and no build or registry action runs. | COVERED |
| CONTEXT | D-10, D-11, D-12, D-13, D-14 | No volume, migration, cutover, rollback, claim, or receipt mutation occurs; exact descendant policy preserves durable per-revision authority. | COVERED |
| CONTEXT | D-15, D-16, D-17, D-18, D-19 | Fake-boundary/default tests avoid canonical runtime mutation; Task 3 proves the current exact pass-only count; receipts remain sanitized, immutable, and `BLOCKED`. | COVERED |

Deferred production deployment, server cutover, TLS, secondary-server rollout, GitHub CI/registry publishing, and unrelated API-fetch hardening remain excluded. No relevant GOAL, REQ, RESEARCH, or CONTEXT item is unplanned.

<output>
After implementation, create `.planning/quick/260904-jio-phase-08-08-uat-md-uat-main/260904-jio-SUMMARY.md`. The executor commits only the three task-owned slices in RED/GREEN/docs order; the quick orchestrator owns any later metadata handling and must preserve the pre-existing `08-VERIFICATION.md` change. Push `dev` only through the parent workflow after all checks pass; never modify or push `main`.
</output>
