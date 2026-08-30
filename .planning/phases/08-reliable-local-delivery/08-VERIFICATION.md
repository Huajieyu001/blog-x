---
phase: 08-reliable-local-delivery
verified: 2026-08-30T06:15:58Z
status: gaps_found
score: 4/5 ROADMAP success criteria verified
behavior_unverified: 0
flagged_prohibitions: 4
decision_coverage:
  honored: 19
  total: 19
  not_honored: []
---

# Phase 08: Reliable Local Delivery Verification Report

**Phase Goal:** 每个大步骤完成后，最新代码都能安全、可复现地出现在固定 `3100` 环境并获得机器可读验证。
**Verified:** 2026-08-30T06:15:58Z
**Status:** `gaps_found`

## Goal Achievement

### Observable Truths

ROADMAP success criteria are the primary contract and therefore override the narrower PLAN-level implementation truths.

| # | Observable truth | Status | Evidence |
|---|---|---|---|
| 1 | One command repeatedly updates canonical `blogxlocal`, preserves PostgreSQL/media, migrates, and reaches three healthy services after **every** major step. | ✗ FAILED | The command succeeded for reviewed revision `a204ee4faeef0ba25562e58660afd04499b6eb97`, but the only writable authority is hard-coded to `ops/v1.1-local-delivery-evidence.successor-2.json` and `blog-x-v1.1-local-delivery-successor-2` (`scripts/refresh-local-runtime-core.mjs:19-23`). That committed receipt now exists. Every later delivery unconditionally calls `assertEvidenceAbsent()` during preflight and rejects the existing final file (`:644-647`, `:701`), after already publishing a terminal per-revision claim (`:1027-1031`). There is no revision-addressed or successor-3 authority. A future source revision therefore cannot be delivered by the same command without another code change. |
| 2 | Offline refresh is independent of registry DNS after seed preparation and embeds only `http://127.0.0.1:3100`. | ✓ VERIFIED | Both target images in the independently verified successor receipt use refresh kind `v1.1-offline-local-delivery`, immutable seed IDs, the committed lock digest, and exact public origin. Focused tests exercise `--network=none`, `--pull=false`, neutral-store reuse, frozen inputs, and rejection paths. |
| 3 | Wrong project/volume/source/image authority fails closed without deleting unrelated resources. | ✓ VERIFIED | 60 refresh tests plus two opt-in live-Docker cleanup regressions passed. The live regression proved both cooperative and forced termination affect only a random `blogxverify_*` namespace; canonical `blogxlocal` state was unchanged. Boundary scan reported 411 files and zero findings. |
| 4 | Complete v1.1 acceptance covers discovery, responsive browser behavior, boundaries, visible fixed-runtime routes, and current delivered revision. | ✓ VERIFIED | `ops/v1.1-local-delivery-evidence.successor-2.json` binds 1,359 Phase 6 plus 15 Phase 7 checks (1,374/1,374 pass-only, zero fail/cancel/skip/TODO) to revision `a204ee4…`. The independent verifier passed. `/`, `/search`, and `/api/health` returned 200; the receipt honestly records `empty_public_set`. |
| 5 | Local success remains production `BLOCKED` and adds no SSH/deployment/cloud authority. | ✓ VERIFIED | Independent receipt verification ended `RELEASE BLOCKED`; source boundary scan found zero findings; the acceptance coordinator and refresh command policy reject remote/deployment command families. No cloud server was contacted. |

**Score:** 4/5 ROADMAP truths verified.

The 21 positive PLAN-level truths are structurally present and covered by focused tests or the committed delivery receipt. They do not close Truth 1: the plans proved two numbered deliveries, while the phase goal requires an ongoing workflow after every future major step.

### Required Artifacts

