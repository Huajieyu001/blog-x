# Phase 8: Reliable Local Delivery - Research

**Researched:** 2026-08-20  
**Domain:** Fail-closed local Docker/Compose delivery, offline image builds, and revision-bound verification  
**Confidence:** HIGH

## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Fixed Command and Port Authority

- **D-01:** Provide one repository command with no operational flags or authority-changing environment overrides. It always targets canonical `compose.yaml`, project `blogxlocal`, origin `http://127.0.0.1:3100`, and the exact PostgreSQL/media volumes.
- **D-02:** The GSD/operator runs the command explicitly after each major completed development step. Do not install a background watcher, post-commit hook, or implicit refresh that could mutate the local runtime unexpectedly.
- **D-03:** Require a clean committed worktree and bind the full current Git SHA to target image labels, verification facts, and the final receipt. Dirty or detached/unprovable source state fails before any runtime mutation.
- **D-04:** If port `3100` is owned by anything other than the exact canonical `blogxlocal` Web container, fail preflight with diagnostics. Never kill an unknown process, silently switch ports, or treat an ad-hoc Next dev process as canonical delivery.
- **D-05:** The command prints concise stage progress and ends with the current revision, fixed URL, route summary, and evidence path; failures identify the exact stage and safe recovery action without dumping secrets.

#### Offline Build and Seed Images

- **D-06:** Target Web/API builds are strictly offline: `network=none`, `pull=false`, frozen lockfile, and no implicit registry/DNS fallback. Registry unavailability must not affect a properly prepared refresh.
- **D-07:** Seed images are accepted only through immutable image IDs plus the exact `pnpm-lock.yaml` digest and a populated neutral versioned pnpm store. Run offline probe builds before any migration or cutover.
- **D-08:** Missing, stale, or incompatible seed images stop the refresh before mutation and return a separate pre-warm/remediation instruction. The fixed refresh command must never secretly pull images or copy arbitrary host `node_modules`.
- **D-09:** The delivered Web image must embed exactly `PUBLIC_ORIGIN=http://127.0.0.1:3100`; generated verification ports may never leak into the canonical image.

#### Data Preservation and Failure Recovery

- **D-10:** Reuse and verify only `blogxlocal_postgres-data` and `blogxlocal_media-data`. The workflow may not create substitute data volumes, reset data, remove volumes, or reinterpret a similarly named Compose project as authority. — **Reversibility:** one-way — accidental volume replacement or deletion could permanently lose the user's blog data.
- **D-11:** Finish both offline builds and immutable-image inspection first. Then run idempotent migration and schema verification through a one-off target API image before cutting over the serving API and Web containers.
- **D-12:** Database migrations are forward-only during refresh; never run destructive down migrations. Migration postconditions must preserve existing rows, media inventory, sequences, and previously applied ledger history.
- **D-13:** If failure occurs after cutover begins, restore API/Web to the exact immutable preflight image IDs and verify the original health and route baseline. A pre-cutover failure leaves the serving runtime untouched.
- **D-14:** Enforce one durable refresh attempt per clean revision. Concurrent attempts, repeated claims, existing final evidence, or unverifiable failure-report publication fail closed and never overwrite prior authority.

#### Layered Acceptance and Revision Receipt

- **D-15:** Keep exhaustive v1.1 feature acceptance isolated in generated namespaces/ports with disposable data. The canonical `3100` verification is read-only and must not seed, edit, or delete the user's fixed PostgreSQL/media state.
- **D-16:** The isolated layer proves Phase 6 data semantics and the complete Phase 7 responsive browser matrix. The fixed-runtime layer proves current-revision image labels, exact Compose/container/volume authority, three healthy services, same-origin API behavior, and representative public routes.
- **D-17:** A successful refresh requires exact non-zero test counts with zero failures, skips, TODOs, or missing suites. HTTP 200 alone, container health alone, or an old receipt is insufficient.
- **D-18:** Write one sanitized, atomic, non-overwriting v1.1 receipt containing the implementation revision, evidence digests, actual result counts, fixed-runtime facts, and terminal `releaseState: BLOCKED`. Local success never grants production authority.
- **D-19:** At completion, the fixed `3100` environment must be the canonical Compose runtime for the committed revision, not the temporary generated browser server or an ad-hoc developer process.

### the agent's Discretion

