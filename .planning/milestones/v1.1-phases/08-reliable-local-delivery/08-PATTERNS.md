# Phase 8: Reliable Local Delivery — Pattern Mapping

**Mapped:** 2026-08-20  
**Scope:** Local repository only. This mapping does not authorize a server connection, deployment, or production-state change.

## File Classification

| File | Expected action | Role / data flow | Closest current analog |
|---|---|---|---|
| `package.json` | Modify | Exposes the one no-argument, operator-facing fixed delivery command. It must delegate to the sealed refresh CLI rather than add shell composition or environment overrides. | `local:verify`: `node scripts/local-verify.mjs` at `package.json:16`; refresh CLI direct entry at `scripts/refresh-local.mjs:200-205`. |
| `scripts/refresh-local.mjs` | Modify | Public sealed CLI/plan boundary. Resolves clean HEAD and lock digest, declares fixed project/origin/volumes and stage sequence, delegates into the runtime core. Evolves external format/path/kind from Phase 6 to unambiguous v1.1. | `FIXED_REFRESH`, `createRefreshPlan`, `runLocalRefresh`, `runRefreshCli` (`scripts/refresh-local.mjs:27-70,84-111,184-205`). |
| `scripts/refresh-local-runtime-core.mjs` | Modify | Core authority boundary: exact argv allowlist, preflight/build/migrate/cutover/rollback orchestration, fact collection, per-revision claim/failure report, atomic receipt write and read-only verification. Add any Phase 8 acceptance invocation/result binding here or through a narrow injected coordinator boundary. | `assertAllowedRefreshCommand` (`:281-325`), `createRawRefreshRuntime` (`:460-613`), `publishEvidence` (`:401-458`), `runRefreshCliBoundary` (`:759-816`). |
| `scripts/refresh-local-facts.mjs` | Modify | Validates exact canonical Compose authority and read-only canonical route facts; sanitizes/projections facts for the receipt. Extend fixed route contract here only after choosing a data-independent/read-only route proof. | `REFRESH_AUTHORITY`, `assertRouteFacts`, `assertFixedRuntimeAuthority`, `assertPersistenceTransition`, `projectSanitizedFacts` (`scripts/refresh-local-facts.mjs:8-17,87-124,167-203,221-251`). |
| `scripts/refresh-local-live.mjs` | Modify only if the core gains a new production-only boundary | Keeps production assembly sealed: creates raw runtime with native spawn/FS/fetch; exposes no injected authority knobs. | `nativeProductionRun` and zero-argument factories (`scripts/refresh-local-live.mjs:24-54`). |
| `scripts/refresh-local-test-core.mjs` | Modify only if test seams change | Test-only raw-boundary assembly. It records argv/fetch/file reads while production remains sealed. | `createRefreshTestRuntime` (`scripts/refresh-local-test-core.mjs:21-55`). |
| `scripts/refresh-local.test.mjs` | Modify | Unit/fault-path regression suite for plan ordering, immutable authority, stale evidence, claims, rollback and every atomic publication fault. Add first-class v1.1/port/acceptance failure cases here. | Native `node:test` setup (`:1-31`); source-policy test (`:268-288`); exact allowlist test (`:326-330`); complete terminal-stage and atomic-fault loops (`:969-1032`). |
| `scripts/local-verify.mjs` | Modify only if it exports a narrow Phase 8 acceptance entry/result parser | Owns isolated `blogxverify_*` Compose data acceptance. Preserve generated namespace/port and disposable data; Phase 8 must not point it at `blogxlocal`. | `phase6Selection` (`:155-167`); exact TAP/Playwright/boundary parsers (`:191-250`); `runPhase6DataChecks` (`:907-925`). |
| `scripts/local-verify.test.mjs` | Modify if Phase 8 reuses/exports acceptance result data | Tests exact suite selection and parsers. Use its direct expected-object/assert-throws style for new selection/result contracts. | Phase 6 exact selection test (`:145-180`) and fail-closed count parser matrix (`:320-360`). |
| `scripts/phase7-browser-verify.mjs` | Modify only to expose a machine-consumable, unfiltered complete-result record; otherwise invoke as-is via a coordinator | Runs the isolated responsive matrix on generated loopback ports, validates nonzero exact passing count and cleans every managed child/root. Never feed `3100` into this runner. | `assertPlaywrightResult` (`:123-136`), option parsing (`:196-215`), generated origins and `finally` cleanup (`:227-264`). |
| `scripts/local-delivery-acceptance.mjs` (name discretionary) | Likely create | Narrow coordinator: invokes the complete isolated Phase 6/7 gates, parses records/counts, binds sanitized output digests for the final receipt. It must have no Compose authority over `blogxlocal` and no partial/grep mode. | No direct Phase 8 coordinator exists. Reuse `createPhase5ResultRecorder` record/finalize shape in `scripts/local-verify.mjs:298-345`, but do **not** reuse its Phase 5 receipt authority. |
| `scripts/local-delivery-acceptance.test.mjs` (name discretionary) | Likely create | Isolated tests for coordinator input/record schema, exact nonzero counts, digest binding, rejection of partial/skipped/missing evidence, and redaction. | `scripts/local-verify.test.mjs:338-360` and `scripts/refresh-local.test.mjs:969-1032`. |
| `apps/api/Dockerfile.refresh` | Modify only for renamed v1.1 provenance label/value or build contract change | Offline API target based on an immutable seed; uses neutral versioned pnpm store and frozen install. | Current target (`apps/api/Dockerfile.refresh:1-30`). |
| `apps/web/Dockerfile.refresh` | Modify only for renamed v1.1 provenance label/value or build contract change | Offline Web target, explicitly embeds `PUBLIC_ORIGIN` before build. Retain exact canonical origin. | Current target (`apps/web/Dockerfile.refresh:1-33`), especially `ENV PUBLIC_ORIGIN=${PUBLIC_ORIGIN}` at `:29`. |
| `scripts/refresh-seed-store.mjs` | Normally unchanged | Pre-warm/neutral-store primitive. Phase 8 consumes its verified versioned-store contract; it should not duplicate relocation logic. | `validateStorePaths` (`:19-29`) and verify-before-delete `prepareSeedStore` (`:73-90`). |
| `compose.yaml` | Normally unchanged | Canonical service, health, loopback-port and named-volume topology inspected by refresh facts. Do not add a delivery-specific project, alternate volumes or temporary published port. | `web` loopback port (`compose.yaml:70-84`), offline build networks (`:23-30,48-57`) and declared named volumes (`:86-88`). |
| `ops/phase6-local-refresh-evidence.json` | Preserve historical artifact; do not overwrite | Existing Phase 6 receipt. Phase 8 needs an explicit new v1.1 receipt path/schema and must reject stale Phase 6 authority when validating delivery. | Current path constants in `scripts/refresh-local-runtime-core.mjs:16-18,490-496,616-701`. |

