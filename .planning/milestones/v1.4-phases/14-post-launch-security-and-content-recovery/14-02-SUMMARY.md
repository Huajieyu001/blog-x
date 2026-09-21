---
phase: 14-post-launch-security-and-content-recovery
plan: "02"
subsystem: auth
tags: [fastify, postgres, argon2id, audit, security]
requires:
  - phase: 14-post-launch-security-and-content-recovery
    provides: hardened same-origin web ingress
provides:
  - atomic administrator password rotation with all-session revocation
  - self-targeted password-change audit vocabulary and database constraints
  - responsive administrator account-security workflow
affects: [14-03, local-delivery, authentication]
actuals:
  tokens: 26785
  tasks: 3
  commits: 16
tech-stack:
  added: []
  patterns: [transactional credential rotation with allowlisted audit metadata]
key-files:
  created: [apps/web/app/admin/security/page.tsx, apps/api/drizzle/0010_glamorous_justice.sql]
  modified: [apps/api/src/routes/auth.ts, apps/api/src/audit/audit-repository.ts, apps/api/src/app.ts, apps/web/e2e/auth-session.spec.ts]
key-decisions:
  - "Password replacement, active-session revocation, and field-name-only audit insertion share one PostgreSQL transaction."
  - "The generated 0010 migration name is retained while its schema authority is password-change audit constraints."
patterns-established:
  - "Sensitive mutations reuse session-first same-origin mutation guards, bounded body limits, and logger redaction."
requirements-completed: [SEC-04]
coverage:
  - id: D1
    description: "Administrator password rotation revokes every old session and appends only a self-targeted password-change audit event."
    requirement: SEC-04
    verification:
      - kind: unit
        ref: corepack pnpm test
        status: pass
      - kind: other
        ref: corepack pnpm typecheck
        status: pass
      - kind: other
        ref: node scripts/check-boundaries.mjs
        status: pass
    human_judgment: false
duration: 1d
completed: 2026-09-21
status: complete
---

# Phase 14 Plan 02: Password Rotation Summary

**The administrator can rotate an Argon2id password through the responsive backend, atomically revoke all existing sessions, and retain only a minimal password-change audit record.**

## Accomplishments

- Added strict, same-origin `POST /auth/password` handling with current-password verification, 8 KiB body limit, existing mutation limiter, logger redaction, and cleared session cookie on success.
- Bound `auth.password.changed` to an administrator self-target and `changedFields: ["password"]` through contracts, repository validation, schema, migration, and verifier authority.
- Added account-security navigation/form, audit labels, mobile/browser coverage, rollback and secret non-disclosure assertions.

## Task Commits

1. **Task 1: password transaction and audit migration** — `aa339d6`, `dba6d91`, `6b5fc17`, `ee7ef63`, `9428e9a`, `23b8451`, `12ad971`, `d3359e2`, `ec02ef7`, `3374826`.
2. **Task 2: route hardening and security workspace** — `b66111d`.
3. **Task 3: navigation and browser coverage** — `caeefe9`, `0e36d0c`, `8a5efac`, `bdc746e`.
4. **Historic fixed-local delivery evidence** — `d898da1` for revision `ec02ef7592a995eac4bd1b5a713f530f9b276366`.

## Verification

- `corepack pnpm test` — 77/77 passed.
- `corepack pnpm typecheck` — passed.
- `node scripts/check-boundaries.mjs` — passed, 684 files checked.
- `corepack pnpm --filter @blog-x/web typecheck` and production build — passed.

## Issues Encountered

The one permitted current `corepack pnpm local:verify -- --phase4-security` attempt did not reach tests because Docker's build-time Corepack could not resolve `registry.npmjs.org` for its cached pnpm archive (`EAI_AGAIN`). It was not retried; this is an external network/cache failure, while prior fixed-local delivery evidence remains recorded above.

## Deviations from Plan

The generated migration is named `0010_glamorous_justice.sql`, rather than the descriptive filename in the plan, but its contents and metadata implement the planned password-change audit constraints. No product gap was found in the safe-resume audit.

## Self-Check: PASSED

- Existing implementation commits and this recovery summary are present.
- No product code, state, roadmap, preview state, server, main branch, or remote was changed.
