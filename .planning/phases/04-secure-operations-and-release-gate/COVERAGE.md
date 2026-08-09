No external API integration: Phase 4 hardens internal Blog X services and local operator tooling only.

# Phase 4 Spec-less Coverage

No SPEC was supplied. The edge probe returned exactly seven rows: `OPS-01` classified as `concurrency`; the other six requirements classified as `unclassified`. The plans resolve every inferable behavior and keep genuinely production-only facts as explicit release-blocking assumptions.

## Requirement-by-requirement edge resolution

| # | Requirement | Probe classification | Resolution status | Explicit behavior boundary | Owning task/check |
|---:|---|---|---|---|---|
| 1 | SEC-01 | unclassified | RESOLVED | Login attempts 1-5 are generic 401, attempt 6 is generic 429 with integer Retry-After; injected 60-second boundary recovers. Every unsafe route, including retained legacy publish/logout, is enumerated and follows session → exact Origin → strict limiter → body/service ordering. | 04-01 Tasks 1-2; `apps/api/test/security-hardening.test.ts`, `auth-session.test.ts` |
| 2 | SEC-02 | unclassified | RESOLVED | Unknown/oversize/wrong-content request shapes fail with exact 400/413/415 behavior; hostile Markdown/SQL-shaped/upload inputs cannot create extra rows/files or executable output; write/DB failure cleanup is exact. | 04-01 Task 3; `security-hardening.test.ts`, `media.test.ts`, `markdown-renderer.test.ts` |
| 3 | SEC-03 | unclassified | RESOLVED | Command-aware configuration parses before Pool/storage/listener/migration/seed resources; invalid production origin, authority, or bounds exit 1 without value disclosure; only a tracked name-only contract exists. Package manifests/lockfile remain unchanged. | 04-01 Tasks 1/3; config failure spies and boundary fixtures under `--phase4-security` |
| 4 | OPS-01 | concurrency | RESOLVED | Simultaneous/parallel verifier and API instances retain distinct namespaces and no shared limiter claim; browser requests remain one generated Web origin; accepted topology has no API/PostgreSQL host ports. Parallelism cannot move public traffic to an internal/node origin. | 04-01 Tasks 1/3 and 04-03 Task 3; two-store, topology, browser-origin, and parallel-run checks |
| 5 | OPS-02 | unclassified | RESOLVED | Killing the generated API recovers within 30 seconds without volume replacement; status maps required checks to PASS/FAIL and production-only TLS to NOT_EVALUATED; logs cap at 10 MiB × 3. | 04-02 Task 1; `ops-status.test.mjs` and `--phase4-operations` |
| 6 | OPS-03 | unclassified | RESOLVED | Backup staging is exclusive and COMPLETE is written last; missing/extra/tampered members fail before finalization. Restore preflight validates the whole set and exact empty generated target before any mutation; interruption/parallel cleanup is exact. | 04-02 Tasks 2-3; backup/restore tests, DB/media equality, restored Playwright journey |
| 7 | OPS-05 | unclassified | RESOLVED | Canonical real evidence is BLOCKED/1 and expect-blocked/0. READY requires actual-byte-hashed local bundle artifacts for every prerequisite; missing/expired/unsafe evidence blocks or invalidates. No local/synthetic/Git result authorizes contact/deploy. | 04-03 Tasks 1-3; `release-gate.test.mjs`, boundary fixtures, `--phase4-full` |

## Explicit flagged assumptions — unresolved production facts

These are not silently inferred and cannot turn green in local acceptance. Plan 04-03 keeps release `BLOCKED` until a future explicit user unfreeze and fresh evidence supplies them.

| Assumption ID | Requirements | Unresolved fact | Treatment |
|---|---|---|---|
| A-04-01 | OPS-01, OPS-02, OPS-05 | Actual host resource limits, firewall rules, and encrypted/private-link implementation are unknown. | REQUIRED FUTURE EVIDENCE; no local topology fixture is production proof. |
| A-04-02 | OPS-02, OPS-05 | Current certificate expiry/renewal state and alert recipient/delivery are unknown. | `NOT_EVALUATED`; release BLOCKED until authorized live evidence. |
| A-04-03 | OPS-03, OPS-05 | Off-host backup destination, retention, encryption-key authority, and enabled daily schedule are undecided/unverified. | Name-only decision slots; release BLOCKED. A same-host local set is not disaster recovery. |
| A-04-04 | OPS-03, OPS-05 | Selected/measured RPO/RTO, release owner, and production change window are undecided. | No guarantee is stated; strict release evidence requires future values/outcomes. |