## Analog Map

### 1. Imports and sealed boundary layout

Follow the current three-layer layout rather than placing Docker calls in `package.json` or a new all-purpose script:

```js
// scripts/refresh-local.mjs:6-11
import {
  createProductionLiveRefreshAdapter,
  createProductionRefreshAttemptStore,
  verifyProductionLiveRefreshEvidence,
} from "./refresh-local-live.mjs";
import { runRefreshCliBoundary } from "./refresh-local-runtime-core.mjs";
```

`refresh-local-live.mjs:42-49` constructs production dependencies with no arguments, while `refresh-local-test-core.mjs:21-55` is the sole test-only assembly point. A Phase 8 coordinator should either be a narrowly exported pure/parser module or be passed through the existing raw runtime boundary; it should not expose `root`, project, origin, FS, or command overrides from the operator CLI.

### 2. Fixed authority, CLI parsing and stage reporting

The authority constants are literal and immutable:

```js
// scripts/refresh-local.mjs:27-32
export const FIXED_REFRESH = Object.freeze({
  project: "blogxlocal",
  origin: "http://127.0.0.1:3100",
  services: ["api", "web"],
  volumes: ["blogxlocal_postgres-data", "blogxlocal_media-data"],
});
```

Preserve the current no-argument happy path and exact-option failures. `runRefreshCliBoundary` rejects any unknown option (`scripts/refresh-local-runtime-core.mjs:759-785`) before resolving/claiming the revision. The one delivery package script should invoke this normal no-argument path; it must not add flags, `BLOG_X_*` overrides, Compose `-p` values, or shell pipelines.

Stage execution already has a fail-safe rollback boundary:

```js
// scripts/refresh-local.mjs:84-110
for (const phase of plan.phases) { /* write-evidence last */ }
// after cutover only:
await adapter.execute("rollback-api-web", plan);
await adapter.execute("verify-rollback", plan);
```

Add acceptance only at a deliberate plan stage. A failure before cutover must leave the serving runtime untouched; a failure after it must use the existing immutable-image rollback/verification path.

### 3. Exact command/Compose inspection policy

Do not interpolate shell commands. Every child argv passes a token-level allowlist:

```js
// scripts/refresh-local-runtime-core.mjs:460-464
const run = async (command, args, options = {}) => {
  assertAllowedRefreshCommand(command, args, options);
  return runArgv(command, args, options);
};
```

