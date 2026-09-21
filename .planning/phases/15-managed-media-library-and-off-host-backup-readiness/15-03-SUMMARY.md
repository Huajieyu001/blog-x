---
phase: 15
plan: "03"
subsystem: backup-recovery
tags: [backup, encryption, retention, recovery, systemd]
requires: [15-01, 15-02]
provides: [protected-backup-profile, bounded-known-good-retention, disposable-recovery-authority]
affects: [local-delivery, operator-backup-setup]
tech-stack:
  added: []
  patterns: [protected-runtime-profile, authority-preflight, generated-only-recovery]
key-files:
  created: []
  modified:
    - scripts/backup/production/policy.mjs
    - scripts/backup/production-pipeline.mjs
    - scripts/backup/production/retention.mjs
    - scripts/backup/production.test.mjs
decisions:
  - "Operator profiles are loaded only from a restrictive generated fixture path or the fixed service authority, then all destination/key/result authorities are validated before collection."
  - "A catalogue below its configured minimum known-good count is a failed retention state, never a successful backup outcome."
metrics:
  completed: "2026-09-22"
status: complete
actuals:
  tokens: 3318
  tasks: 3
  commits: 7
---

# Phase 15 Plan 03: Configurable Off-host Backup Readiness Summary

Backup readiness is sealed around encrypted mounted-directory transfers, protected external profiles, bounded known-good retention, and generated-only restore authority; the corrected clean revision passed formal local delivery and now powers the fixed preview.

## Completed Tasks

1. Audited the existing encrypted mounted transfer/profile/result implementation and added a restrictive runtime profile loader plus pre-collection authority validation. (`c6927cd`)
2. Enforced minimum known-good catalogue preservation and audited the existing inert, credential-free templates under the canonical `ops/systemd/` authority. (`44cac01`, corrected by `17f0f7c`)
3. Audited the existing recovery drill and Phase 15 generated local-verifier path; it already requires encrypted complete sets and exact generated restore database/media/browser authorities. The first clean-SHA attempt exposed a test-fixture constraint error; after a one-line fixture correction, the new clean revision passed formal delivery.

## Verification

- Passed: `node --test scripts/backup/production.test.mjs` — 16/16.
- Passed: `node --test scripts/backup/production.test.mjs scripts/backup/backup.test.mjs` — 23/23.
- Passed: `node scripts/check-boundaries.mjs` — 695 files, zero findings.
- Passed: package API test command, which covers its configured renderer/security suites.
- Expected fail-closed: direct `corepack pnpm --filter @blog-x/api exec tsx --test test/backup-restore.test.ts` reported `managed restored database, backup, and media roots are required`; no generated restore authority exists outside the formal gate.
- Formal refresh: exactly once at clean revision `44cac012129e559da2742d4eba4e64ad2c08ac05`; failed at `accept-v1.1` with `generated_child_exit`. Failure evidence: `/private/tmp/blog-x-refresh-attempts-v1.1/44cac012129e559da2742d4eba4e64ad2c08ac05.failure.json`.
  - Baseline: applicable; recollection: collected; preservation: proved.
  - No delivery receipt was created. Fixed local preview stayed healthy on its prior revision. No retry was run and production remains `BLOCKED`.
- Diagnosis reproduced the exact child failure: the new deleted-draft media fixture set `cover_media_id` without the required non-empty `cover_alt`, violating `articles_cover_alt_check`. Commit `d447a3a` corrected only that generated test row.
- A new formal attempt for clean corrected revision `d447a3a3c0af5dccbc119b5d81ee23b19490f3fc` passed: generated integration 96/96, Phase 7 browser 17/17, total 113/113; home and health routes return 200. Receipt: `ops/local-deliveries/d447a3a3c0af5dccbc119b5d81ee23b19490f3fc.json`. Production remains `BLOCKED`.

## Deviations from Plan

### Auto-fixed Issues

1. [Rule 2 - Security] The runtime pipeline parsed an object but did not validate the operator profile file boundary itself before use.
- **Found during:** Task 1
- **Fix:** Added restricted service/generated profile paths, no-link/owner/mode/size checks, strict JSON parsing, and authority preflight before collection.
- **Files modified:** `scripts/backup/production/policy.mjs`, `scripts/backup/production-pipeline.mjs`, `scripts/backup/production.test.mjs`
- **Commit:** `c6927cd`

2. [Rule 2 - Security] Retention could return success when a valid catalogue contained fewer sets than `minimumKnownGood`.
- **Found during:** Task 2
- **Fix:** Fail closed before deletion whenever the catalogue is below the configured known-good minimum.
- **Files modified:** `scripts/backup/production/retention.mjs`, `scripts/backup/production.test.mjs`
- **Commit:** `44cac01`

3. [Rule 1 - Bug] The initial implementation duplicated the already authoritative systemd templates under `scripts/ops/` and repointed the test at the duplicate.
- **Found during:** Root review
- **Fix:** Removed only the newly added duplicates and restored the test to the existing `ops/systemd/` authority, preventing two deployable templates from drifting.
- **Files modified:** `scripts/backup/production.test.mjs`; newly added duplicate files removed
- **Commit:** `17f0f7c`

## Operator Gate

No real off-host credential, mount, provider profile, or destination was configured or contacted. An operator must provision those external authorities separately; local readiness and recovery verification are complete.

## Security Closure

- Repository-visible configuration contains references only; profile file bytes are runtime-only and must be owner-restricted.
- Transfer remains fixed-API, mounted-identity, ciphertext/receipt-only with no shell interpolation, remote command, retry loop, or plaintext destination copy.
- Retention and recovery reject ambiguous/incomplete sets and only use exact generated restore authorities.
- No schema, migration, dependency, cloud endpoint, server operation, credential, or production action was introduced.

## Self-Check: PASSED

- `15-03-SUMMARY.md` exists.
- Commits `c6927cd`, `44cac01`, and `17f0f7c` exist.
- Fixture correction `d447a3a` and its formal delivery receipt exist; the fixed preview is healthy on that implementation revision.