## Prohibition recall → precision

Stage 1 asked each requirement: “What could this silently become that the author would not want?” Stage 2 dropped routine correctness and canonical OWASP items, retaining only bespoke Blog X safety/value constraints.

### Kept bespoke prohibitions

| ID | Requirement(s) | Kept statement | Status | Verification | Plan/check |
|---|---|---|---|---|---|
| P-04-01 | SEC-01, OPS-01 | Limiting must not trust forwarded address authority or claim distributed protection from a per-process store. | resolved | test | 04-01; plain Node `scripts/prohibitions/limiter-policy.test.mjs`; no-subject built-in clean policy passes non-vacuously, distributed-claim subject fails, clean-fixture subject passes |
| P-04-02 | OPS-01 | Browser/runtime must not address internal API/PostgreSQL, and accepted topology must not publish their host ports or public diagnostic/import/GET-export surfaces. | resolved | test | 04-01; `local-verify.test.mjs`; public-data-plane violation + clean topology control |
| P-04-03 | OPS-03 | Restore must not mutate active, developer, production-like, broad, symlink-escaped, or non-generated targets. | resolved | test | 04-02; `restore.test.mjs`; broad-target violation + generated-target control |
| P-04-04 | OPS-03 | Incomplete/tampered backup must not receive COMPLETE, replace a known-good set, or become restorable. | resolved | test | 04-02; `backup.test.mjs`; incomplete violation + complete control |
| P-04-05 | OPS-05 | Phase 4 must not automatically unfreeze/contact/probe/upload/deploy/modify either cloud host. | resolved | test | 04-03; `release-gate.test.mjs`; automatic-deploy violation + canonical BLOCKED control |
| P-04-06 | OPS-05 | Synthetic READY must not be persisted or treated as real production authorization. | resolved | test | 04-03; `release-gate.test.mjs`; tracked-READY violation + canonical BLOCKED control |
| P-04-07 | OPS-01, OPS-02, OPS-03, OPS-05 | Local/synthetic evidence must not be represented as live firewall/link/resource/TLS/off-host/retention/alert proof or selected/measured RPO/RTO. | resolved | judgment | 04-03 Task 2 explicit reviewer criterion; historical infrastructure docs are labeled non-live and excluded from the claim. |

Coverage: applicable 7; resolved 7; unresolved prohibitions 0; by verification: test 6, judgment 1.

### Dropped or canon-referred recall candidates

| Candidate group | Precision disposition | Rationale / owner |
|---|---|---|
| Generic authentication bypass, CSRF, injection, path traversal, secret logging, malicious upload | DROP from bespoke prohibitions; canon referral | OWASP/ASVS L1 and the per-plan STRIDE threat models plus route/hostile-input/boundary tests own these; duplicating them would hide product-specific safety signal. |
| Skip/TODO/zero-test rejection, exact exit codes, missing tool failure, deterministic ordering | DROP as routine engineering | Direct task acceptance and canonical runner semantic checks own these. |
| File-handle cleanup, parser throws, response primitive shape, input non-mutation | DROP as routine engineering | Ordinary behavior/unit tests; not a product/value prohibition. |
| Historical infrastructure notes contain old node authority | NARROW, not mint | Existing historical docs are grandfathered non-live context, cannot satisfy release evidence, and are outside new Phase 4 artifact/runtime address claims. Newly created operational/release artifacts remain checked. |

## Multi-source coverage audit

| Source | Item | Plans | Status |
|---|---|---|---|
| GOAL | Verifiable low-resource security, recovery, operations, and zero production touch while frozen | 04-01, 04-02, 04-03 | COVERED |
| REQ | SEC-01, SEC-02, SEC-03 | 04-01 | COVERED |
| REQ | OPS-01 | 04-01 local/topology proof; 04-02 operations evidence; 04-03 release integration | COVERED |
| REQ | OPS-02, OPS-03 | 04-02; final integration in 04-03 | COVERED |
| REQ | OPS-05 | 04-03 | COVERED |
| RESEARCH | Shared guards incl. retained legacy publish, bounded limiter, parse-before-resource, no tracked production env file | 04-01 | COVERED |
| RESEARCH | Low-resource lifecycle/log/status, complete atomic backup, isolated restore, interruption/parallel safety | 04-02 | COVERED |
| RESEARCH | Actual-byte evidence bundle, frozen release gate, rollback, final local regression | 04-03 | COVERED |
| CONTEXT | No Phase 4 CONTEXT.md/locked D-IDs | — | NOT APPLICABLE; project/research guardrails are authoritative |
