---
phase: 06-public-discovery-data
plan: "10"
subsystem: infra
tags: [refresh, evidence-v4, atomic-files, docker-authority, tdd]

requires:
  - phase: 06-public-discovery-data
    provides: 06-08 refresh orchestration and 06-09 independent blocker audit
provides:
  - Reconstructable sanitized v4 local-refresh evidence with exact Git, database, seed, target and row-addressed ledger facts
  - Revision-bound atomic failure reports for every terminal post-claim path
  - Sealed local Docker authority, minimal child environment and redirect-free same-origin route proof
  - Fail-closed claim, report and evidence publication plus a formal read-only failure-report CLI
affects: [06-11-live-refresh, local-refresh, release-evidence]

actuals:
  tokens: 23195
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns: [sealed production factories, raw fake-boundary tests, canonical atomic JSON publication, row-addressed ledger proof]

key-files:
  created:
    - scripts/refresh-local-test-core.mjs
  modified:
    - scripts/refresh-local-facts.mjs
    - scripts/refresh-local-live.mjs
    - scripts/refresh-local.mjs
    - scripts/refresh-local.test.mjs

key-decisions:
  - "Publish the immutable revision claim before adapter construction, then make every later failure terminal through a canonical companion report."
  - "Normalize verifier Git facts only after independently proving ancestry, the intervening path allowlist and raw committed lockfile bytes."
  - "Treat evidence cleanup ambiguity as UNRECOVERABLE_EVIDENCE_INVARIANT instead of accepting a trusted-looking final."

patterns-established:
  - "Production authority order: clean Git -> absent claim -> atomic claim -> sealed adapter -> minimal environment -> local context/socket -> collectors."
  - "Failure proof: recollect canonical facts when possible; otherwise persist explicit not-applicable or unproved preservation."

requirements-completed: [SRCH-01, SRCH-02, SRCH-03, READ-08]

coverage:
  - id: D1
    description: Strict v4 evidence reconstructs exact revision, raw lock, database/schema, seeds, targets, topology, routes, persistence and deterministic ledger rows.
    requirement: SRCH-01
    verification:
      - kind: unit
        ref: scripts/refresh-local.test.mjs#v4 projection is revision and schema complete with row-addressed sanitized ledger transitions
        status: pass
      - kind: unit
        ref: scripts/refresh-local.test.mjs#evidence verification is read-only and refuses malformed or non-BLOCKED records
        status: pass
    human_judgment: false
  - id: D2
    description: Empty-argv execution claims before adapter construction and durably reports every later terminal failure.
    requirement: SRCH-02
    verification:
      - kind: unit
        ref: scripts/refresh-local.test.mjs#empty argv publishes claim before adapter construction and every later failure writes a durable report
        status: pass
      - kind: unit
        ref: scripts/refresh-local.test.mjs#failure-report CLI is exact, canonical, read-only and does not construct process or adapter authority
        status: pass
    human_judgment: false
  - id: D3
    description: Production child commands are minimal-environment and bound to an approved nonsymlink local Unix Docker socket.
    requirement: SRCH-03
    verification:
      - kind: unit
        ref: scripts/refresh-local.test.mjs#local Docker authority accepts only approved Unix contexts and child environment is minimal
        status: pass
      - kind: integration
        ref: node scripts/check-boundaries.mjs
        status: pass
    human_judgment: false
  - id: D4
    description: Route facts reject redirects and final URL or origin drift before evidence publication.
    requirement: READ-08
    verification:
      - kind: unit
        ref: scripts/refresh-local.test.mjs#route collection rejects redirects and final URL drift with redirect:error
        status: pass
    human_judgment: false
  - id: D5
    description: Production adapter and verifier factories are zero-argument sealed while tests trace raw source argv through a dedicated boundary core.
    requirement: SRCH-01
    verification:
      - kind: unit
        ref: scripts/refresh-local.test.mjs#production factories are sealed while test core exposes raw boundaries but no fact or probe injection
        status: pass
      - kind: unit
        ref: scripts/refresh-local.test.mjs#test core traces production Git and PostgreSQL sources from raw boundary output
        status: pass
    human_judgment: false

