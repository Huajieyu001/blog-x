---
phase: 05-v1-0-integration-gap-closure
plan: "01"
subsystem: api, database, ui, testing
tags: [markdown, drizzle, postgres, nextjs, csp, playwright, backup-restore]
requires:
  - phase: 04-02
    provides: generated-only backup/restore rehearsal and authority comparison
provides:
  - exact same-origin published-image policy for Markdown and covers
  - lossless, idempotent legacy-media review disposition and migration verification
  - fresh and restored browser request proof with a known-bad prohibition fixture
affects: [05-02-production-backup, 05-03-release-gate, media-policy, ops-01]
actuals:
  tokens: 27565
  tasks: 3
  commits: 8
tech-stack:
  added: []
  patterns: [AST-only media classification, durable retained-data disposition, generated-only restore fixture reset, browser image-request allowlist]
key-files:
  created: [apps/api/src/content/media-reference-policy.ts, apps/api/src/ops/legacy-media-migration.ts, apps/api/drizzle/0006_phase5_media_policy.sql, scripts/prohibitions/media-policy.test.mjs]
  modified: [apps/api/src/app.ts, apps/api/src/content/markdown.ts, apps/api/src/content/article-service.ts, apps/web/next.config.ts, apps/web/app/admin/_components/ArticleEditor.tsx, scripts/local-verify.mjs]
key-decisions:
  - "Published image sources accept only the literal root-relative lowercase UUID media path; ordinary HTTP(S) anchors remain a separate capability."
  - "Legacy rows retain raw Markdown and historic cover data with an explicit review disposition rather than fetching or rewriting remote content."
  - "Restore seeding clears only generated media files before writing deterministic fixture bytes, preserving backup inventory authority after fresh-browser uploads."
patterns-established:
  - "Media policy: parse Markdown image nodes, validate through one exact predicate, and remove invalid rendered src values before sanitization."
  - "Browser proof: record every image request and require generated Web origin plus an exact /media/<uuid> pathname."
requirements-completed: [OPS-01]
coverage:
  - id: D1
    description: "Published Markdown and covers accept only exact root-relative media UUID paths; unsafe retained rows become review-required without changing raw source."
    requirement: OPS-01
    verification:
      - kind: integration
        ref: "corepack pnpm local:verify -- --phase5-media --interruption-check"
        status: pass
      - kind: unit
        ref: "apps/api/test/markdown-renderer.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Fresh and restored browser journeys permit only generated-origin /media/<uuid> image requests while preserving ordinary external-anchor href values."
    requirement: OPS-01
    verification:
      - kind: e2e
        ref: "apps/web/e2e/phase1-publishing.spec.ts"
        status: pass
      - kind: e2e
        ref: "apps/web/e2e/phase4-restore.spec.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Known-bad external or mixed media is rejected by the plain-Node prohibition check, while the clean descriptor and repository implementation pass."
    requirement: OPS-01
    verification:
      - kind: unit
        ref: "scripts/prohibitions/media-policy.test.mjs"
        status: pass
    human_judgment: false
duration: 31min
completed: 2026-08-09
status: complete
---

# Phase 05 Plan 01: Same-Origin Media Policy Summary

**Published images now have one exact `/media/<lowercase-uuid>` authority, while legacy unsafe media remains losslessly reviewable and both fresh and restored browsers prove that no external image is requested.**

## Performance

- **Duration:** 31 min
- **Started:** 2026-08-09T23:23:29+08:00
- **Completed:** 2026-08-09T23:54:00+08:00
- **Tasks:** 3
- **Files modified:** 31

## Accomplishments

- Added shared AST-based media classification, renderer stripping, authoring/lifecycle enforcement, and a generated seventh Drizzle migration with a blocking retained-row disposition check.
- Preserved raw Markdown and non-authoritative historic covers through export and isolated restore, with idempotent `clear`/`review_required` classification under the migration lock.
- Removed arbitrary cover-URL authoring, added `img-src 'self'`, and proved request-level same-origin media behavior in fresh publication and restored legacy content.

## Task Commits

1. **Task 1: Enforce one published-image authority without breaking ordinary links** — `93a0eaf` (RED), `eca05db` (GREEN)
2. **Task 2: Migrate legacy media state idempotently and block incomplete schema state** — `5876982` (RED), `68fcd0f` (GREEN)
3. **Task 3: Prove same-origin image requests in normal and restored browsers** — `419b50a` (RED), `31ce7e2` (GREEN), `890e5bd` (isolation regression), `309990a` (GREEN)

## Acceptance Evidence

- Command: corepack pnpm db:generate:check — passed; no schema drift.
- Command: corepack pnpm -r typecheck — passed for contracts, API, and Web.
- Command: node --test scripts/prohibitions/media-policy.test.mjs scripts/local-verify.test.mjs — 22 passed, zero skipped/TODO.
- Negative fixture command with GSD_PROHIB_SUBJECT set to the external-published-media fixture — failed as required.
- Command: corepack pnpm local:verify -- --phase5-media --interruption-check — passed, including interrupted/concurrent migration, fresh upload/publish image-request proof, deterministic legacy fixture, backup/restore equality, and restored browser proof.

## Decisions Made

- Exact root-relative lowercase media UUIDs are the sole published-image authority; HTTP(S) anchor destinations retain their distinct, allowed behavior.
- Legacy records are classified locally and transactionally, never fetched or source-rewritten; an external historic cover is cleared only when `coverMediaId` already provides the authoritative replacement.
- The restore fixture resets only its generated media volume after new browser media uploads, so the backup inventory has one exact byte authority.

## Deviations from Plan

### Auto-fixed Issues

**1. Generated fresh-browser media remained before restore seeding**
- **Found during:** Task 3 local verifier
- **Issue:** The newly added fresh browser journey uploaded generated media; later truncating database rows alone left those files in the source volume, and the complete backup inventory correctly rejected them.
- **Fix:** Reset only the generated verification media directories before writing the deterministic restore fixture.
- **Files modified:** `scripts/local-verify.mjs`, `scripts/local-verify.test.mjs`
- **Verification:** The focused interruption/restore verifier passed with exact backup inventory and cleanup.
- **Committed in:** `890e5bd`, `309990a`

---

**Total deviations:** 1 auto-fixed isolation issue.
**Impact on plan:** Necessary for the new fresh-browser proof to preserve the existing complete-backup byte authority; no scope expansion.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- OPS-01 is locally proven and ready for the production-backup work in 05-02.
- OPS-03 and OPS-05 remain pending; the canonical production release stays `BLOCKED`, and neither cloud server was contacted or modified.

## Self-Check: PASSED

- All plan artifacts and key links were verified against the repository.
- Type checking and the focused Phase 5 media verification passed without skipped or TODO tests.
- The worktree was clean after generated verification containers were removed.

---
*Phase: 05-v1-0-integration-gap-closure*
*Completed: 2026-08-09*
