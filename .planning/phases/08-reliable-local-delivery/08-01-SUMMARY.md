---
phase: 08-reliable-local-delivery
plan: "01"
subsystem: local-delivery
tags: [docker, compose, offline-build, provenance, evidence, node-test]
requires:
  - phase: 07-responsive-discovery-experience
    provides: fixed local Compose runtime and isolated visitor verification baseline
provides:
  - sealed `local:deliver` command and v1.1 local-delivery evidence authority
  - branch-qualified Git, canonical port-owner, immutable seed and offline provenance gates
  - deterministic, redacted seed pre-warm guidance before build, migration or cutover
affects: [08-02, 08-03, local-delivery]
actuals:
  tokens: 21491
  tasks: 2
  commits: 3
tech-stack:
  added: []
  patterns: [sealed Node CLI, token-level Docker argv allowlist, typed seed prerequisite failures]
key-files:
  created: []
  modified: [package.json, scripts/refresh-local.mjs, scripts/refresh-local-runtime-core.mjs, scripts/refresh-local-facts.mjs, scripts/refresh-local-live.mjs, scripts/refresh-local-test-core.mjs, scripts/refresh-local.test.mjs, apps/api/Dockerfile.refresh, apps/web/Dockerfile.refresh]
key-decisions:
  - "Docker ps short IDs are matched as a validated prefix of the inspected full container ID."
  - "Only typed seed validation branches produce pre-warm guidance; raw child failures remain unclassified."
patterns-established:
  - "Canonical runtime facts record only portOwnerExact, never raw Docker ps output."
  - "Seed failures publish their bound failure report before emitting one redacted remediation instruction."
requirements-completed: [DEVX-01, DEVX-02, DEVX-03]
coverage:
  - id: D1
    description: Sealed v1.1 receipt authority with branch-qualified clean revision checks.
    requirement: DEVX-03
    verification:
      - kind: unit
        ref: scripts/refresh-local.test.mjs#branch-qualified source authority rejects dirty, detached and malformed refs before adapter mutation
        status: pass
    human_judgment: false
  - id: D2
    description: Canonical loopback port owner and retained runtime topology fail closed.
    requirement: DEVX-01
    verification:
      - kind: unit
        ref: scripts/refresh-local.test.mjs#published 3100 owner must be the sole inspected canonical Web container
        status: pass
    human_judgment: false
  - id: D3
    description: Offline provenance seed prerequisites stop before build or cutover and provide redacted remediation.
    requirement: DEVX-02
    verification:
      - kind: unit
        ref: scripts/refresh-local.test.mjs#seed prerequisites classify only trusted validation failures before every build and print one redacted pre-warm instruction
        status: pass
    human_judgment: false
---

# Phase 08 Plan 01: Reliable Local Delivery Summary

**A sealed local-delivery implementation binds canonical `3100` ownership, clean branch-qualified source, offline target provenance, and a v1.1 evidence contract that can only end in `BLOCKED`.**

## Performance

- **Duration:** recovery session, under 1 hour
- **Completed:** 2026-08-20T02:42:14Z
- **Tasks:** 2/2
- **Files modified:** 9 implementation/test files; 3 closeout tracking files
- **Test metric:** 49/49 Node tests passed; no skipped or TODO tests

## Accomplishments

- Added the exact `local:deliver` package script delegating to the sealed no-argument Node CLI.
- Replaced the current receipt authority with `ops/v1.1-local-delivery-evidence.json`, format `blog-x-v1.1-local-delivery-evidence`, version 1, and branch-qualified Git facts.
- Added read-only canonical `3100` port-owner proof, v1.1 target provenance labels, five typed seed prerequisite classes, and a one-line redacted pre-warm instruction.
- Preserved the Phase 6 receipt unchanged (`16704ea439990dd31797620555b46ac202fc6468e4716175246b874f41f596f6`), retained canonical volumes, and the final `BLOCKED` release state.

## Task Commits

| Work | Commit | Evidence |
| --- | --- | --- |
| Recovered sealed implementation: Task 1 plus the remaining Task 2 runtime hardening | `0a051ed` | `feat(08-01): recover sealed local delivery implementation` |
| Task 2 regression coverage | `13d05cd` | `test(08-01): harden local delivery authority regressions` |

The documentation/tracking closeout is committed separately after this summary's self-check.

## Key Files

