---
phase: 05-v1-0-integration-gap-closure
plan: "02"
subsystem: operations, backup, encryption, testing
tags: [backup, aes-256-gcm, mounted-directory, receipt, retention, systemd, node-test]
requires:
  - phase: 05-01
    provides: exact Phase 5 migration-count and retained-source media policy
  - phase: 04-02
    provides: rehearsal-only complete-set format, manifest binding, and isolated restore authority
provides:
  - authority-parameterized complete-set verification with mutually exclusive rehearsal and production roots
  - fixed-operation production collection, authenticated mounted-directory transfer, receipt-gated retention, and redacted outcomes
  - dormant collect-then-mounted pipeline/service contract with generated-only local proof
affects: [05-03-release-gate, ops-03, ops-05, phase5-full-gate]
actuals:
  tokens: 23896
  tasks: 4
  commits: 9
tech-stack:
  added: []
  patterns: [mandatory-root-validator, fixed-named-collector-operations, aes-gcm-bound-metadata, mounted-receipt-before-retention, generated-fake-non-evidence]
key-files:
  created: [scripts/backup/content-verifier.mjs, scripts/backup/production/collector.mjs, scripts/backup/production/adapter.mjs, scripts/backup/production/mounted-directory.mjs, scripts/backup/production-pipeline.mjs]
  modified: [scripts/backup/manifest.mjs, scripts/backup/production/source-authority.mjs, scripts/backup/production/policy.mjs, scripts/backup/production.test.mjs, ops/systemd/blog-x-backup.service]
key-decisions:
  - "Rehearsal and production share only read-only complete-set semantics; each wrapper supplies its own mandatory root authority."
  - "The shipped provider is a pre-existing mounted directory with a strict identity sentinel; generated mount fixtures prove local filesystem behavior only."
  - "Pipeline success requires fresh collection, receipt-gated retention, a redacted result, and a recorded alert outcome; generated and fake scopes remain non-live evidence."
patterns-established:
  - "Production backups: fixed named operations write a restrictive incomplete sibling, write manifest-bound COMPLETE last, verify, then atomically rename."
  - "Mounted transfer: validate mount identity before mutation, write only ciphertext and a digest-bound receipt, catalog before retention, and preserve the minimum known-good set."
requirements-completed: [OPS-03, OPS-05]
coverage:
  - id: D1
    description: "Shared complete-set content verification accepts only the caller's mandatory root authority, preserving all rehearsal behavior while rejecting production-shaped roots."
    requirement: OPS-03
    verification:
      - kind: unit
        ref: "node --test scripts/backup/backup.test.mjs scripts/backup/production.test.mjs scripts/backup/restore.test.mjs"
        status: pass
    human_judgment: false
  - id: D2
    description: "The production collector creates fresh verified database, portable export, source/derivative media, and config/image/migration inventory sets through fixed named operations."
    requirement: OPS-03
    verification:
      - kind: integration
        ref: "scripts/backup/production.test.mjs#collector atomically creates a fresh all-authority production set through fixed named operations"
        status: pass
    human_judgment: false
  - id: D3
    description: "Concrete generated mount fixtures exercise AES-GCM ciphertext, receipt binding, catalog-safe retention, redacted results, and alert outcomes without placing plaintext on the mount."
    requirement: OPS-03
    verification:
      - kind: integration
        ref: "scripts/backup/production.test.mjs#concrete generated mount receives only authenticated ciphertext, receipt, result, and alert outcome"
        status: pass
      - kind: unit
        ref: "scripts/backup/production.test.mjs#receipt-gated retention preserves the minimum known-good ciphertext and deletes nothing on catalog ambiguity"
        status: pass
    human_judgment: false
  - id: D4
    description: "The dormant pipeline creates and verifies its own fresh set before adapting it, rejects manual/fake shortcuts, and the service template requires untracked path and mount prerequisites."
    requirement: OPS-05
    verification:
      - kind: integration
        ref: "scripts/backup/production.test.mjs#pipeline creates and verifies a fresh set before the concrete mounted adapter"
        status: pass
      - kind: unit
        ref: "scripts/backup/production.test.mjs#pipeline unit contract remains dormant, strict, collect-then-adapt, and prohibition-fixture controlled"
        status: pass
    human_judgment: false
  - id: D5
    description: "Generated fake and generated mounted results cannot parse as live production or release evidence."
    requirement: OPS-05
    verification:
      - kind: unit
        ref: "scripts/backup/production.test.mjs#a successful generated fake remains fault-only and cannot parse as production release evidence"
        status: pass
    human_judgment: false
duration: 19min
completed: 2026-08-09
status: complete
---

# Phase 05 Plan 02: Production Backup Adapter Summary

**Blog X now collects a fresh complete production-format set, encrypts it with bound AES-256-GCM metadata, atomically transfers ciphertext to a verified mounted directory, records a receipt and retention result, and fails closed unless every local authority exists.**

## Performance

- **Duration:** 19 min
- **Started:** 2026-08-09T17:34:49Z
- **Completed:** 2026-08-09T17:53:58Z
- **Tasks:** 4
- **Files modified:** 18

