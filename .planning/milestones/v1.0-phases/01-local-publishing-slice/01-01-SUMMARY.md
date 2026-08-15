---
phase: 01-local-publishing-slice
plan: "01"
subsystem: full-stack-tracer
tags: [nextjs, fastify, postgresql, drizzle, playwright, argon2, markdown]
requires: []
provides:
  - Deployment-separable Next SSR to relative /api to Fastify to PostgreSQL walking skeleton
  - Opaque single-administrator session and repeatable environment-only seed
  - Generated Drizzle migration with snapshot/journal and real database activation proof
  - Browser proof for login, Markdown publish, SSR home visibility, and permalink rendering
affects: [01-02-workspace, 01-03-auth, 01-04-editor, 01-05-lifecycle, 01-06-public-list, 01-07-public-reading, 01-08-local-acceptance]
actuals:
  tokens: 34914
  tasks: 2
  commits: 2
tech-stack:
  added: [pnpm, Next.js 16, React 19, Fastify 5, Drizzle ORM, PostgreSQL 18, Argon2, unified, Shiki, Playwright]
  patterns: [same-origin relative API proxy, API-owned persistence and Markdown rendering, opaque hashed sessions, generated migration before seed]
key-files:
  created:
    - package.json
    - pnpm-lock.yaml
    - compose.yaml
    - apps/api/src/app.ts
    - apps/api/src/db/schema.ts
    - apps/api/drizzle/0000_phase1_walking_skeleton.sql
    - apps/web/app/[[...path]]/page.tsx
    - apps/web/app/TracerAdmin.tsx
    - apps/web/e2e/walking-skeleton.spec.ts
  modified:
    - .gitignore
key-decisions:
  - "Require an exact PUBLIC_ORIGIN for proxied unsafe browser requests instead of trusting forwarded headers implicitly."
  - "Keep esbuild lifecycle scripts disabled; the pinned tsx and Drizzle CLIs were verified without them."
  - "Use port 3100 for this tracer E2E so an unrelated user-owned service on port 3000 is never terminated."
patterns-established:
  - "Browser mutations use relative /api; browser code contains no server IP or CORS dependency."
  - "The API alone owns PostgreSQL access, Markdown source, sanitization, and rendered HTML."
  - "Seeds consume runtime credentials and rotate the stored hash on repeat runs."
requirements-completed: [AUTH-01, CONT-01, READ-01, READ-02, OPS-04]
coverage:
  - id: D1
    description: "A seeded single administrator authenticates through an opaque HttpOnly session."
    requirement: AUTH-01
    verification:
      - kind: e2e
        ref: "apps/web/e2e/walking-skeleton.spec.ts#administrator publishes Markdown that is immediately SSR-readable"
        status: pass
    human_judgment: false
  - id: D2
    description: "An authenticated administrator publishes Markdown through Fastify into PostgreSQL."
    requirement: CONT-01
    verification:
      - kind: e2e
        ref: "apps/web/e2e/walking-skeleton.spec.ts#administrator publishes Markdown that is immediately SSR-readable"
        status: pass
    human_judgment: false
  - id: D3
    description: "The SSR home and permalink read and render the same persisted published article."
    requirement: READ-01
    verification:
      - kind: e2e
        ref: "apps/web/e2e/walking-skeleton.spec.ts#administrator publishes Markdown that is immediately SSR-readable"
        status: pass
    human_judgment: false
  - id: D4
    description: "The permalink renders sanitized Markdown content and a real heading."
    requirement: READ-02
    verification:
      - kind: e2e
        ref: "apps/web/e2e/walking-skeleton.spec.ts#heading Hello"
        status: pass
    human_judgment: false
  - id: D5
    description: "The local tracer has no dependency on either server IP and no server was contacted."
    requirement: OPS-04
    verification:
      - kind: other
        ref: "secret/server-IP source scan plus local-only execution audit"
        status: pass
    human_judgment: false
duration: 2d elapsed
completed: 2026-08-06
status: complete
---

# Phase 1 Plan 01: Local Publishing Tracer Summary

**A real Next.js → Fastify → PostgreSQL publishing path now proves administrator login, Markdown publication, SSR home visibility, and safe permalink reading.**

## Performance

- **Duration:** 2 days elapsed, including approval pauses and local runtime setup
- **Tasks:** 2
- **Files modified:** 20 including generated Drizzle and Next metadata

## Accomplishments

- Approved and locked the complete direct dependency graph before installation; pnpm verified 358 lock entries against its supply-chain policy.
- Generated and activated the administrator, session, and article schema before seed or browser verification.
- Passed a real Chromium journey using a runtime-random administrator password against a clean PostgreSQL database.
- Passed strict API TypeScript checking, Next production build, Drizzle no-change generation check, and `git diff --check`.

## Task Commits

1. **Task 1: Verify the complete npm dependency set before installation** — blocking-human approval; no source commit before approval
2. **Task 2: Build the local publishing tracer** — `97c4ac5`
3. **Task 2 verification corrections** — `552462a`

## Files Created/Modified

- `apps/api/src/app.ts` — Fastify routes, opaque sessions, migration/seed commands, public reads, and sanitized Markdown rendering.
- `apps/api/src/db/schema.ts` — administrator, session, and retained-slug article schema.
- `apps/api/drizzle/0000_phase1_walking_skeleton.sql` — schema-generated first migration.
- `apps/api/drizzle/meta/` — Drizzle journal and snapshot for deterministic future migrations.
- `apps/web/app/[[...path]]/page.tsx` — SSR home, admin route, and permalink dispatch.
- `apps/web/app/TracerAdmin.tsx` — hydrated login and publish forms using relative `/api`.
- `apps/web/e2e/walking-skeleton.spec.ts` — self-starting API/Web browser tracer on isolated port 3100.
- `compose.yaml` — loopback-only PostgreSQL container definition retained for reproducible local startup.

## Decisions & Deviations

### Auto-fixed issues

1. The initial migration had been hand-authored without Drizzle metadata. It was replaced by a true generated migration plus snapshot/journal, and generation now reports no schema changes.
2. Docker Hub resolution inside Colima failed because the VM resolver fell back to `[::1]`. Verification used Homebrew PostgreSQL 18.4 locally without enabling a background service; the Compose definition remains unchanged.
3. Port 3000 belonged to an unrelated existing Nuxt project. The tracer moved to port 3100 rather than terminating user-owned work.
4. Next 16 blocked dev chunks from the `127.0.0.1` origin. `allowedDevOrigins` was narrowly configured for local development.
5. The first client form implementation failed without hydration and degraded to a URL-submitting form. Forms now use explicit POST plus hydrated `onSubmit`; any exposed test-only random credential was immediately rotated by a new seed and never committed.
6. Repeat seed originally preserved an obsolete password hash. It now updates the hash for the fixed administrator username, keeping test reruns deterministic.

## Issues Encountered

- Colima, Docker CLI, Docker Compose, PostgreSQL 18.4, and Playwright Chromium were installed locally to complete verification. Colima is stopped; PostgreSQL is manually running only on `127.0.0.1:5432` and is not registered for login startup.
- The main and secondary servers were not contacted. The main-server freeze remains in force.

## User Setup Required

None for external services. Plan 01-08 will document the final one-command local startup path and environment template.

## Next Phase Readiness

- Plan 01-02 can extract the proven tracer into the final pnpm workspace and shared-contract packages.
- The real local database and Chromium runner are available for subsequent auth, editor, lifecycle, and reading slices.

---
*Phase: 01-local-publishing-slice*
*Completed: 2026-08-06*
