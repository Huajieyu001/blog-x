---
schema_version: 1
open_count: 3
waived_count: 0
fixed_count: 2
total_count: 5
last_updated: 2026-09-05T12:12:26.591Z
---

# Broken Windows Ledger

> Cross-phase defect register. `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 11 | unrun-verify | apps/api/test/public-visibility.test.ts |  | Disposable PostgreSQL route and migration checks could not run because local Docker Corepack could not resolve the pinned pnpm archive; no cloud host was contacted. | fixed |  | 2026-09-05T03:07:03.280Z | 2026-09-05T03:45:05.165Z |
| 2 | 11 | unrun-verify | scripts/refresh-local.mjs |  | Fixed local refresh was not started because Task 3 requires a clean worktree and the orchestrator-owned Phase 11 STATE.md change remained uncommitted; production remains BLOCKED. | fixed |  | 2026-09-05T03:07:13.733Z | 2026-09-05T03:45:05.214Z |
| 3 | 12 | unrun-verify | apps/api/test/admin-analytics.test.ts |  | Generated disposable PostgreSQL lifecycle verification awaits Plan 12-03 ADMIN_ANALYTICS_TEST_DATABASE_URL | open |  | 2026-09-05T11:27:45.417Z |  |
| 4 | 12 | unrun-verify | apps/web/e2e/admin-analytics.spec.ts |  | Generated authenticated main-browser analytics acceptance awaits Plan 12-03 fixture | open |  | 2026-09-05T12:12:26.543Z |  |
| 5 | 12 | unrun-verify | scripts/test-inventory.mjs |  | Default test inventory must register admin analytics suites in Plan 12-03 | open |  | 2026-09-05T12:12:26.591Z |  |

````json
[
  {
    "id": 1,
    "kind": "unrun-verify",
    "phase": "11",
    "file": "apps/api/test/public-visibility.test.ts",
    "line": null,
    "description": "Disposable PostgreSQL route and migration checks could not run because local Docker Corepack could not resolve the pinned pnpm archive; no cloud host was contacted.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-05T03:07:03.280Z",
    "resolved_at": "2026-09-05T03:45:05.165Z"
  },
  {
    "id": 2,
    "kind": "unrun-verify",
    "phase": "11",
    "file": "scripts/refresh-local.mjs",
    "line": null,
    "description": "Fixed local refresh was not started because Task 3 requires a clean worktree and the orchestrator-owned Phase 11 STATE.md change remained uncommitted; production remains BLOCKED.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-05T03:07:13.733Z",
    "resolved_at": "2026-09-05T03:45:05.214Z"
  },
  {
    "id": 3,
    "kind": "unrun-verify",
    "phase": "12",
    "file": "apps/api/test/admin-analytics.test.ts",
    "line": null,
    "description": "Generated disposable PostgreSQL lifecycle verification awaits Plan 12-03 ADMIN_ANALYTICS_TEST_DATABASE_URL",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-05T11:27:45.417Z",
    "resolved_at": null
  },
  {
    "id": 4,
    "kind": "unrun-verify",
    "phase": "12",
    "file": "apps/web/e2e/admin-analytics.spec.ts",
    "line": null,
    "description": "Generated authenticated main-browser analytics acceptance awaits Plan 12-03 fixture",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-05T12:12:26.543Z",
    "resolved_at": null
  },
  {
    "id": 5,
    "kind": "unrun-verify",
    "phase": "12",
    "file": "scripts/test-inventory.mjs",
    "line": null,
    "description": "Default test inventory must register admin analytics suites in Plan 12-03",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-05T12:12:26.591Z",
    "resolved_at": null
  }
]
````