- Exact package-script name, internal module split, receipt schema field names, bounded timeout values, and console formatting may be selected during research/planning if they preserve the fixed authorities and evidence contracts above.
- The planner may reuse or evolve Phase 6 refresh artifacts rather than rewrite them, but stale `phase6` naming in externally consumed v1.1 evidence must be made unambiguous.

### Deferred Ideas (OUT OF SCOPE)

- Production deployment, main-server cutover, TLS renewal and secondary-server database rollout remain blocked by the explicit server freeze and are outside Phase 8.
- Automatic GitHub deployment/CI and registry publishing are separate future capabilities; Phase 8 is local delivery only.
- The Phase 7 medium-risk recommendation to add an internal API fetch timeout/body limit remains a later security-hardening item rather than being hidden inside delivery work.

## Project Constraints (from AGENTS.md)

- No connection to, deployment to, or modification of frozen primary server `47.99.80.8`; Phase 8 stays local. [VERIFIED: AGENTS.md:12-21]
- Keep PostgreSQL non-public; do not commit credentials, private keys, tokens, or database credentials. [VERIFIED: AGENTS.md:19-21]
- Preserve export/backup/restore-oriented content durability and same-origin browser delivery. [VERIFIED: AGENTS.md:20-21]
- Use an established GSD workflow for repository changes; this research artifact is produced by the active phase-research workflow. [VERIFIED: AGENTS.md:47-54]

## Phase Requirements

| ID | Description | Research Support |
|---|---|---|
| DEVX-01 | One fixed command updates `blogxlocal` Web/API, retains PostgreSQL/media volumes, performs idempotent migrations, and waits for health. [VERIFIED: .planning/REQUIREMENTS.md:19-23] | Extend the existing sealed CLI/runtime adapter; its allowlist already constrains the canonical Compose `up`, one-off migration, schema verification, health, volumes, and rollback. [VERIFIED: scripts/refresh-local-runtime-core.mjs:281-325,460-618] |
| DEVX-02 | Offline-first refresh reuses installed dependencies without creating another Compose project or persisting temporary acceptance URLs to `3100`. [VERIFIED: .planning/REQUIREMENTS.md:21-23] | Retain the existing offline build probes, seed-ID/lock-digest labels, neutral pnpm store, and fixed `PUBLIC_ORIGIN`; explicitly preflight/remediate missing seed prerequisites. [VERIFIED: scripts/refresh-local.mjs:141-173; scripts/refresh-seed-store.mjs:73-90] |
| DEVX-03 | Automated acceptance proves the current Git revision’s local page, API health, principal public routes, and visible changes. [VERIFIED: .planning/REQUIREMENTS.md:21-23] | Compose isolated Phase 6 data acceptance and Phase 7 browser acceptance with a read-only canonical-runtime facts/evidence gate whose target labels and receipt carry the exact revision. [VERIFIED: scripts/local-verify.mjs:907-925; scripts/phase7-browser-verify.mjs:123-145,227-264; scripts/refresh-local-facts.mjs:76-124,221-282] |

## Summary

Phase 8 is an integration-and-hardening phase, not a new deployment system. The repository already has a no-argument refresh entry, a fixed authority object, an offline probe/build plan, an exact command allowlist, durable attempt claims, atomic evidence publication, staged migration/cutover/rollback, and sanitized runtime facts. The plan should evolve these components’ externally consumed artifact names/schema from Phase 6 to unambiguous v1.1 delivery terminology, then add the single package command and v1.1 acceptance composition. [VERIFIED: scripts/refresh-local.mjs:27-70,184-205; scripts/refresh-local-runtime-core.mjs:135-205,281-325,759-818]

The central safety boundary is two-layered: generated namespaces and ports own feature acceptance; the fixed canonical runtime owns only read-only authority/route inspection after its controlled refresh. Existing Phase 6 checks reset generated acceptance data, while the Phase 7 runner creates generated ports and removes only its owned temporary root; neither should be redirected to `3100`. [VERIFIED: scripts/local-verify.mjs:907-925; scripts/phase7-browser-verify.mjs:227-264]