| Artifact group | Status | Details |
|---|---|---|
| `package.json` | ✓ EXISTS + SUBSTANTIVE + WIRED | Exact `"local:deliver": "node scripts/refresh-local.mjs"` at line 17. The GSD key-link query's one failure was a quoting-pattern false negative; direct inspection confirms the link. |
| `scripts/refresh-local.mjs` | ✓ EXISTS + SUBSTANTIVE + WIRED | Sealed CLI, fixed plan, acceptance-before-migration ordering, offline plan and progress reporting. |
| `scripts/refresh-local-runtime-core.mjs` | ⚠️ SUBSTANTIVE + WIRED, GOAL GAP | Implements claims, exact argv, rollback, receipt publication and verification, but hard-codes the exhausted `successor-2` receipt/claim authority. |
| `scripts/refresh-local-facts.mjs` | ✓ EXISTS + SUBSTANTIVE + WIRED | Exact canonical containers, port, volumes, Git, route, reading and persistence projections. |
| `scripts/refresh-local-live.mjs` / `scripts/refresh-local-test-core.mjs` | ✓ EXISTS + SUBSTANTIVE + WIRED | Production assembly is sealed; injection stays in test core. |
| `scripts/local-verify.mjs` / `scripts/phase7-browser-verify.mjs` | ✓ EXISTS + SUBSTANTIVE + WIRED | Generated namespace/port acceptance emits strict count records and structured cleanup acknowledgement. |
| `scripts/local-delivery-acceptance.mjs` and test core | ✓ EXISTS + SUBSTANTIVE + WIRED | Zero-argument production coordinator invokes only the full Phase 6 and unfiltered Phase 7 command families. |
| Refresh/acceptance/verifier tests | ✓ EXISTS + SUBSTANTIVE | 98 unique phase-focused tests were exercised across normal and opt-in modes; all passed. |
| `apps/api/Dockerfile.refresh` / `apps/web/Dockerfile.refresh` | ✓ EXISTS + SUBSTANTIVE + WIRED | Offline provenance labels and fixed public origin are consumed by plan and verifier checks. |
| Historical receipt `ops/v1.1-local-delivery-evidence.json` | ✓ IMMUTABLE HISTORY | Binds original delivery revision `4414710…`; rejected as current successor authority. |
| Current receipt `ops/v1.1-local-delivery-evidence.successor-2.json` | ✓ VALID CURRENT EVIDENCE, ✗ NOT REUSABLE AUTHORITY | Independently verified, byte-preserving, pass-only and `BLOCKED`; its fixed non-overwrite path prevents the next source delivery. |

**Artifacts:** 19/19 declared PLAN artifact checks exist and are substantive; 18/19 automated key-link patterns matched, and direct inspection confirms the remaining package-script link. One artifact design remains insufficient for the phase's repeatability goal.

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `package.json` | `scripts/refresh-local.mjs` | Direct no-argument Node invocation | ✓ WIRED | Exact script value at `package.json:17`. |
| Refresh CLI | runtime core | Sealed `runRefreshCliBoundary` | ✓ WIRED | Production factory and fixed plan are closed over. |
| Runtime core | `compose.yaml` | Exact token allowlist | ✓ WIRED | Only project `blogxlocal`, fixed compose file, API/Web cutover and exact retained volumes are admitted. |
| Acceptance coordinator | Phase 6 / Phase 7 runners | Two literal Node argv families | ✓ WIRED | Full Phase 6 interruption/parallel mode and unfiltered Phase 7 are mandatory. |
| Runtime core | acceptance result | `accept-v1.1` before migration | ✓ WIRED | Failed/malformed evidence blocks before canonical migration/cutover. |
| Runtime core | fixed facts / receipt | Reconstruction + atomic publication | ✓ WIRED FOR CURRENT RECEIPT | Current receipt verifies without byte changes. |
| New clean source revision | new immutable receipt | Future/revision-addressed authority | ✗ NOT WIRED | No path/authority derivation exists beyond the already-consumed `successor-2` slot. |

## Requirements Coverage

| Requirement | Status | Evidence / blocking issue |
|---|---|---|
| DEVX-01 | ✗ BLOCKED | One fixed command delivered the reviewed revision and preserved both volumes, but cannot perform the next update because the fixed final receipt already exists. |
| DEVX-02 | ✓ SATISFIED | Offline build/probe, immutable seeds, exact lock/store/origin, and no alternate Compose authority are implemented and behaviorally exercised. |
| DEVX-03 | ✗ BLOCKED | The last reviewed revision has excellent machine evidence, but “每个大步骤” is not sustainable: the next source revision has no available receipt authority. |

**Coverage:** 1/3 requirements fully satisfied as ongoing capabilities; 2 are blocked by the single-use successor authority.

## Behavioral Verification

