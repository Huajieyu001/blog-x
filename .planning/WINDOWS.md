---
schema_version: 1
open_count: 0
waived_count: 0
fixed_count: 2
total_count: 2
last_updated: 2026-09-05T03:45:05.214Z
---

# Broken Windows Ledger

> Cross-phase defect register. `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 11 | unrun-verify | apps/api/test/public-visibility.test.ts |  | Disposable PostgreSQL route and migration checks could not run because local Docker Corepack could not resolve the pinned pnpm archive; no cloud host was contacted. | fixed |  | 2026-09-05T03:07:03.280Z | 2026-09-05T03:45:05.165Z |
| 2 | 11 | unrun-verify | scripts/refresh-local.mjs |  | Fixed local refresh was not started because Task 3 requires a clean worktree and the orchestrator-owned Phase 11 STATE.md change remained uncommitted; production remains BLOCKED. | fixed |  | 2026-09-05T03:07:13.733Z | 2026-09-05T03:45:05.214Z |

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
  }
]
````
