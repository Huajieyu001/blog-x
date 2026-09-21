---
phase: 14-post-launch-security-and-content-recovery
plan: "01"
subsystem: security
tags: [nextjs, csp, security-headers, playwright]
requires:
  - phase: 13-administrator-insights
    provides: fixed local ingress and public-shell browser coverage
provides:
  - uniform edge security headers for pages, API rewrites, and media rewrites
  - production CSP with development-only HMR exceptions
affects: [14-02, 14-03, local-delivery]
actuals:
  tokens: 11703
  tasks: 2
  commits: 11
tech-stack:
  added: []
  patterns: [Next headers() as the shared response-policy authority]
key-files:
  created: []
  modified: [apps/web/next.config.ts, apps/web/server.mjs, apps/web/app/layout.test.mjs, apps/web/e2e/public-shell.spec.ts]
key-decisions:
  - "Keep CSP self-only in production while isolating unsafe-eval and loopback WebSocket allowances to development."
  - "Apply the same policy at the mounted custom-server edge so rewritten API and media responses cannot bypass it."
patterns-established:
  - "Security response policies require source-level and canonical-ingress regression coverage."
requirements-completed: [SEC-05]
coverage:
  - id: D1
    description: "Uniform CSP, HSTS, MIME, referrer, frame, permissions, and framework-header protections at the web edge."
    requirement: SEC-05
    verification:
      - kind: unit
        ref: apps/web/app/layout.test.mjs
        status: pass
      - kind: other
        ref: PUBLIC_ORIGIN=http://127.0.0.1:3100 corepack pnpm --filter @blog-x/web build
        status: pass
      - kind: other
        ref: corepack pnpm --filter @blog-x/web typecheck
        status: pass
    human_judgment: false
duration: 1d
completed: 2026-09-21
status: complete
---

# Phase 14 Plan 01: Security Response Headers Summary

**Next’s custom ingress now enforces a compatible self-only production CSP and uniform browser hardening headers without breaking same-origin pages, API, media, or theme hydration.**

## Accomplishments

- Added HSTS, CSP, nosniff, strict referrer, frame denial, and Permissions Policy while removing `X-Powered-By`.
- Kept inline theme/React compatibility and development-only HMR CSP allowances explicitly scoped.
- Extended source and browser-shell coverage; prior fixed-local evidence is recorded in `d898da1` for revision `ec02ef7592a995eac4bd1b5a713f530f9b276366`.

## Task Commits

1. **Task 1: security headers and ingress compatibility** — `86083f0`, `2165d6d`, `d3e351a`, `1c8c258`, `cafd1ad`, `b076785`, `80b6d28`, `176eb12`, `e0c433c`, `584fc33`.
2. **Task 2: fixed-local delivery evidence** — `d898da1` (phase delivery receipt).

## Verification

- `node --test apps/web/app/layout.test.mjs` — 2 passed.
- `corepack pnpm --filter @blog-x/web typecheck` — passed.
- `PUBLIC_ORIGIN=http://127.0.0.1:3100 corepack pnpm --filter @blog-x/web build` — passed.

## Deviations from Plan

The historical implementation required custom-server and canonical-browser fixes so headers also covered mounted ingress/rewrite responses. These are committed as the Task 1 follow-up fixes above; no new deviation was found during this safe-resume audit.

## Self-Check: PASSED

- Existing implementation and all listed commits are present.
- This summary records the completed plan without changing product code, state, roadmap, or local-preview state.