duration: 18min
completed: 2026-08-16
status: complete
---

# Phase 6 Plan 10: Audited Refresh Evidence and Failure Closure Summary

**Reconstructable evidence v4, terminal revision-bound failure reports, proven local Docker authority and fail-closed atomic publication are ready for the single 06-11 live attempt.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-08-16T15:59:59+08:00
- **Completed:** 2026-08-16T16:17:15+08:00
- **Tasks:** 2
- **Files modified:** 5 implementation/test files plus this summary

## Accomplishments

- Upgraded success evidence to strict v4 with exact Git/raw-lock, PostgreSQL identity/schema, seed/target provenance, topology/routes/release, all persistence facts and per-scope normalized ledger transitions.
- Made the claim the earliest post-Git boundary and added canonical atomic failure reports plus an exact read-only absent/present report CLI.
- Sealed production adapter/verifier factories, restricted subprocess environments, proved an approved local Unix Docker socket, rejected redirects/final-URL drift and hardened atomic cleanup invariants.

## Task Commits

1. **Task 1: Encode all five audited blocker groups as production-path RED tests** - `20572c8` (test)
2. **Task 2: Implement sealed v4 collection, terminal recollection and fail-closed publication** - `a17f6ba` (fix)

## Files Created/Modified

- `scripts/refresh-local-facts.mjs` - Canonical v4 facts, database/Git/seed/target projections and row-addressed persistence comparisons.
- `scripts/refresh-local-live.mjs` - Local authority proof, collectors/verifier, failure-report store and atomic v4 evidence publication.
- `scripts/refresh-local.mjs` - Git-to-claim production ordering, minimal process environment and exact report-check CLI.
- `scripts/refresh-local-test-core.mjs` - Dedicated raw process/filesystem/fetch/clock/random test boundary wiring.
- `scripts/refresh-local.test.mjs` - Five blocker-group regression coverage and raw production-source argv traces.

## Decisions Made

- A successful atomic claim permanently consumes the revision even if any later authority, collection, migration, rollback or report step fails.
- Failure reports contain only strict schema fields and canonical fact digests; unavailable recollection is persisted as `unproved`, never inferred as preserved.
- Recoverable evidence publication failures remove and fsync away the linked final; ambiguous cleanup raises an explicit unrecoverable invariant.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Tightening target provenance comparison exposed stale precomputed target values in fake fixtures; the fixtures were corrected to derive their target digests from the same selected-label source representation.
- Delaying collector construction to follow Docker socket proof required updating one static contract assertion to name the sealed production factory.

## Validation Results

- `node --test scripts/refresh-local.test.mjs` — 29/29 pass.
- `node --test scripts/local-verify.test.mjs` — 27/27 pass.
- `corepack pnpm -r typecheck` — pass for contracts, API and Web.
- `node scripts/check-boundaries.mjs` — 350 files checked, 0 findings.
- `node scripts/release-gate.mjs --evidence=ops/release-evidence.blocked.json --expect-blocked` — canonical `RELEASE BLOCKED`.
- `git diff --check` — pass.
- Protected milestone evidence, Phase 5 receipt, runtime evidence, 06-VERIFICATION, REQUIREMENTS, ROADMAP and STATE had no diff.

No Docker or Compose command, bare refresh, real claim/failure-report/evidence publication, network/server/deployment/push command, production connection or release transition ran during 06-10. No live-refresh attempt was consumed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 06-11 may perform its independent read-only plan check against the clean implementation-plus-summary revision and, only if clear, consume that revision's single local live-refresh attempt. Production remains frozen and release remains `BLOCKED`.

## Self-Check: PASSED

- All five declared implementation/test files exist and the RED/GREEN commits resolve.
- Coverage classification reports five automatically proven deliverables and no schema errors.
- The protected/runtime authority diff is empty and canonical release state is unchanged.

---
*Phase: 06-public-discovery-data*
*Completed: 2026-08-16*
