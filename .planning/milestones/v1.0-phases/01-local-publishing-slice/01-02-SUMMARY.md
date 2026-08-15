---
phase: 01-local-publishing-slice
plan: "02"
subsystem: workspace-contracts
tags: [pnpm, typescript, zod, nextjs, fastify, playwright]
requires:
  - phase: 01-local-publishing-slice
    provides: Proven Next-to-Fastify-to-PostgreSQL publishing tracer from Plan 01-01
provides:
  - Explicit pnpm packages for the independently deployable Web and API applications
  - Contracts-only package with allowlisted Zod wire schemas and inferred DTO types
  - Deterministic Corepack-backed root install, typecheck, build, test, database, and E2E commands
affects: [01-03-auth, 01-04-editor, 01-05-lifecycle, 01-06-public-list, 01-07-public-reading, 01-08-local-acceptance]
actuals:
  tokens: 6971
  tasks: 2
  commits: 1
tech-stack:
  added: []
  patterns: [deployment-owned workspace packages, contracts-only Zod boundary, strict allowlisted response parsing]
key-files:
  created:
    - tsconfig.base.json
    - apps/api/package.json
    - apps/api/tsconfig.json
    - apps/web/package.json
    - packages/contracts/package.json
    - packages/contracts/src/tracer.ts
    - packages/contracts/src/tracer.test.ts
  modified:
    - package.json
    - pnpm-workspace.yaml
    - pnpm-lock.yaml
    - apps/api/src/app.ts
    - apps/web/app/TracerAdmin.tsx
    - apps/web/app/[[...path]]/page.tsx
key-decisions:
  - "Keep every dependency at its 01-01-approved version and move ownership to the narrowest workspace package."
  - "Use strict Zod objects for all shared tracer messages so internal database, password, and session fields are rejected rather than stripped."
  - "Retain source exports for the small contracts package and let Next transpile it, while every package still has an independent TypeScript build."
patterns-established:
  - "The browser and SSR layer validate shared responses but never import PostgreSQL or Drizzle types."
  - "The API validates shared requests and explicitly constructs public response DTOs before returning them."
requirements-completed: [OPS-04]
coverage:
  - id: D1
    description: "Web, API, and contracts are explicit workspace packages with independent typecheck and build commands."
    requirement: OPS-04
    verification:
      - kind: integration
        ref: "corepack pnpm install --frozen-lockfile && corepack pnpm typecheck && corepack pnpm build"
        status: pass
    human_judgment: false
  - id: D2
    description: "Shared login, publish, public-list, and public-detail schemas reject malformed or internal fields."
    requirement: OPS-04
    verification:
      - kind: unit
        ref: "packages/contracts/src/tracer.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "The extracted packages preserve the real administrator login, publish, SSR list, and permalink browser path."
    requirement: OPS-04
    verification:
      - kind: e2e
        ref: "apps/web/e2e/walking-skeleton.spec.ts#administrator publishes Markdown that is immediately SSR-readable"
        status: pass
    human_judgment: false
duration: 19h 42m elapsed including approval pause
completed: 2026-08-07
status: complete
---

# Phase 1 Plan 02: Workspace and Shared Contracts Summary

**The proven publishing tracer is now split into deployable Web/API packages joined only by strict, wire-safe Zod contracts.**

## Performance

- **Duration:** 19h 42m elapsed, dominated by a local-command approval pause
- **Tasks:** 2
- **Files modified:** 20

## Accomplishments

- Moved Next/React, Fastify/database/rendering, and Zod ownership into `apps/web`, `apps/api`, and `packages/contracts` without adding a dependency.
- Added three contract tests covering bounded credentials, publish validation, and rejection of internal response fields.
- Made both Web and API consume the same request/response schemas and preserved the full Chromium publishing journey.
- Passed frozen-lockfile installation, recursive strict typechecks, recursive production builds, root contract tests, and the PostgreSQL-backed E2E tracer.

## Task Commits

The two tightly coupled extraction tasks were committed as one buildable plan unit:

1. **Tasks 1–2: Establish workspace packages and extract shared wire contracts** — `e172c47`

## Files Created/Modified

- `package.json` and `pnpm-workspace.yaml` — Corepack-backed root orchestration and explicit package discovery.
- `apps/api/package.json` and `apps/api/tsconfig.json` — independent API dependency and strict build boundary.
- `apps/web/package.json` and `apps/web/tsconfig.json` — independent Next application dependency and build boundary.
- `packages/contracts/src/tracer.ts` — strict login, publish, public-list, and public-detail schemas.
- `packages/contracts/src/tracer.test.ts` — malformed input and information-disclosure regression tests.
- `apps/api/src/app.ts` — shared validation and explicit public DTO serialization.
- `apps/web/app/TracerAdmin.tsx` and `apps/web/app/[[...path]]/page.tsx` — shared request/response validation in browser and SSR consumers.

## Decisions & Deviations

### Auto-fixed issues

1. The plan required test-first contract coverage but omitted the test file from frontmatter. `packages/contracts/src/tracer.test.ts` was added as a necessary test artifact.
2. The E2E launcher assumed Next remained installed at the repository root. Its package script and executable path now follow the Web workspace location; the test behavior itself is unchanged.
3. Root scripts originally delegated to a globally installed `pnpm`, but this repository intentionally uses Corepack. Delegation now uses `corepack pnpm`, so the documented root commands work on the verified machine.
4. `@fastify/cookie` does not declare Fastify as a peer dependency, preventing its augmentation from resolving through pnpm's isolated layout. A narrow local augmentation documents only the two plugin members used by this API; the runtime plugin remains the official package.

No architectural scope was added and no server was contacted.

## Issues Encountered

- Replaying the 01-01 hand-run migration against an already populated verification database reaches a duplicate foreign-key constraint. A new local verification database proved the migration from an empty state; repeat/interruption hardening remains assigned to Plan 01-08 and is recorded in `deferred-items.md`.
- The first root test attempt was blocked by the filesystem sandbox denying tsx's temporary IPC socket. The identical root command passed outside that sandbox restriction.

## User Setup Required

None. No external service or production configuration changed.

## Next Phase Readiness

- Plan 01-03 can extend authentication through `@blog-x/contracts` without crossing database or session internals into Web.
- The main-server freeze remains in force; neither server was contacted.

---
*Phase: 01-local-publishing-slice*
*Completed: 2026-08-07*
