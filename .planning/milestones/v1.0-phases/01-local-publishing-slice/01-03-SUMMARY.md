---
phase: 01-local-publishing-slice
plan: "03"
subsystem: authentication
tags: [fastify, argon2id, opaque-session, httponly-cookie, nextjs, playwright]
requires:
  - phase: 01-local-publishing-slice
    provides: Deployment-separated Web/API packages and strict shared contracts from Plan 01-02
provides:
  - Single-administrator environment seed that refuses a second identity
  - Opaque digest-at-rest session issue, rotation, expiry, status, revocation, and logout authority
  - Dedicated login page and server-checked protected admin route with visible logout
  - PostgreSQL API tests and real-browser session lifecycle proof
affects: [01-04-editor, 01-05-lifecycle, 01-08-local-acceptance, 04-01-security]
actuals:
  tokens: 10840
  tasks: 2
  commits: 4
tech-stack:
  added: []
  patterns: [Fastify-authoritative opaque sessions, cookie-only SSR forwarding, protected Next presentation boundary]
key-files:
  created:
    - packages/contracts/src/auth.ts
    - apps/api/src/auth/sessions.ts
    - apps/api/src/db/seed-admin.ts
    - apps/api/src/routes/auth.ts
    - apps/api/test/auth-session.test.ts
    - apps/web/app/login/page.tsx
    - apps/web/app/admin/layout.tsx
    - apps/web/e2e/auth-session.spec.ts
  modified:
    - apps/api/src/app.ts
    - apps/web/app/TracerAdmin.tsx
    - package.json
key-decisions:
  - "Create and decorate the session authority in the parent Fastify scope, then pass it into auth routes so every protected API route shares the same authority despite plugin encapsulation."
  - "Forward only the inbound Cookie header from the Next admin layout to Fastify; the redirect remains presentation while Fastify owns authorization."
  - "Rotate every active administrator session on login and persist only a SHA-256 token digest."
patterns-established:
  - "Unsafe auth and content requests require an exact trusted Origin and return no-store responses."
  - "Browser code uses relative /api and never stores credentials or session tokens in Web Storage."
requirements-completed: [AUTH-01]
coverage:
  - id: D1
    description: "Exactly one environment-seeded administrator receives opaque, rotated, expiring, revocable sessions without credential or token logging."
    requirement: AUTH-01
    verification:
      - kind: integration
        ref: "apps/api/test/auth-session.test.ts#single administrator sessions are opaque, rotated, revocable, and do not leak to logs"
        status: pass
    human_judgment: false
  - id: D2
    description: "The browser proves generic login failure, valid login, refresh, expiry redirect, logout, direct API denial, and revoked-cookie replay denial."
    requirement: AUTH-01
    verification:
      - kind: e2e
        ref: "apps/web/e2e/auth-session.spec.ts#login, refresh, expiry, logout, and revoked-token reuse stay server-authorized"
        status: pass
    human_judgment: false
  - id: D3
    description: "The original login-to-publish-to-public-reading tracer remains green behind the new protected admin boundary."
    requirement: AUTH-01
    verification:
      - kind: e2e
        ref: "apps/web/e2e/walking-skeleton.spec.ts#administrator publishes Markdown that is immediately SSR-readable"
        status: pass
    human_judgment: false
duration: 34min
completed: 2026-08-07
status: complete
---

# Phase 1 Plan 03: Single-Administrator Authentication Summary

**Fastify now owns a complete opaque-session lifecycle, while Next presents a cookie-only login and protected admin experience without becoming an authorization authority.**

## Performance

- **Duration:** 34 minutes
- **Tasks:** 2
- **Files modified:** 19

## Accomplishments

- Extracted Argon2id administrator seeding and made a second identity a hard error.
- Implemented CSPRNG sessions stored only as SHA-256 digests, with login rotation, expiry checks, explicit revocation, cookie clearing, and generic unauthorized responses.
- Added explicit Fastify log redaction for Cookie, Set-Cookie, authorization, password, token, and credential fields.
- Added a relative-API login page, server-checked admin layout, visible logout, and browser proof that Web Storage remains empty.
- Preserved the original Markdown publishing and public SSR tracer after the auth boundary changed.

## Task Commits

1. **Task 1 RED: API session lifecycle test** — `f07b14e`
2. **Task 1 GREEN: Opaque session authority** — `057f35e`
3. **Task 2 RED: Browser session lifecycle test** — `5ef7593`
4. **Task 2 GREEN: Protected login/admin/logout experience** — `708c864`

## Files Created/Modified

- `apps/api/src/auth/sessions.ts` — token issue, digest lookup, global login rotation, expiry, and revocation.
- `apps/api/src/db/seed-admin.ts` — validated, idempotent single-owner Argon2id seed.
- `apps/api/src/routes/auth.ts` — login, session-status, and logout routes.
- `apps/api/test/auth-session.test.ts` — disposable PostgreSQL integration coverage and log leakage assertions.
- `apps/web/app/lib/api.ts` — server-only session lookup forwarding only Cookie.
- `apps/web/app/login/page.tsx` — generic-error, pending-state relative login form.
- `apps/web/app/admin/layout.tsx` — server-checked presentation redirect.
- `apps/web/app/admin/LogoutButton.tsx` — relative logout and client navigation cleanup.
- `apps/web/e2e/auth-session.spec.ts` — real Chromium lifecycle and replay proof.

## Decisions & Deviations

### Auto-fixed issues

1. The plan listed an admin layout but no concrete admin page or logout client component. Both were added because the layout cannot protect the root catch-all route without an actual `/admin` route, and logout must receive the browser's HttpOnly cookie.
2. `TracerAdmin` gained an authenticated entry mode so the proven publish form remains available after the dedicated login page succeeds.
3. A test-only API session fixture was added to expire a digest directly in the disposable database without creating a production test endpoint.
4. Fastify plugin encapsulation initially hid the decorated session service from the existing publish route. The authority is now decorated in the parent scope and injected into the auth plugin.
5. HTTPS cookie behavior is derived from an HTTPS public origin as well as production mode, making `Secure` behavior explicit and testable.
6. The contracts regression test was updated to import login schemas from the new focused auth module after extraction.

No new library, identity feature, role, registration, OAuth, or recovery surface was introduced.

## Verification

- Frozen-lockfile installation passed.
- Recursive contract/API/Web typechecks passed.
- API and Next production builds passed.
- Contract tests passed 3/3.
- Disposable PostgreSQL auth suite passed 1/1.
- Auth Chromium lifecycle passed 1/1.
- Original publishing Chromium tracer passed 1/1.
- Secret/server-boundary scan found no credential or server access change.

## User Setup Required

None. Authentication test credentials are generated at runtime and never committed.

## Next Phase Readiness

- Plan 01-04 can build drafts, metadata, editor, and preview behind the established Fastify session authority.
- The main-server freeze remains active; neither server was contacted.

---
*Phase: 01-local-publishing-slice*
*Completed: 2026-08-07*