**Primary recommendation:** Add one `package.json` no-argument script that calls the sealed refresh CLI, then make that CLI’s successful terminal receipt require: preflighted offline targets, isolated Phase 6/7 exact-count evidence, fixed-runtime facts for the same SHA, and `releaseState: BLOCKED`. [VERIFIED: package.json:8-22; scripts/refresh-local.mjs:184-205; scripts/refresh-local-facts.mjs:221-251]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Fixed operator entry | Repository script / Node CLI | package manager | A package script should only delegate to the sealed no-argument Node boundary. [VERIFIED: package.json:8-22; scripts/refresh-local.mjs:184-205] |
| Offline target-image creation | Docker build | Node refresh planner | Docker performs `--network=none` builds; the planner creates revision/lock/seed-bound arguments and labels. [VERIFIED: scripts/refresh-local.mjs:41-70,141-173] |
| Canonical data preservation and migration | Compose/PostgreSQL | one-off target API | Compose owns the exact retained volumes; migration/schema verification precedes API/Web cutover. [VERIFIED: compose.yaml:1-85; scripts/refresh-local-runtime-core.mjs:281-325,460-618] |
| Feature acceptance | Isolated Compose/Node/Playwright runners | local verifier selector | Disposable namespaces prove Phase 6; generated loopback Web proves Phase 7. [VERIFIED: scripts/local-verify.mjs:155-166,907-925; scripts/phase7-browser-verify.mjs:227-264] |
| Fixed-runtime acceptance and receipt | Node facts/runtime core | Docker/Compose/Git/release gate | Runtime core collects exact authority and route facts, publishes non-overwriting evidence, and independently retains BLOCKED. [VERIFIED: scripts/refresh-local-runtime-core.mjs:330-388,401-459,664-818; scripts/refresh-local-facts.mjs:221-282] |

## Standard Stack

No new dependency is needed. Preserve the installed Node 24.15.0, pnpm 11.20.0, Docker 29.7.1, Docker Compose 5.4.0, and Git 2.50.1 toolchain; the root package manifest declares `pnpm@11.20.0` and Node `>=24.15.0`. [VERIFIED: package.json:1-33; environment probe 2026-08-20]

| Component | Existing version/authority | Purpose in Phase 8 |
|---|---|---|
| Node ESM scripts | Node `v24.15.0` available [VERIFIED: environment probe 2026-08-20] | Keep orchestration, strict validation, evidence hashing, and redaction in existing scripts. |
| pnpm/Corepack | `pnpm@11.20.0` [VERIFIED: package.json:6; environment probe 2026-08-20] | Use frozen, offline dependency installation within seed-derived image builds. |
| Docker/Compose | Compose file with `network: none`, `pull_policy: never`, service healthchecks, loopback-only Web port [VERIFIED: compose.yaml:1-85] | Build immutable targets and run only canonical `blogxlocal` services. |
| Playwright | `@playwright/test` `1.62.1` [VERIFIED: package.json:24-33] | Reuse Phase 7’s exact-count generated-port browser matrix. |

**Installation:** none. No package legitimacy audit is required because the phase should not install external packages. [VERIFIED: package.json:24-33]

## Architecture Patterns

### Delivery flow

```text
explicit package command
  -> sealed no-argument refresh boundary
  -> read-only preflight: clean SHA + local Docker authority + exact port/project/volumes
  -> offline seed probe + immutable target builds + label/filesystem inspection
  -> isolated Phase 6 data gate + generated-port Phase 7 browser gate (disposable state)
  -> canonical preflight facts (read-only retained volumes)
  -> one-off migration + schema verification
  -> canonical API/Web cutover, three-health check, same-origin route facts
  -> success: v1.1 atomic receipt (SHA + evidence digests + counts + BLOCKED)
     failure before cutover: no canonical mutation
     failure after cutover: immutable API/Web rollback + baseline route verification
```

This ordering follows the present runtime core’s planned phases and rollback mechanism; Phase 8 must add the acceptance evidence as a required pre-cutover or terminal gate without allowing it to mutate canonical data. [VERIFIED: scripts/refresh-local.mjs:59-70,84-110; .planning/phases/08-reliable-local-delivery/08-CONTEXT.md:35-49]

### Recommended implementation boundaries

