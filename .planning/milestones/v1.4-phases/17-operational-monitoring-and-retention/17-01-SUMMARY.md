---
phase: 17
plan: "01"
subsystem: operational-acceptance
tags: [retention, monitoring, secondary-timer, local-gate]
dependency_graph:
  requires: [bounded-retention-authority, dormant-secondary-timer]
  provides: [deterministic-ops-07-local-acceptance]
  affects: [operations-verification]
tech_stack:
  added: []
  patterns: [fixed-command-manifest, fail-fast-child-propagation, aggregate-only-evidence]
key_files:
  created: []
  modified:
    - scripts/ops/phase17-acceptance.mjs
    - scripts/ops/phase17-acceptance.test.mjs
decisions:
  - Keep Phase 17 acceptance as fixed checked-in local commands; no operator activation is performed.
metrics:
  tasks: 2
  commits: 1
status: complete
requirements-completed: [OPS-07]
---

# Phase 17 Plan 01: Operational Retention Acceptance Closure Summary

The deterministic Phase 17 local gate now covers bounded aggregated-view/session retention and the dormant secondary timer contract alongside all existing secret-free operational status suites.

## Completed Tasks

1. Replaced the single Node test list with a fixed two-command manifest: existing local status/notification/monitor/TLS/systemd/job-result suites plus the secondary deployment/timer contract, followed by the API-workspace TypeScript retention suite.
2. Added manifest regressions for exact-once suite membership, fixed commands, and fail-fast nonzero child propagation; audited existing fixture suites as aggregate-only and activation-free.

## Verification

- Passed: Phase 17 acceptance-manifest tests (2 tests)
- Passed: Phase 17 generated acceptance gate (41 static operational tests plus 1 retention argument/output test; 1 disposable database retention test skipped because `OPERATIONAL_RETENTION_TEST_DATABASE_URL` is absent)
- Passed: API typecheck
- Passed: repository boundary scan (707 files, 0 findings)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking environment issue] Used Node's explicit `tsx` loader for the fixed retention test.**
- **Found during:** Task 1 gate run
- **Issue:** invoking the `tsx` CLI from the acceptance runner tried to create a restricted IPC socket and failed with `EPERM`.
- **Fix:** run the same checked-in API test with `node --import tsx --test` inside the fixed API workspace command.
- **Impact:** no new dependency, shell interpolation, network access, or behavioral authority.

## Security Closure

The runner accepts no command or path input, uses only literal checked-in arguments, stops at the first nonzero child result, and runs static timer/monitor tests only. It does not contact providers, start Docker, install/enable systemd or cron units, or expose credentials, database URLs, session/article identifiers, or filesystem authorities.

## Commits

- `6479eb4` — `test(17-01): cover retention in operations acceptance`

## Self-Check: PASSED

Both scoped scripts and this summary exist; the code commit exists and `git diff --check` passed.
