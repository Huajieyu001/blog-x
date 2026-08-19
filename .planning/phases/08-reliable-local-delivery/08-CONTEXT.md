# Phase 8: Reliable Local Delivery - Context

**Gathered:** 2026-08-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 8 turns the existing local refresh primitives into one fixed, fail-closed delivery workflow for the canonical `blogxlocal` environment at `http://127.0.0.1:3100`. It must rebuild Web/API offline from the current clean commit, preserve PostgreSQL and media data, run migrations, prove the resulting runtime and visitor routes, and emit revision-bound evidence while production remains `BLOCKED`.

This phase does not deploy to either cloud server, change production release authority, add a general deployment framework, or introduce new blog features.

</domain>

<decisions>
## Implementation Decisions

The user previously selected “全部按推荐” for GSD decision points and repeatedly requested uninterrupted autonomous progress. All four phase-specific gray areas were therefore discussed using the recommended choices grounded in the existing refresh and verification boundaries. The alternatives remain recorded in `08-DISCUSSION-LOG.md` for review before planning.

### Fixed Command and Port Authority

- **D-01:** Provide one repository command with no operational flags or authority-changing environment overrides. It always targets canonical `compose.yaml`, project `blogxlocal`, origin `http://127.0.0.1:3100`, and the exact PostgreSQL/media volumes.
- **D-02:** The GSD/operator runs the command explicitly after each major completed development step. Do not install a background watcher, post-commit hook, or implicit refresh that could mutate the local runtime unexpectedly.
- **D-03:** Require a clean committed worktree and bind the full current Git SHA to target image labels, verification facts, and the final receipt. Dirty or detached/unprovable source state fails before any runtime mutation.
- **D-04:** If port `3100` is owned by anything other than the exact canonical `blogxlocal` Web container, fail preflight with diagnostics. Never kill an unknown process, silently switch ports, or treat an ad-hoc Next dev process as canonical delivery.
- **D-05:** The command prints concise stage progress and ends with the current revision, fixed URL, route summary, and evidence path; failures identify the exact stage and safe recovery action without dumping secrets.

### Offline Build and Seed Images

- **D-06:** Target Web/API builds are strictly offline: `network=none`, `pull=false`, frozen lockfile, and no implicit registry/DNS fallback. Registry unavailability must not affect a properly prepared refresh.
- **D-07:** Seed images are accepted only through immutable image IDs plus the exact `pnpm-lock.yaml` digest and a populated neutral versioned pnpm store. Run offline probe builds before any migration or cutover.
- **D-08:** Missing, stale, or incompatible seed images stop the refresh before mutation and return a separate pre-warm/remediation instruction. The fixed refresh command must never secretly pull images or copy arbitrary host `node_modules`.
- **D-09:** The delivered Web image must embed exactly `PUBLIC_ORIGIN=http://127.0.0.1:3100`; generated verification ports may never leak into the canonical image.

### Data Preservation and Failure Recovery

- **D-10:** Reuse and verify only `blogxlocal_postgres-data` and `blogxlocal_media-data`. The workflow may not create substitute data volumes, reset data, remove volumes, or reinterpret a similarly named Compose project as authority. — **Reversibility:** one-way — accidental volume replacement or deletion could permanently lose the user's blog data.
- **D-11:** Finish both offline builds and immutable-image inspection first. Then run idempotent migration and schema verification through a one-off target API image before cutting over the serving API and Web containers.
- **D-12:** Database migrations are forward-only during refresh; never run destructive down migrations. Migration postconditions must preserve existing rows, media inventory, sequences, and previously applied ledger history.
- **D-13:** If failure occurs after cutover begins, restore API/Web to the exact immutable preflight image IDs and verify the original health and route baseline. A pre-cutover failure leaves the serving runtime untouched.
- **D-14:** Enforce one durable refresh attempt per clean revision. Concurrent attempts, repeated claims, existing final evidence, or unverifiable failure-report publication fail closed and never overwrite prior authority.

### Layered Acceptance and Revision Receipt

- **D-15:** Keep exhaustive v1.1 feature acceptance isolated in generated namespaces/ports with disposable data. The canonical `3100` verification is read-only and must not seed, edit, or delete the user's fixed PostgreSQL/media state.
- **D-16:** The isolated layer proves Phase 6 data semantics and the complete Phase 7 responsive browser matrix. The fixed-runtime layer proves current-revision image labels, exact Compose/container/volume authority, three healthy services, same-origin API behavior, and representative public routes.
- **D-17:** A successful refresh requires exact non-zero test counts with zero failures, skips, TODOs, or missing suites. HTTP 200 alone, container health alone, or an old receipt is insufficient.
- **D-18:** Write one sanitized, atomic, non-overwriting v1.1 receipt containing the implementation revision, evidence digests, actual result counts, fixed-runtime facts, and terminal `releaseState: BLOCKED`. Local success never grants production authority.
- **D-19:** At completion, the fixed `3100` environment must be the canonical Compose runtime for the committed revision, not the temporary generated browser server or an ad-hoc developer process.

### Codex Discretion

- Exact package-script name, internal module split, receipt schema field names, bounded timeout values, and console formatting may be selected during research/planning if they preserve the fixed authorities and evidence contracts above.
- The planner may reuse or evolve Phase 6 refresh artifacts rather than rewrite them, but stale `phase6` naming in externally consumed v1.1 evidence must be made unambiguous.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product and Safety Contract