1. **Operator contract:** add one name-only package script (recommended: `local:deliver`) whose value is exactly `node scripts/refresh-local.mjs`; do not add flags or env passthrough. This is a planning recommendation based on the existing sealed no-argument CLI. [VERIFIED: scripts/refresh-local.mjs:184-205; ASSUMED: final script name]
2. **Refresh plan/image metadata:** replace externally consumed `phase6-offline` / `blog-x-phase6-local-refresh-evidence` identifiers with versioned v1.1 names while keeping compatibility migration explicit. Target labels must still bind application, full revision, lock digest, seed image ID, fixed public origin, and refresh kind. [VERIFIED: scripts/refresh-local.mjs:17-25,41-70,141-173; .planning/phases/08-reliable-local-delivery/08-CONTEXT.md:51-55]
3. **Preflight gate:** read the current port listener/container, Compose services, exact volume identities, Git cleanliness/full SHA, seed image IDs, lock digest, and neutral store before any migration/cutover. Reuse exact command allowlisting rather than construct shell strings. [VERIFIED: scripts/refresh-local-runtime-core.mjs:281-325,350-388; scripts/refresh-local-facts.mjs:105-124]
4. **Runtime core:** retain its attempt-claim and sanitized atomic failure/evidence publication APIs; extend schemas to carry v1.1 suite evidence digests/counts and explicit representative public-route observations. [VERIFIED: scripts/refresh-local-runtime-core.mjs:135-205,401-459,664-818; ASSUMED: exact v1.1 field names]
5. **Acceptance coordinator:** call isolated Phase 6 data and Phase 7 browser runners through a dedicated coordinator that captures parser-validated records, then include their immutable digests and exact counts in the final receipt. It must not reuse the historical Phase 5 receipt writer because its scope and output contract are different. [VERIFIED: scripts/local-verify.mjs:197-253,907-925,1072-1119; scripts/phase7-browser-verify.mjs:123-145]

### Don’t hand-roll

| Problem | Do not build | Reuse / extend | Why |
|---|---|---|---|
| Docker/Compose authority | Shell interpolation or configurable project/volume strings | `assertAllowedRefreshCommand`, facts authority checks, and fixed constants | Existing code fail-closes arbitrary commands, alternate envs, container/volume names, and non-local Docker sockets. [VERIFIED: scripts/refresh-local-runtime-core.mjs:104-129,281-325; scripts/refresh-local-facts.mjs:105-124] |
| Concurrent/repeated refresh prevention | In-memory lock or overwrite-prone JSON | durable per-revision attempt claims and atomic link publication | Existing store verifies directory/file owner/mode/realpath and rejects an existing final claim. [VERIFIED: scripts/refresh-local-runtime-core.mjs:135-205] |
| Evidence file writes | `writeFile` overwrite | existing secure temp/write/sync/link publication | Existing evidence publication rejects existing final evidence and verifies ownership/mode/realpath. [VERIFIED: scripts/refresh-local-runtime-core.mjs:401-459] |
| Test success detection | exit code / HTTP 200 | TAP, Playwright, and boundary-result parsers | Existing parsers reject zero tests and failures/skips/TODO/incomplete results. [VERIFIED: scripts/local-verify.mjs:191-253; scripts/phase7-browser-verify.mjs:123-145] |

## Verification Architecture

`.planning/config.json` explicitly disables Nyquist validation, so the GSD-specific `## Validation Architecture` template is intentionally omitted. Phase 8 nevertheless requires targeted regression and end-to-end verification because DEVX-01..03 are acceptance-critical. [VERIFIED: .planning/config.json:18-46]

| Layer | Existing source | Required Phase 8 use |
|---|---|---|
| Unit/fault-path refresh tests | `scripts/refresh-local.test.mjs` exercises exact terminal stages, rollback, sanitized reports, and atomic-publication faults. [VERIFIED: scripts/refresh-local.test.mjs:994-1032] | Update/add tests first for renamed evidence, port preflight, v1.1 receipt schema, exact counts, stale/missing evidence, and every new terminal stage. |
| Isolated data gate | `phase6Selection("data")` names five database suites, `scripts/local-verify.test.mjs`, and boundary scan; runtime asserts TAP and BLOCKED. [VERIFIED: scripts/local-verify.mjs:155-166,907-925; scripts/local-verify.test.mjs:145-184] | Preserve generated namespace/port behavior; record actual parser counts/digests, not only a terminal marker. |
| Isolated browser gate | Phase 7 runner launches generated fixture/Web origins, demands equal nonzero discovered/passed tests, rejects non-pass categories, and verifies cleanup. [VERIFIED: scripts/phase7-browser-verify.mjs:123-145,227-264] | Invoke the complete matrix, capture its exact count (currently independent verification records 15/15), and refuse filtered/partial modes. [VERIFIED: .planning/phases/07-responsive-discovery-experience/07-VERIFICATION.md:89-108] |
| Fixed-runtime read-only gate | Facts validate exactly three healthy canonical containers, two labeled volumes, expected routes/API contracts, image labels, Git facts, and BLOCKED state. [VERIFIED: scripts/refresh-local-facts.mjs:76-124,221-282] | Add Phase 7 visitor routes (at minimum `/search` and a representative article route) to the fixed route contract; ensure the routes prove same-origin without reseeding data. [ASSUMED: exact route set must be finalized against available canonical content] |
| Final receipt verifier | `verifyRawRefreshEvidence` and CLI boundary already verify published evidence before terminal output. [VERIFIED: scripts/refresh-local-runtime-core.mjs:704-818] | Verify one current-revision v1.1 receipt only; require SHA/evidence digest/count/fixed facts/`BLOCKED`, and prohibit Phase 6 ambiguity. |