The whitelist pins `docker-compose -p blogxlocal -f compose.yaml`, exactly two volumes, explicit `--network=none --pull=false` build arguments, and only API/Web `up --no-build --no-deps` (`scripts/refresh-local-runtime-core.mjs:281-325,391-400`). Extend that whitelist only with exact new argv shapes required by the final agreed design. A port-owner inspection is **not** currently represented in the allowlist: add it as a read-only, exact argv/probe and make the preflight fail instead of killing/rebinding anything.

Compose authority is independently validated from inspect facts, not assumed from successful `up`:

```js
// scripts/refresh-local-facts.mjs:105-123
if (!item || item.Name !== `/${REFRESH_AUTHORITY.containers[service]}`
  || item.State?.Health?.Status !== "healthy") fail(...);
if (labels["com.docker.compose.project"] !== REFRESH_AUTHORITY.project
  || labels["com.docker.compose.service"] !== service
  || labels["com.docker.compose.oneoff"] !== "False") fail(...);
```

This must continue to prove exactly three canonical containers, API/Postgres un-published ports, canonical `127.0.0.1:3100`, and exactly two `blogxlocal_*` local volumes.

### 4. Offline build and provenance

The build targets already use immutable seed IDs, fixed lock digest and labels. Reuse their construction and rename `phase6-offline` deliberately everywhere together—plan, both Dockerfiles, target validation, evidence schema and tests:

```dockerfile
# apps/web/Dockerfile.refresh:19-30
WORKDIR /refresh-workspace
RUN corepack pnpm install --store-dir=/pnpm-store --offline --frozen-lockfile
...
ENV PUBLIC_ORIGIN=${PUBLIC_ORIGIN}
RUN corepack pnpm --filter @blog-x/web build
```

The runtime builds with exact offline argv (`scripts/refresh-local-runtime-core.mjs:391-392`) then inspects image config/labels/filesystem/store before migration (`:477-488,552-563`). The seed relocation helper verifies manifests before deleting inherited store/workspace material (`scripts/refresh-seed-store.mjs:73-90`). Preserve that order; do not use host `node_modules`, pulls, registry checks, or new seed volume authority.

### 5. Atomic claims, evidence and failures

The durable per-SHA attempt claim precedes runtime mutation (`scripts/refresh-local-runtime-core.mjs:785-799`). Its writer and the final receipt writer use the same secure publication pattern: exclusive temp file, fsync, hard link to a non-existent final name, directory fsync, temp cleanup, with unrecoverable-invariant reporting if publication safety becomes unknowable.

```js
// scripts/refresh-local-runtime-core.mjs:431-440
handle = await fs.open(temp, "wx", 0o600);
await handle.writeFile(bytes, "utf8"); await handle.sync();
await fs.link(temp, finalPath);
await syncDirectory();
await fs.unlink(temp); await syncDirectory();
```

`assertEvidenceAbsent` additionally rejects existing final receipts and stale temp names (`:490-496`). Evolve rather than replace these functions. The v1.1 receipt verifier must retain the current read-only before/after byte equality check (`:704-749`) and reject any historical Phase 6 evidence as the final delivery authority.

### 6. Acceptance counts, isolated data, browser cleanup

Use actual parsed test counts, never an exit code or only HTTP health. Existing reusable parsers reject zero tests and all failure/cancel/skip/TODO states:

```js
// scripts/local-verify.mjs:197-216
if (!tests) throw new Error("semantic test output reported zero semantic tests");
if (failed || cancelled || skipped || todo) {
  throw new Error("semantic test output contains a non-pass result");
}
return { tests, passed, failed, cancelled, skipped, todo };
```

The isolated Phase 6 selection is a fixed five-database-suite list plus its node/boundary checks (`scripts/local-verify.mjs:155-167,907-925`). The Phase 7 runner allocates two ephemeral ports, sets its generated `PUBLIC_ORIGIN`, and always tears down exact child process groups and only a validated generated directory (`scripts/phase7-browser-verify.mjs:227-264`). A new acceptance coordinator must invoke the complete Phase 7 matrix without its `--grep` test hook; it must record the exact parser result/digest and cannot make generated URLs part of canonical image/build facts.

### 7. Tests and cleanup conventions

Tests use `node:test` and `assert/strict`, test exported/pure functions directly, and build in-memory raw process/FS seams for failure paths (`scripts/refresh-local.test.mjs:1-31,57-158`; `scripts/refresh-local-test-core.mjs:21-55`). Follow the current table/loop style to cover all terminal stages and every atomic write/cleanup point (`scripts/refresh-local.test.mjs:969-1032`).