## Accomplishments

- Extracted reusable byte/semantic complete-set inspection behind a mandatory root validator, so Phase 4 rehearsal authority remains unchanged while strict production source roots cross-reject it.
- Added fixed local collector operations for PostgreSQL custom dumps, unchanged portable export v1, API-owned source/derivative media, and allowlisted config/image/migration inventory; restrictive staging is verified before atomic publication.
- Added AES-256-GCM encryption with AAD bound to the set/manifest/time/retention/profile facts, a concrete mounted-directory ciphertext/receipt/catalog provider, receipt-gated minimum-known-good retention, redacted append-only result/alert records, and fake-only fault injection.
- Added a production pipeline that always collects and read-back verifies a new set before adaptation, plus a hardened dormant daily service contract and fail-first/clean prohibition descriptors.

## Task Commits

1. **Task 1: Split content verification from mutually exclusive source authorities** — `1c13948` (RED), `8857709` (GREEN)
2. **Task 2: Collect and atomically finalize every production content authority** — `0ef26e0` (RED), `a9be83a` (GREEN)
3. **Task 3: Execute authenticated transfer and retention through the concrete mounted provider** — `2472eec` (RED), `b380c18` (GREEN), `4d72ac9` (fake-evidence regression)
4. **Task 4: Wire the scheduled collect-then-adapt pipeline without claiming live activation** — `fe065da` (RED), `2067021` (GREEN)

## Acceptance Evidence

- `node --test scripts/backup/backup.test.mjs scripts/backup/production.test.mjs scripts/backup/restore.test.mjs` — 23 passed; no skipped or TODO tests.
- Clean prohibition descriptor: `GSD_PROHIB_SUBJECT=scripts/fixtures/prohibitions/production-backup-safe.json node --test scripts/backup/production.test.mjs` — 11 passed.
- Unsafe prohibition descriptor: `production-backup-incomplete-or-unsafe.json` — exited nonzero as required before it could be accepted as safe evidence.
- `corepack pnpm -r typecheck` — contracts, API, and Web type checks passed.
- Concrete pipeline coverage executes the exported `production-pipeline.mjs` journey only against generated source/key/mount/result/alert fixtures; no systemd unit, real mount, network endpoint, cloud host, or live alert was invoked.

## Decisions Made

- Rehearsal and production may reuse the complete-set format but never the root authority, cleanup rules, or collection namespace.
- Mounted-directory code verifies an already provisioned mount identity and writes only encrypted objects/receipts; generated fixtures are explicitly scoped local proof, not off-host evidence.
- A fake transport is retained solely for deterministic fault injection and is rejected by the production/release evidence parser even when its simulated journey completes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Path semantics] Allowed the OS canonical temporary-parent path while retaining direct link rejection.**
- **Found during:** Task 1 generated production-source validation.
- **Issue:** The operating system canonicalizes the temporary parent path even when the generated source directory itself is not a link; comparing the lexical and canonical base path rejected a valid exact fixture.
- **Fix:** Compare canonical parent/child containment after direct `lstat` link checks instead of requiring the lexical parent string to equal its canonical representation.
- **Files modified:** `scripts/backup/production/source-authority.mjs`
- **Verification:** Source/rehearsal cross-rejection and complete-set tests passed.
- **Committed in:** `8857709`

**2. [Rule 1 - Repeat-safe provider] Made the verified mounted object prefix reusable without weakening object collision protection.**
- **Found during:** Task 3 repeated fault coverage.
- **Issue:** A later independent backup could not use an already verified empty object directory because creating the fixed prefix raised `EEXIST` before its safety checks.
- **Fix:** Accept only the existing exact prefix directory, immediately revalidate its type/ownership/mode, and retain exclusive ciphertext/receipt filenames.
- **Files modified:** `scripts/backup/production/mounted-directory.mjs`
- **Verification:** Repeated concrete/fault journeys and receipt-gated retention tests passed.
- **Committed in:** `b380c18`

---

**Total deviations:** 2 auto-fixed Rule 1 correctness issues.
**Impact on plan:** Both fixes preserve the specified authority and atomicity gates; no scope expansion occurred.

## Issues Encountered

None.

## User Setup Required

None - this plan deliberately does not provision a destination, mount a filesystem, install or enable systemd, configure credentials, or deliver a live alert.

## Next Phase Readiness

- 05-03 can consume the strict result scopes and concrete local implementation contracts while distinguishing them from missing live off-host/mount/schedule/alert evidence.
- Production canonical release remains `BLOCKED`; real mounted identity, off-host fact, active daily schedule, alert delivery, host/network/TLS, deployment, and post-release evidence remain unresolved future facts.

## Self-Check: PASSED

- All 18 plan artifacts exist; all nine 05-02 code/test commits are present in Git.
- The focused rehearsal, production, restore, clean/fail-first prohibition, and workspace typecheck commands passed with the expected unsafe-fixture nonzero result.
- Generated source/mount/key/result/alert fixture namespaces and the exact temporary prohibition log were cleaned; the working tree is clean.

---
*Phase: 05-v1-0-integration-gap-closure*
*Completed: 2026-08-09*