| Check | Result | Detail |
|---|---|---|
| Phase-focused tests | ✓ 96 passed, 2 opt-in skipped | Refresh, acceptance, verifier, child-tree and source-policy tests; zero fail/cancel/TODO. |
| Opt-in active Docker cleanup | ✓ 2/2 passed | Cooperative TERM emitted exact cleanup acknowledgement; forced SIGKILL emitted none; harness removed only its random namespace. |
| Boundary audit | ✓ Passed | `BLOG X BOUNDARY RESULT {"filesChecked":411,"findings":0,"outcome":"pass"}`. |
| Syntax / whitespace checks | ✓ Passed | Changed delivery modules passed `node --check`; `git diff --check` passed. |
| Independent successor receipt verifier | ✓ Passed | `LOCAL REFRESH EVIDENCE VERIFIED; RELEASE BLOCKED`; receipt bytes stayed unchanged. |
| Fixed routes | ✓ Passed | `/`, `/search`, `/api/health` each returned HTTP 200 from `127.0.0.1:3100`. |
| Canonical Docker topology | ✓ Passed | Exactly three `blogxlocal` containers were healthy; only Web published `127.0.0.1:3100`; exact media/PostgreSQL volumes were present. |
| Default project test command (`corepack pnpm test`) | ✗ Failed | Contracts passed 10/10. API reported 26 pass, 3 fail and 15 skip because the direct package command did not provide runner-owned database/backup/media authorities; pnpm stopped before Web. The generated canonical acceptance later proved those suites in their required environment, but the verifier workflow treats a failing default test command as a blocker. |

`local:deliver` was deliberately **not** run during verification. Running it would mutate canonical runtime and, with the current committed receipt, would consume a new revision claim before predictably failing at receipt preflight.

## Test Quality Audit

| Test file / evidence | Linked req | Active evidence | Skipped | Circular | Strongest assertion | Verdict |
|---|---|---:|---:|---|---|---|
| `scripts/refresh-local.test.mjs` | DEVX-01/02/03 | 60 pass | 0 | No | Behavioral multi-stage/fault/rollback/evidence | Strong, but lacks two-successive-source-deliveries regression |
| `scripts/local-delivery-acceptance.test.mjs` | DEVX-03 | 7 pass | 0 on this platform | No | Behavioral process-tree, exact records and redaction | Strong |
| `scripts/local-verify.test.mjs` | DEVX-02/03 | 29 pass | 0 | No | Value + behavioral selection/cleanup contracts | Strong |
| `scripts/local-delivery-active-cleanup.test.mjs` | DEVX-01/03 prohibitions | 2 pass in opt-in run | 0 in opt-in run | No | Real Docker state transition | Strong |
| Successor receipt | DEVX-01/02/03 | 1,374 pass-only | 0 | No | Generated integration + browser + runtime reconstruction | Strong for revision `a204ee4…` |

- Disabled requirement tests: no unresolved skips after the opt-in Docker run. Platform-specific process-group cases were active on this macOS verification host.
- Circular patterns: none. Test file writes create temporary known-bad/known-good fixtures; they do not derive expected results from the system under test.
- Assertion strength: value/behavioral throughout the phase-critical paths.
- Missing behavioral case: no test performs two successful deliveries for two distinct source revisions while preserving the first receipt. Current source makes that behavior impossible rather than merely unobserved.

## Prohibition Disposition

All four PLAN prohibitions are descriptor-less and explicitly marked `status: unverified, flagged: true`. Under the GSD verification protocol they are judgment-tier; automated evidence can support a non-authoritative judgment but cannot silently turn them green.

| Prohibition | Non-authoritative observed verdict | Protocol disposition |
|---|---|---|
| Do not reset/replace canonical volumes or remove unrelated resources. | No violation observed; active Docker regression preserved canonical snapshots. | ⚠️ `unverified-prohibition` — human review recommended |
| Do not use registry/network fallback, host dependencies, alternate project or generated canonical origin. | No violation observed; exact argv/source tests and receipt provenance agree. | ⚠️ `unverified-prohibition` — human review recommended |
| Do not use canonical `blogxlocal` data/port as exhaustive acceptance fixtures. | No violation observed; generated namespaces/ports and cleanup acknowledgements were verified. | ⚠️ `unverified-prohibition` — human review recommended |
| Do not introduce SSH/deploy/cloud mutation or any decision beyond `BLOCKED`. | No violation observed; boundary scan was clean and receipt remains `BLOCKED`. | ⚠️ `unverified-prohibition` — human review recommended |