- `package.json` — exposes only the fixed `local:deliver` entry point.
- `scripts/refresh-local.mjs` and `scripts/refresh-local-runtime-core.mjs` — seal v1.1 provenance, branch-qualified source facts, seed prerequisites, and cutover ordering.
- `scripts/refresh-local-facts.mjs` — validates the sole canonical published-port owner and projects only `portOwnerExact`.
- `scripts/refresh-local-live.mjs` and `scripts/refresh-local-test-core.mjs` — share the one v1.1 evidence-path authority across live and test boundaries.
- `scripts/refresh-local.test.mjs` — covers source, port-owner, provenance, remediation, persistence, rollback, and receipt authority regressions.
- `apps/api/Dockerfile.refresh` and `apps/web/Dockerfile.refresh` — carry the exact offline v1.1 provenance label; Web embeds the canonical origin.

## Verification

- `node --check scripts/refresh-local.mjs && node --check scripts/refresh-local-runtime-core.mjs` — exit 0.
- `node --test scripts/refresh-local.test.mjs` — TAP: 49 tests, 49 pass, 0 fail, 0 cancelled, 0 skipped, 0 TODO (138.170458 ms).
- `node scripts/check-boundaries.mjs` — `BLOG X BOUNDARY RESULT {"filesChecked":398,"findings":0,"outcome":"pass"}`.
- `git diff --check` — exit 0.
- `git diff --quiet 20e6292..13d05cd -- compose.yaml ops/phase6-local-refresh-evidence.json scripts/refresh-seed-store.mjs` — exit 0; the preserved Phase 6 receipt SHA-256 is `16704ea439990dd31797620555b46ac202fc6468e4716175246b874f41f596f6`.
- No real no-argument delivery, Docker cutover, cloud/server access, or network action was run; final delivery remains reserved for 08-03.

## Decisions Made

- Use Docker's validated 12–64-character short-ID prefix only to bind `docker ps` output to the full inspected Web container ID; the name and Compose project/service labels must also match.
- Classify only trusted seed validation branches; child stderr/output is retained as an internal cause and never used for classification or printed remediation.

## Deviations from Plan

### Recovery implementation commit

The interrupted executor left uncommitted Task 1 and Task 2 runtime changes intermingled in the same sealed refresh files. To preserve that candidate work without destructive history operations, recovery committed the audited implementation together in `0a051ed`, followed by the distinct Task 2 regression hardening commit `13d05cd`.

### Auto-fixed Issues

**1. [Rule 1 - Correctness] Docker ps exposes a short container ID.**
- **Found during:** Task 2
- **Issue:** Comparing Docker's formatted short ID to `docker inspect`'s full ID would reject the real canonical Web owner.
- **Fix:** Require a valid short-ID prefix plus exact name and Compose labels.
- **Verification:** 49/49 Node tests, including foreign, malformed, zero and duplicate owner cases.
- **Committed in:** `13d05cd`

**Total deviations:** 1 auto-fixed (Rule 1), plus documented non-destructive recovery commit grouping.
**Impact on plan:** No scope expansion; the correction is required for the fail-closed port-owner gate to work with Docker's actual JSON output.

## Issues Encountered

- The inherited candidate changed v1.1 naming and Git facts but did not implement Task 2. Recovery completed the missing port-owner and seed-prerequisite behavior and added its coverage.
- The post-wave workspace build initially lacked the required production origin; rerunning with the locked `PUBLIC_ORIGIN=http://127.0.0.1:3100` and local internal API origin passed for contracts, API and Web.
- The generic recursive test command is not a valid standalone integration gate for this repository: database/backup suites require runner-owned PostgreSQL and managed media roots. The project `local:verify` runner was attempted as the proper isolated replacement, but its verification-image build stopped before tests because Corepack could not resolve `registry.npmjs.org`. This environmental DNS result is recorded as inconclusive, not passed; the focused 49-test refresh suite and boundary scan remain the evidence for 08-01, while 08-02/08-03 own complete isolated acceptance and final delivery.

## Next Phase Readiness

- 08-02 can build the isolated full Phase 6/7 acceptance result on the sealed v1.1 authority.
- The canonical delivery path remains local-only and release state remains `BLOCKED`; no server, SSH, Compose-down, volume removal, or real delivery invocation occurred.

## Self-Check: PASSED

All nine implementation/test key files exist; `0a051eda2162ff1e38406b6223849de46036b613` and `13d05cdc1f8907500b19608083df3c8f28d9fc57` exist in Git; and the focused verification above passed from this checkout.

*Phase: 08-reliable-local-delivery*
*Completed: 2026-08-20*
