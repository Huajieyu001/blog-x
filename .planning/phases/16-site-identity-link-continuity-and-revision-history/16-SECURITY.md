---
phase: 16
status: verified
threats_open: 0
asvs_level: 1
created: 2026-09-22
---

# Phase 16 — Security

All checks used generated local authorities; no server, production credential, or `main` operation occurred.

| Threat | Mitigation and evidence | Status |
|---|---|---|
| T16-01-1 | Strict input excludes registration fields; the service explicitly projects stored identity and always supplies literal ICP number/MIIT URL. API and responsive browser tests passed. | closed |
| T16-01-2 | Session-first exact-Origin/content-type guards return 401/403/415 and do not persist input. | closed |
| T16-01-3 | Singleton advisory lock plus version comparison rejects stale settings writes. | closed |
| T16-02-1 | Public adapter accepts only strict root-relative `/public/articles/<slug>` locations and translates them to same-origin page paths. | closed |
| T16-02-2 | Alias rows point to article identity; lookup resolves directly to the current slug. API and browser tests prove one 308 without chains. | closed |
| T16-02-3 | Published predicate makes draft, unpublished, deleted and unknown aliases content-free 404s. | closed |
| T16-03-1 | Material snapshots are pruned transactionally to 20; a 21-edit generated PostgreSQL regression passed. | closed |
| T16-03-2 | Row lock, current-version comparison and article-scoped revision lookup reject stale, concurrent and cross-article restores. | closed |
| T16-03-3 | Restore validates references, snapshots displaced state, clears publication/schedule to draft, and writes content-free audit metadata atomically. | closed |
| T16-03-4 | Restored slugs reuse direct alias authority; republish tests prove old addresses resolve in one hop. | closed |

No accepted risks. Threats: 10 total, 10 closed, 0 open.