- `.planning/ROADMAP.md` — Phase 8 goal and five success criteria.
- `.planning/REQUIREMENTS.md` — DEVX-01, DEVX-02 and DEVX-03 plus fixed-origin, offline, data-preservation and production-freeze constraints.
- `.planning/PROJECT.md` — local-first topology, fixed `3100` expectation, low-resource limits and frozen server boundary.
- `docs/INFRASTRUCTURE.md` — deployment topology and operational ownership constraints.

### Existing Refresh Authority

- `compose.yaml` — canonical `blogxlocal` service, health, port, volume and offline-build topology.
- `scripts/refresh-local.mjs` — sealed refresh entry, clean-revision gate, offline target plan and fixed authority.
- `scripts/refresh-local-runtime-core.mjs` — command allowlist, attempt/failure/evidence authority, migration/cutover/rollback orchestration.
- `scripts/refresh-local-live.mjs` — sealed production adapter boundary for the local refresh CLI.
- `scripts/refresh-local-facts.mjs` — exact runtime, persistence, route and revision fact validation.
- `scripts/refresh-seed-store.mjs` — neutral pnpm store preparation and safe seed relocation rules.
- `apps/api/Dockerfile.refresh` and `apps/web/Dockerfile.refresh` — offline refresh image construction.
- `ops/phase6-local-refresh-evidence.json` — existing immutable local-refresh evidence format to evolve, never blindly trust.

### Verification Baseline

- `.planning/phases/06-public-discovery-data/06-CONTEXT.md` — fixed local authority, no-server execution, data visibility and failure-closed decisions.
- `.planning/phases/06-public-discovery-data/06-VERIFICATION.md` — independently verified discovery data and current refresh primitives.
- `.planning/phases/07-responsive-discovery-experience/07-CONTEXT.md` — fixed `3100`, generated-port browser isolation and responsive visitor decisions.
- `.planning/phases/07-responsive-discovery-experience/07-VERIFICATION.md` — 5/5 verified visitor outcomes and exact automated evidence.
- `.planning/phases/07-responsive-discovery-experience/07-SECURITY.md` — same-origin, strict-response, resource-bound and runner-cleanup security findings.
- `scripts/local-verify.mjs` and `scripts/local-verify.test.mjs` — canonical isolated verification selector/result contracts.
- `scripts/phase7-browser-verify.mjs` — generated-port, exact-count responsive browser acceptance and cleanup model.
- `scripts/ops-status.mjs` and `scripts/ops-status.test.mjs` — canonical local status facts and read-only health checks.
- `scripts/refresh-local.test.mjs` — refresh authority, concurrency, rollback, atomic-publication and fault-path regression suite.
- `scripts/release-gate.mjs` — terminal production `BLOCKED` decision that must remain independent of local success.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `scripts/refresh-local.mjs` already defines the fixed project/origin/volumes, clean-revision boundary, offline probes and a sealed no-argument CLI.
- `scripts/refresh-local-runtime-core.mjs` already provides exact command allowlisting, durable per-revision attempt claims, staged migration/cutover/rollback, sanitized facts and atomic evidence/failure reports.
- `scripts/refresh-local-facts.mjs` already validates canonical container names, Compose labels, volumes, routes, Git facts, persistence digests and release state.
- `scripts/phase7-browser-verify.mjs` already proves 15 responsive discovery scenarios with generated ports, strict pass/skip accounting and exact process cleanup.
- `scripts/local-verify.mjs` already owns isolated PostgreSQL/Compose namespaces and prior milestone regression selection.

### Established Patterns

- Every mutation follows read-only preflight, exact authority validation, bounded execution, postcondition evidence and namespace-scoped cleanup.
- Browser acceptance runs against generated loopback origins; the canonical `3100` runtime is protected from test-fixture mutation.
- Production capability and local readiness are deliberately separate; every local artifact remains `releaseState: BLOCKED`.
- Evidence files are sanitized, permission-checked, byte-bound, atomically published and never overwritten.

### Integration Points

- Add the single operator-facing package command in `package.json` and keep its implementation behind the sealed refresh CLI.
- Extend the refresh plan/facts/evidence pipeline to cover Phase 7 routes, exact v1.1 test counts and current-revision fixed-runtime proof.
- Compose cutover must use only canonical `compose.yaml`, `blogxlocal`, immutable target/rollback image IDs and the two retained volumes.
- The final Phase 8 gate should compose isolated Phase 6/7 acceptance with a read-only fixed `3100` inspection instead of duplicating their test logic.

</code_context>

<specifics>
## Specific Ideas

- “One command” means one safe operator action with fixed authority, not a configurable deployment framework.
- A successful message must make it obvious that the page at `127.0.0.1:3100` corresponds to the current committed revision.
- The user's fixed database is real local data: exhaustive feature tests belong in disposable environments, while canonical-runtime checks remain read-only.
- Unknown port ownership, missing seed images, dirty Git state, alternate volumes, skipped tests, stale evidence, or a non-`BLOCKED` release decision are all terminal failures before success can be claimed.

</specifics>

<deferred>
## Deferred Ideas

- Production deployment, main-server cutover, TLS renewal and secondary-server database rollout remain blocked by the explicit server freeze and are outside Phase 8.
- Automatic GitHub deployment/CI and registry publishing are separate future capabilities; Phase 8 is local delivery only.
- The Phase 7 medium-risk recommendation to add an internal API fetch timeout/body limit remains a later security-hardening item rather than being hidden inside delivery work.

</deferred>

---

*Phase: 08-reliable-local-delivery*
*Context gathered: 2026-08-19*