## Decision Coverage

All 19/19 trackable CONTEXT.md decisions are honored by shipped artifacts according to `check.decision-coverage-verify`. This is a non-blocking heuristic and does not override the repeatability gap.

## Anti-Patterns Found

No implementation stubs, placeholder output, unreferenced TODO/FIXME/XXX markers, log-only functions, or production remote/deployment capability were found in the phase files. Scanner matches were parser vocabulary or deliberate negative fixtures.

## Human Verification

N/A for user-facing UAT — this is an infrastructure/tooling phase and all behavior relevant to the fixed local runtime was checked programmatically. `behavior_unverified: 0`.

The four descriptor-less prohibition flags above still require review acknowledgement under the GSD protocol; no artificial manual command or visual test is proposed.

## Gaps Summary

### Critical Gaps

1. **The delivery workflow is exhausted after `successor-2`.**
   - Missing: revision-addressed (or otherwise unbounded) immutable receipt authority that can create a new non-overwriting receipt for every clean source SHA.
   - Impact: the next major source change cannot be delivered to fixed `3100` with `local:deliver`; DEVX-01, DEVX-03 and the phase goal fail as ongoing capabilities.
   - Evidence: fixed constants at runtime-core lines 19-23; committed final successor receipt; unconditional final-file absence gate at lines 644-647/701; claim publication precedes that gate at lines 1027-1031.

2. **The default repository test command is red outside the generated integration harness.**
   - Missing: a default test command whose declared environment-independent scope passes, or an explicit GSD `workflow.test_command` that invokes the correct generated harness.
   - Impact: generic verification reports three failures and fifteen skips before Web tests even run, despite the formal delivery harness having valid 1,374/1,374 evidence.
   - Evidence: `corepack pnpm test` exit 1; failures require runner-owned database/backup/media authorities.

No later milestone phase exists, so neither gap can be deferred.

## Recommended Fix Plans

### 08-04-PLAN.md: Make delivery authority revision-addressed

**Objective:** Allow every future clean revision to publish a distinct immutable receipt while preserving all historical receipts and the one-claim-per-SHA rule.

**Tasks:**

1. Replace the numbered fixed receipt/claim slot with a sealed revision-derived authority (for example, an exact receipt directory plus `<full-sha>.json`), retaining secure non-overwrite publication and fixed no-argument operator authority.
2. Update live verification, Git-delta rules, terminal output and tests so the command derives only the current clean SHA's path and historical receipts remain read-only.
3. Add a behavioral regression that completes two distinct source revisions sequentially, verifies both receipts independently, and proves the second runtime/receipt binds the second SHA without modifying the first.

**Estimated scope:** Medium.

### 08-05-PLAN.md: Normalize the repository verification entry

**Objective:** Make the verifier's declared default test command honest and reproducible without weakening integration coverage.

**Tasks:**

1. Separate environment-independent package tests from runner-owned database/backup/media suites, or set an exact GSD `workflow.test_command` to the canonical generated test harness.
2. Prove the default command exits zero with no unexplained skips and retain the full generated Phase 6/7 acceptance as the integration gate.
3. Re-run Phase 08 verification, including the two-revision delivery regression, independent receipt verification, boundary scan and fixed-runtime route checks.

**Estimated scope:** Small to medium.

## Verification Metadata

- Verification approach: goal-backward, using the five ROADMAP success criteria as primary truths.
- PLAN must-haves: 21 positive truths, 19 artifact declarations, 19 key links and 4 descriptor-less prohibitions inspected.
- Automated checks: focused phase checks passed; independent receipt/runtime checks passed; default project test command failed as documented.
- Deferred filtering: none; Phase 08 is the final v1.1 phase.
- Worktree: clean before all behavioral checks and before this report was written.
- Runtime mutation: no `local:deliver`; only generated random-namespace Docker cleanup tests and read-only canonical inspections.
- Server scope: neither cloud server was contacted or modified.

---

*Verified: 2026-08-30T06:15:58Z*
*Verifier: the agent (generic GSD verifier workaround)*