Recommended test task order:

1. Add failing unit tests for v1.1 receipt, authority naming, fixed-port ownership, and exact acceptance-result requirements.
2. Implement/refactor the sealed planner/runtime/facts/live adapter to satisfy them, retaining all existing fault-path tests.
3. Add an isolated acceptance-coordinator test seam; prove complete Phase 6/7 records are mandatory and partial/skip/old evidence fails.
4. Run source tests (`node --test scripts/refresh-local.test.mjs` and `node --test scripts/local-verify.test.mjs`), then operational isolated gates and the single no-argument delivery command on a clean commit.

## Common Pitfalls

### Stale Phase 6 external evidence

The existing plan labels its refresh kind as `phase6-offline` and points at `ops/phase6-local-refresh-evidence.json`; shipping that unchanged would make v1.1 authority ambiguous. Evolve the public schema/path deliberately and test backward-reference rejection rather than merely changing prose. [VERIFIED: scripts/refresh-local.mjs:56,96; scripts/refresh-local-runtime-core.mjs:16-23]

### Treating canonical `3100` as a test fixture

Phase 6 resets acceptance data and Phase 7’s runner starts generated-port child processes. Directing either workflow at canonical volumes or port would violate data preservation and invalidate the fixed runtime as a post-delivery artifact. Keep all fixture mutation isolated; canonical checks must collect facts/routes only. [VERIFIED: scripts/local-verify.mjs:907-925; scripts/phase7-browser-verify.mjs:227-264]

### Port conflict recovery that kills a developer process

The current canonical Compose port declaration is loopback `3100`; D-04 requires diagnostics and failure if its owner is not the canonical Web container. Add a read-only listener/container comparison before mutation; do not implement `kill`, fallback-port behavior, or a Next-dev exception. [VERIFIED: compose.yaml:77-83; .planning/phases/08-reliable-local-delivery/08-CONTEXT.md:20-26]

### Calling an offline build “offline” without seed/store proof

`network=none` and `pull=false` are necessary but not sufficient: targets must prove immutable seed identity, exact lock digest, neutral versioned store location, and no inherited `/workspace` or host `node_modules`. Reuse probe filesystem/label checks before migration. [VERIFIED: scripts/refresh-local.mjs:73-81,141-173; scripts/refresh-seed-store.mjs:73-90]

### Equating health or exit status with full acceptance

The repository’s parsers deliberately reject skipped/TODO/zero/non-pass outcomes. The v1.1 receipt should hold parsed counts and evidence digests from full isolated gates, then separately require canonical health/routes. [VERIFIED: scripts/local-verify.mjs:191-253; scripts/phase7-browser-verify.mjs:123-145]

### Expanding into deployment authority

The release-gate path is part of facts collection and requires terminal `BLOCKED`; no Phase 8 code may add SSH, registry publication, primary-server access, or promotion logic. [VERIFIED: scripts/refresh-local-runtime-core.mjs:387; .planning/REQUIREMENTS.md:25-31]

## Security Domain