For resources that really are disposable, cleanup validates the exact generated authority before `rm`; e.g. `cleanupGeneratedMediaRoot` checks `tmpdir` plus a strict prefix before deletion (`scripts/local-verify.mjs:257-263`), and Phase 7 checks `apps/.phase7-web-*` before removal (`scripts/phase7-browser-verify.mjs:256-263`). Canonical volumes and port listeners are never cleanup targets.

## Shared Patterns

- Prefer small exported pure validators/parsers plus sealed production adapters. Keep dependency injection in `*-test-core.mjs`, not in normal CLI exports.
- Freeze critical authority in module constants and compare exact arrays/keys/labels. `exactKeys`, canonical JSON ordering and SHA-256 projections are the repository's evidence schema style (`scripts/refresh-local-facts.mjs:44-62,221-251`).
- Use bounded child execution and sanitized user-facing error reporting. `runStep` prefixes a stage and redacts captured output (`scripts/local-verify.mjs:414-423`); production refresh uses a minimal child environment and only permits explicit image env additions (`scripts/refresh-local.mjs:113-131`; `scripts/refresh-local-runtime-core.mjs:104-129`).
- Collect preflight/post-migration/post-cutover facts and compare persistence transitions; never merely trust command completion (`scripts/refresh-local-runtime-core.mjs:582-609`; `scripts/refresh-local-facts.mjs:167-203`).
- Treat `BLOCKED` as a required terminal fact, not a release candidate state (`scripts/refresh-local-runtime-core.mjs:387,591-599`; `scripts/refresh-local-facts.mjs:221-228`).

## No Analog Found

1. **Canonical port-owner preflight.** Existing facts prove the canonical container's port mapping after Compose inspection, but no current code compares the host listener on `3100` to that exact Web container before mutation. Add a narrow read-only preflight check plus unit tests for unknown process, wrong Compose container, and correct canonical owner. Do not derive a kill/fallback behavior from any existing cleanup pattern.

2. **Phase-8/v1.1 receipt schema and path.** The only final receipt is explicitly `blog-x-phase6-local-refresh-evidence` version 4 at `ops/phase6-local-refresh-evidence.json` (`scripts/refresh-local-runtime-core.mjs:16-18,616-701`). Choose and test a new name/path/format together; preserve the old artifact as history.

3. **One coordinator that binds the complete Phase 6 and Phase 7 results into refresh evidence.** Phase 6 has an isolated runner and exact parsers; Phase 7 emits a human/machine-readable result line but no exported structured result. Use the Phase 5 recorder concept only as a shape reference, not as evidence/writer authority.

4. **Content-independent representative reading-route proof.** Current canonical routes include taxonomy/base routes and a deliberately missing related endpoint (`scripts/refresh-local-facts.mjs:8-17,87-102`). The planner must pick a read-only discovery/verification strategy that does not require inserting a public article into canonical data.

## Planner Guidance

1. Plan tests before implementation: receipt rename/schema, port-owner rejection, strict full-suite counts/digests, stale/partial acceptance evidence, and all new terminal stages. Extend `scripts/refresh-local.test.mjs` first; place coordinator parser tests beside the current local-verification parser tests or in a dedicated focused test file.
2. Add `local:deliver` (or another single, no-argument name) as a direct Node invocation in `package.json`. Keep the operator surface no-argument; retain diagnostic test-only CLI options only if they remain exact and do not become the delivery command path.
3. Evolve the existing plan/runtime/facts/live layers together. Any new evidence format/path/kind must be updated in all of: plan labels, both refresh Dockerfiles if label value changes, runtime schema/verify path, live verifier, test-core path, source-policy tests and fixture FS paths.
4. Run isolated Phase 6 and Phase 7 acceptance before any canonical migration/cutover, capture parser-validated counts and sanitized evidence digests, then perform only read-only canonical `3100` facts/routes after cutover. Do not seed/reset/compose-down `blogxlocal`.
5. Make port ownership a pre-mutation, read-only, fail-closed stage. Add its exact subprocess shape to `assertAllowedRefreshCommand` and verify it reports safe diagnostics without logging secrets or terminating the listener.
6. Keep migration/cutover ordering unchanged: offline build/probe and target-image inspection, one-off target API migration and schema check, then immutable-ID Compose cutover. Retain `rollback-api-web` + `verify-rollback` on post-cutover failures.
7. Final success should print the committed full revision (or clear abbreviated display while receipt holds full SHA), fixed URL, canonical route/health summary, receipt path, exact acceptance counts, and `RELEASE BLOCKED`. The receipt verifier must independently reconstruct fixed facts and guarantee it did not alter the receipt bytes.
