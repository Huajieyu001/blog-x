---
phase: 11-privacy-safe-view-authority
fixed_at: 2026-09-05T08:08:00Z
status: all_fixed
fix_scope: critical_warning
findings_in_scope: 3
fixed: 3
skipped: 0
iteration: 2
final_review_status: clean
---

# Phase 11 Code Review Fix Report

The Phase 11 deep review findings were resolved in two implementation
iterations and independently re-reviewed against the complete final diff.

## Findings resolved

### CR-01 — trusted client identity behind the Web proxy

- Iteration 1 established an exact Web-to-API trusted proxy boundary.
- Iteration 2 added an authenticated ingress-to-Web canonical client address
  handshake, global forwarding-header scrubbing, production fail-closed
  configuration, exact proxy CIDR validation, logger redaction, and sealed
  forwarding tests.
- The API remains unpublished. Client addresses and ingress credentials are
  transient only and are never persisted or written to analytics results.

Commits: `aecb342`, `3ea600e`, `f0f7227`, `65b5549`.

### WR-01 — retained-route and Strict Mode beacon lifetime

- The beacon guard is slug-aware across retained dynamic-route navigation.
- Fire-and-forget requests are no longer aborted during React effect cleanup.
- The browser journey requires one successful 204 beacon for each navigated
  slug and fails on an aborted beacon request.

Commits: `8688d86`, `1c563f2`.

### WR-02 — current Web runtime authority in the Phase 11 gate

- The browser journey is owned by the sealed Phase 11 selection.
- Phase 11 builds the current workspace before container startup, snapshots
  the current `.next` runtime and `server.mjs`, mounts both read-only in
  production mode, and records a strict SHA-256 runtime authority.
- Result and runner tests reject missing, malformed, extra, or stale runtime
  authority. The API no longer uses a fixed container address that conflicts
  with concurrent one-shot migration containers.

Commits: `e3f7e3f`, `ec0764d`, `f0f7227`, `65b5549`.

## Verification

- Final focused Web runtime and Phase 11 verifier suites: 44 passed.
- Final default suite: 60 passed.
- Workspace typechecks: passed.
- Compose configuration parsing: passed.
- Repository boundary scan: 519 files, 0 findings.
- Earlier Phase 11 canonical integration: 60/60 passed.
- Earlier local delivery acceptance: 77/77 passed with fixed local port 3100
  health and root probes.
- Final deep re-review: 36 files, 0 critical, 0 warning, status `clean`.

The full disposable-Docker Phase 11 gate was not repeated after the final
three-line Compose stability change because the prior run exposed the exact
fixed-address collision and was boundedly stopped. Its current-source runtime
authority and topology contracts are covered by focused tests and final deep
review. Production release remains `BLOCKED`.

## Residual deployment condition

Any future production ingress must provide the externally configured secret
and overwrite the canonical client-address header from its socket-observed
address. This is a deployment gate, not a server change performed in Phase 11.