| ASVS category | Applies | Phase 8 control |
|---|---|---|
| V5 Input validation | Yes | Strict no-argument boundary, command argv allowlist, exact labels/paths/keys, fixed URL/project/volumes. [VERIFIED: scripts/refresh-local.mjs:184-205; scripts/refresh-local-runtime-core.mjs:281-325] |
| V8 Data protection | Yes | Preserve canonical PostgreSQL/media identity, take facts before/after, sanitize evidence/failure reports, and do not write credentials. [VERIFIED: scripts/refresh-local-facts.mjs:145-203,221-251; AGENTS.md:19-21] |
| V10 Malicious code | Yes | Offline builds with known seed IDs and lock digest, local Docker Unix-socket authority, no arbitrary child environment. [VERIFIED: scripts/refresh-local.mjs:141-173; scripts/refresh-local-runtime-core.mjs:104-129] |
| V14 Configuration | Yes | Exact canonical Compose project/services/volumes/port, health checks, and non-overwriting receipt authority. [VERIFIED: compose.yaml:1-85; scripts/refresh-local-facts.mjs:105-124; scripts/refresh-local-runtime-core.mjs:401-459] |

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|---|---|---|
| A1 | The final package-script name should be `local:deliver`. | Architecture Patterns | Naming could conflict with existing conventions; planner may choose another no-argument name under D-01. |
| A2 | The fixed-runtime public-route set should include `/search` plus a representative article route. | Verification Architecture | The route may need a deterministic available public slug or an alternative content-independent proof. |
| A3 | Exact v1.1 receipt field names can be selected during planning. | Architecture Patterns | Schema needs an explicit test contract before implementation. |

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|---|---|---|---|---|
| Node | all scripts | ✓ | v24.15.0 [VERIFIED: environment probe 2026-08-20] | — |
| Corepack/pnpm | builds and browser runner | ✓ | pnpm 11.20.0 [VERIFIED: environment probe 2026-08-20] | — |
| Docker | offline images and canonical runtime | ✓ | 29.7.1, context `colima` [VERIFIED: environment probe 2026-08-20] | — |
| Docker Compose | canonical services and migrations | ✓ | 5.4.0 [VERIFIED: environment probe 2026-08-20] | — |
| Git | clean-SHA authority | ✓ | 2.50.1 [VERIFIED: environment probe 2026-08-20] | — |
| `lsof`/`curl` | read-only port/route diagnostics | ✓ | paths present [VERIFIED: environment probe 2026-08-20] | Docker inspection/fetch facts also exist |

## Open Questions (RESOLVED)

1. **Canonical read-only article-route proof:** Discover a public slug from the strict public list read-only, prove the fixed-origin `/posts/<encoded-slug>` route when the published set is nonempty, and record `empty_public_set` explicitly when it is empty; malformed or inconsistent public-list outcomes fail closed. [VERIFIED: .planning/phases/08-reliable-local-delivery/08-03-PLAN.md:29-33,172-181]
2. **v1.1 evidence path:** Use `ops/v1.1-local-delivery-evidence.json` as the sole current-revision v1.1 delivery receipt path. [VERIFIED: .planning/phases/08-reliable-local-delivery/08-01-PLAN.md:145-151,208-215; .planning/phases/08-reliable-local-delivery/08-03-PLAN.md:47-49,199-213]

## Sources

### Primary (HIGH confidence)

- Repository source of truth: `compose.yaml`, `package.json`, `scripts/refresh-local*.mjs`, `scripts/refresh-seed-store.mjs`, `scripts/local-verify.mjs`, `scripts/phase7-browser-verify.mjs`, and their tests (line citations inline).
- Locked Phase 8 decisions: `.planning/phases/08-reliable-local-delivery/08-CONTEXT.md`.
- Prior acceptance evidence: `.planning/phases/06-public-discovery-data/06-VERIFICATION.md` and `.planning/phases/07-responsive-discovery-experience/07-VERIFICATION.md`.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — every recommended component is already declared, installed, and/or used in repository source. [VERIFIED: package.json:1-33; environment probe 2026-08-20]
- Architecture: HIGH — Phase 8 decisions match existing refresh/facts/runtime boundaries; only external v1.1 naming and deterministic visitor-route selection remain discretionary. [VERIFIED: .planning/phases/08-reliable-local-delivery/08-CONTEXT.md:20-55; scripts/refresh-local.mjs:27-205]
- Pitfalls: HIGH — they arise directly from existing fixed authorities, generated runners, and Phase-6 artifact identifiers. [VERIFIED: compose.yaml:77-85; scripts/refresh-local-runtime-core.mjs:16-23; scripts/phase7-browser-verify.mjs:227-264]

**Research date:** 2026-08-20  
**Valid until:** implementation begins; re-check local tool versions and committed source before execution.
