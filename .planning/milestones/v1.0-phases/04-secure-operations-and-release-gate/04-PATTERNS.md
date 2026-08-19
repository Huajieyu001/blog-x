# Phase 4: Secure Operations and Release Gate — Pattern Mapping

**Mapped:** 2026-08-09
**Phase:** 04 — Secure Operations and Release Gate
**Scope:** `SEC-01`, `SEC-02`, `SEC-03`, `OPS-01`, `OPS-02`, `OPS-03`, `OPS-05`
**Evidence boundary:** repository-only; no tests, network calls, package installation, or server contact were performed

## Guardrails Carried into Every Change

- Phase 4 is a local readiness phase, not a deployment phase. Neither cloud host is an execution target, and the main host remains frozen until a future user message explicitly lifts that freeze.
- Browser-visible traffic remains relative to one Web origin: `/api`, `/media`, pages, feeds, and assets. `INTERNAL_API_ORIGIN`, database URLs, storage roots, and node addresses remain server/operator-only.
- Preserve the current ownership chain:

  ```text
  Browser -> Web same-origin entry -> Fastify -> service/repository -> PostgreSQL/media root
  Operator -> local fail-closed scripts -> generated Compose namespace/backup root
  ```

- No production import endpoint, public readiness detail endpoint, remote deploy command, server probe, or automatic unfreeze condition belongs in Phase 4.
- Secrets must not enter Git, fixtures, logs, manifests, reports, documentation, image layers, or command arguments that are retained as evidence.
- The current application is a single Fastify process. An in-memory limiter may claim only single-process protection; it must not imply a distributed guarantee.

## Current Repository Shape and Data Flow

| Current artifact | Current role / data flow | Phase 4 consequence |
|---|---|---|
| `apps/api/src/app.ts` | Module-level PostgreSQL pool, Fastify composition root, logger redaction, route registration, migration/seed/schema CLI, and one legacy publish route. | Central integration point for parsed startup configuration, security policy injection, shared guards, request limits, and registration order. Module-level environment access is currently too early for a complete fail-closed production gate. |
| `apps/api/src/auth/sessions.ts` | Opaque cookie token -> SHA-256 digest -> active PostgreSQL session lookup; issuance revokes older active sessions. | Reuse session authority unchanged. The mutation guard should depend on `SessionService`, not duplicate token parsing or expose browser tokens. |
| `apps/api/src/routes/{auth,admin-posts,taxonomy,pages,media,admin-export}.ts` | Route-local copies of no-store, session, and exact-Origin checks. | Consolidate unsafe/admin authorization without changing response ordering or DTO ownership. Login needs its own abuse path. |
| `packages/contracts/src/*.ts` | Strict Zod request/response allowlists and bounds. | Reuse as hostile-input authority. Server runtime configuration is a different boundary and should not be put into browser-facing DTOs merely for convenience. |
| `apps/api/src/media/{processor,storage}.ts` + `content/media-service.ts` | Decode limits, serial Sharp work, UUID keys, atomic source/derivative writes, database insertion, exact cleanup. | Strong analog for backup staging/atomic completion and media restore checks; extend failure-path tests instead of replacing this pipeline. |
| `compose.yaml` | Local Web/API/Postgres topology; only Web binds `127.0.0.1`; API/Postgres have no host ports; health checks exist. | Preserve as local verifier topology. Add bounded lifecycle/log policy here or in an explicit production override, but do not turn its trust-auth Postgres config into a claimed production definition. |
| `scripts/check-boundaries.mjs` | Tracked-file audit for secret-like material, Web ownership violations, public/internal origin leaks, cloud addresses, and frozen-host commands. | Extend known-bad fixtures and operational artifact coverage. Avoid weakening existing regexes. |
| `scripts/local-verify.mjs` | Generated Compose namespace/database/Web port/admin credentials, local build/migrate/test/browser orchestration, redaction, semantic result parsing, exact cleanup. | Canonical analog for isolated backup/restore rehearsals and `--phase4-full`. Preserve its exact namespace and fail-closed result semantics. |
| `packages/contracts/src/distribution.ts` + `content/export-repository.ts` | Strict v1 logical source manifest from a read-only repeatable-read snapshot. | Include as one backup component and reconstruction oracle, not as a substitute for PostgreSQL or binary media backup. |
| `docs/INFRASTRUCTURE.md`, `README.md`, `backups/README.md` | Human-readable topology/history/local commands and old Hexo recovery notes. | Reuse documentation style, not historical statements as live Phase 4 evidence. Add versioned operational/release documents with explicit unknown/blocked fields. |

## 04-01 Pattern Map — Authentication, Validation, Secrets, and Network Boundary

### Fastify auth/session/Origin guard

The closest current guard is local to `apps/api/src/routes/admin-posts.ts`:

```ts
async function guard(request: FastifyRequest, reply: ReplySubset) {
  reply.header("cache-control", "no-store");
  if (!await options.sessionAuth.administratorIdForToken(
    request.cookies[sessionCookieName],
  )) {
    reply.code(401).send({ error: "unauthorized" });
    return false;
  }
  return true;
}

function trustedOrigin(request: FastifyRequest) {
  return Boolean(options.publicOrigin)
    && request.headers.origin === options.publicOrigin;
}
```

The route order is currently session first, then exact Origin, for protected mutations:

```ts
if (!await guard(request, reply)) return;
if (!trustedOrigin(request)) {
  return reply.code(403).send({ error: "forbidden" });
}
```

Closest files with the same semantics:

- `apps/api/src/routes/admin-posts.ts`: protected reads and mutations; best behavioral reference.
- `apps/api/src/routes/admin-export.ts`: sensitive archive, no-store, authentication before Origin, constant attachment name, empty form-only parser.
- `apps/api/src/routes/media.ts`: authentication before Origin and bounded body parsing.
- `apps/api/src/routes/taxonomy.ts` and `apps/api/src/routes/pages.ts`: equivalent checks duplicated in compact route-local functions.
- `apps/api/src/routes/auth.ts`: exact-Origin login/logout and generic `401 { error: "unauthorized" }`; login is not an administrator mutation and should use a login-specific limiter before password verification.

Create/reuse mapping:

| Symbol | Action | Closest analog / required signature |
|---|---|---|
| `requireAdministratorMutation(...)` in new `apps/api/src/security/mutation-guard.ts` | **Create** | Reuse `SessionService.administratorIdForToken`, `sessionCookieName`, no-store, and exact `request.headers.origin === publicOrigin`. Return a narrow discriminated result or boolean so handlers cannot continue after a sent response. |
| `requireAdministrator(...)` | **Create or keep separate intentionally** | Read-only admin routes need session + no-store but do not require Origin. Do not force an unsafe-request policy onto GET solely to reduce lines. |
| `SessionService` | **Reuse unchanged** | Exact current public type: `export type SessionService = ReturnType<typeof createSessionService>`. |
| `trustedOrigin` | **Replace route-local copies** | Keep mandatory exact equality. Do not accept absent Origin and do not derive trust from `Referer` or forwarded headers. |
| Fastify global hook for general rate policy | **Create deliberately** | There is no existing `onRequest`/`preHandler` authorization or limiter hook. Route exclusions and public/admin policy must be enumerated and tested, not inferred from URL substrings alone. |

Important current outlier omitted by the research file list: `apps/api/src/app.ts` still registers `POST /articles/publish` directly. It checks Origin before authentication and duplicates publish persistence outside `adminPostRoutes`:

```ts
app.post("/articles/publish", async (request, reply) => {
  reply.header("cache-control", "no-store");
  if (request.headers.origin !== publicOrigin) return reply.code(403).send(...);
  if (!await app.sessionAuth.administratorIdForToken(...)) return reply.code(401).send(...);
  // direct insert
});
```

Phase 4 planning must explicitly migrate this route to the shared guard or remove the legacy tracer surface only after confirming its consumers (`apps/web/app/TracerAdmin.tsx` and prior tests). Leaving it out would make “all write routes share the policy” false.

### Session and password authority

Reuse these exact current controls rather than creating a parallel token system:

```ts
export const sessionCookieName = process.env.NODE_ENV === "production"
  ? "__Host-blog_x_session"
  : "blog_x_session";
export const sessionLifetimeSeconds = 60 * 60 * 24 * 14;
```

```ts
const token = randomBytes(32).toString("base64url");
tokenDigest: createHash("sha256").update(token).digest("hex")
```

Source: `apps/api/src/auth/sessions.ts`.

Password hashing authority remains `apps/api/src/db/seed-admin.ts`:

```ts
await hash(credentials.password, {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
});
```

The current `sessions_expiry_index` supports lookup/cleanup but no scheduled pruning exists. Session retention and limiter retention are separate concerns.

### Deterministic bounded limiter store and clock

**No direct rate-limiter analog exists.** Repository search found no `429`, `Retry-After`, request-rate store, injected clock, or pruning policy.

The closest structural seams are:

- `buildApp(options)` injection in `apps/api/src/app.ts`, currently accepting `logger`, `publicOrigin`, and `mediaRoot`. Extend this seam with a security policy/store/clock for deterministic tests rather than using global timers.
- The in-memory `processingTail` in `apps/api/src/media/processor.ts` serializes Sharp operations:

  ```ts
  let processingTail = Promise.resolve();
  async function serial<T>(operation: () => Promise<T>) { /* FIFO release */ }
  ```

  This is a concurrency-control analog only. It is not bounded by keys/time and must not be copied as a limiter store.
- `nextVersion()` and About versioning use `Date.now()` directly. They show timestamp monotonicity but do not provide an injectable clock.

Recommended new module boundaries:

```ts
export type Clock = { now(): number };

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export interface RateLimitStore {
  consume(key: string, policy: RateLimitPolicy): RateLimitDecision;
  size(): number;
}
```

Create under `apps/api/src/security/`:

- `policy.ts` or `config.ts`: immutable parsed limits/window/store capacity.
- `rate-limiter.ts`: normalized keying, fixed/sliding-window decision, bounded `Retry-After`.
- `bounded-store.ts`: capacity limit plus expired-entry pruning; deterministic eviction order.
- `mutation-guard.ts`: session/Origin/no-store authority.

Tests should inject a manual clock and store into `buildApp`, advance time without sleeping, prove recovery after the window, prove capacity never exceeds its bound, and prove two stores do not share state. Do not use `setTimeout` or wall-clock waits for limiter semantics.

Client-address keying must use Fastify's current socket-derived address. `buildApp()` does not set `trustProxy`, so forwarded headers are not currently trusted. Keep that fail-closed default explicit until a separately verified gateway topology exists.

### Zod request and configuration contracts

Current request-boundary pattern is strict parsing from `@blog-x/contracts`:

```ts
export const loginInputSchema = z.object({
  username: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(1024),
}).strict();
```

```ts
const parsed = adminPostInputSchema.safeParse(request.body);
if (!parsed.success) return reply.code(400).send(fieldErrors(parsed.error));
```

Existing bounded authorities to reuse:

| Contract | Current bounds / policy |
|---|---|
| `packages/contracts/src/auth.ts` | username 1..120 after trim; password 1..1024; strict object. |
| `packages/contracts/src/admin-posts.ts` | title 240, summary 1,000, slug 180 with Unicode-safe pattern, Markdown 200,000, SEO 320, tags 50 unique, strict nested cover media. |
| `packages/contracts/src/taxonomy.ts` | name 120, slug 180 normalized, strict input. |
| `packages/contracts/src/pages.ts` | About title 160, Markdown 200,000, strict input/version. |
| `packages/contracts/src/media.ts` | UUID-only same-origin media reference, MIME enum, alt 500, decorative/alt cross-field rule. |

**No API runtime configuration Zod schema exists.** `apps/api/src/app.ts` currently reads environment values ad hoc, creates the pool at module import, defaults `DATABASE_URL`, and only checks `PUBLIC_ORIGIN` in `main()`. The closest config-validation analog is manual Web origin validation in `apps/web/app/lib/site-metadata.ts`:

```ts
if (!/^https?:$/.test(origin.protocol)
  || origin.username || origin.password
  || origin.pathname !== "/" || origin.search || origin.hash) {
  throw new Error("PUBLIC_ORIGIN must be an absolute HTTP(S) origin without credentials, path, query, or fragment");
}
```

For server configuration, create `apps/api/src/security/config.ts` (or `apps/api/src/config.ts`) with a strict Zod schema and parse before creating the pool/listener/storage. Because `zod` is currently declared only by `packages/contracts/package.json`, either declare the existing locked package as a direct API dependency or keep a server-only schema in a consciously named package module; do not hide server secrets/config in public DTO exports.

`BuildAppOptions` is the existing test seam. Preserve overrides while making production startup parse all of:

- environment mode;
- `DATABASE_URL` without echoing it on failure;
- `PUBLIC_ORIGIN` with HTTPS mandatory in production and no credentials/path/query/hash;
- API bind/port policy;
- `MEDIA_ROOT` exact/absolute policy;
- limiter bounds;
- secure-cookie preconditions;
- administrator bootstrap inputs only for the seed command.

### Hostile Markdown, SQL-shaped input, and upload regression patterns

Markdown authority is exclusively `apps/api/src/content/markdown.ts`:

```ts
const parser = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: false });
// transforms
const sanitizer = unified()
  .use(rehypeSanitize, markdownSanitizeSchema)
  .use(rehypeStringify);
```

Closest regression file: `apps/api/test/markdown-renderer.test.ts`. It already asserts removal of scripts, styles, event handlers, unsafe URL protocols, data/file media, and hostile heading markup. Add Phase 4 fixtures here rather than inventing a second sanitizer test harness.

SQL access uses Drizzle value expressions and parameter arrays. Closest route-level integrity tests are `apps/api/test/article-lifecycle.test.ts`, `taxonomy.test.ts`, and `pages-archive.test.ts`. Phase 4 hostile SQL-shaped strings should be submitted through real route schemas and followed by independent row-count/content assertions; response status alone is insufficient.

Upload data flow and closest analogs:

```text
POST /admin/media
  -> bodyLimit + multipart count/size limits
  -> session then exact Origin
  -> duplicate field/file rejection
  -> processMedia(buffer, declaredMime)
  -> UUID source/derivative keys
  -> atomic 0600 writes
  -> database insert
  -> exact-file cleanup on failure
  -> public derivative only at /media/<uuid> with nosniff
```

Exact limits in `apps/api/src/routes/media.ts`:

```ts
limits: { files: 1, fields: 2, fieldSize: 500,
  fileSize: maximumSourceBytes, parts: 3 }
bodyLimit: maximumSourceBytes + 64 * 1024
```

Atomic storage in `apps/api/src/media/storage.ts`:

```ts
await writeFile(temporary, value, { flag: "wx", mode: 0o600 });
await rename(temporary, path);
```

Failure cleanup in `apps/api/src/content/media-service.ts`:

```ts
catch (error) {
  await Promise.all([
    storage.removeExact(sourceKey),
    storage.removeExact(derivativeKey),
  ]);
  throw error;
}
```

Closest test: `apps/api/test/media.test.ts`. It already covers MIME mismatch, polyglot/vector/GIF rejection, pixel bombs, traversal, oversize, duplicate file, unexpected fields, protected source bytes, immutable derivative, and no invalid DB row. Missing research cases to add there include truncated transport, duplicate `alt`/`decorative`, invalid decorative/alt combinations at upload, storage failure after one write, and DB failure cleanup.

### Secret and topology audit

Reuse `auditFiles(root, files)` / `auditRepository(root)` from `scripts/check-boundaries.mjs`. Existing high-value checks include:

```ts
if (/(^|\/)\.env(?:\.|$)/.test(relativePath)
  && relativePath !== ".env.example") { /* reject */ }

if (/-----BEGIN ... PRIVATE KEY-----/.test(content)
  || credentialUris.length > 0) { /* reject */ }
```

`operationalSurface()` currently covers `README.md`, `package.json`, `compose.yaml`, `.env.example`, scripts, Dockerfiles, and all `apps/web/`. It does **not** cover `docs/`, new `config/`/`deploy/` directories, arbitrary Compose overrides, or backup/release evidence fixtures. Phase 4 must extend the surface deliberately and add known-bad tests in `scripts/local-verify.test.mjs`.

`compose.yaml` currently proves the desired local exposure:

```yaml
api:
  # no ports mapping
postgres:
  # no ports mapping
web:
  ports:
    - "127.0.0.1:${BLOG_X_WEB_PORT:-3100}:3100"
```

This is the closest topology fixture. Add structural assertions that reject API/Postgres host `ports`, wildcard Web binds for local mode, browser references to internal addresses, and unsafe production origins. Do not infer host firewall/private-link truth from Compose alone.

## 04-02 Pattern Map — Operations, Backup, and Restore

### Compose health, lifecycle, logs, and local-only ports

Current service health pattern in `compose.yaml`:

```yaml
depends_on:
  api:
    condition: service_healthy
healthcheck:
  test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3100')..."]
  interval: 2s
  timeout: 5s
  retries: 30
```

Current gaps are exact: no `restart`, `init`, log driver/rotation, resource guardrails, backup job, restore job, secret-file policy, or certificate/status operator script. There is also no production Compose override. `postgres` uses `POSTGRES_HOST_AUTH_METHOD: trust`, and the API Dockerfile runs `tsx src/app.ts` via its `dev` command; these are local-development patterns, not production evidence.

Plan 04-02 should choose one explicit split:

- preserve `compose.yaml` as canonical local verification and add only lifecycle/log settings valid locally; create a production-shaped, non-deploying override/template for stronger auth/resources/secrets; or
- make common safe settings the base and isolate local trust/defaults in a local override.

Whichever split is chosen, the validator must render/parse the effective configuration locally and prove API/Postgres have no public host ports. Resource values must be documented as provisional until measured on authorized hosts.

### Operator status script

**No existing status script exists.** The closest process/result conventions are `runStep()` and `command()` in `scripts/local-verify.mjs`:

```ts
const result = { code: code ?? 1, signal, stdout, stderr,
  combined: `${stdout}${stderr}` };
if (result.code === 0 || options.allowFailure) accept(result);
else reject(...);
```

```ts
throw new Error(`${label} failed\n${redactText(output, context.secrets)}`);
```

Create `scripts/ops-status.mjs` as a local/fixture-testable, non-deploying reporter. Reuse `redactText`; return nonzero for unhealthy/unknown required checks; print concise labels, not raw environment/inspect JSON. Separate local checks from future authorized host/TLS evidence so a local “certificate not checked” cannot become a pass.

### Backup format and atomic completion

**No Blog X database/media/config backup implementation exists.** `backups/README.md` and tracked checksums describe the earlier Hexo archive only. They are documentation/history analogs, not the Phase 4 backup format.

The closest atomic-write pattern is `LocalMediaStorage.atomicWrite()`; the closest stable logical snapshot is `ExportRepository.archive()`; the closest exact-root safety pattern is `cleanupGeneratedMediaRoot()`.

Recommended new operator-only modules under `scripts/backup/` (concrete names are preferable to the research wildcard `scripts/backup-*`):

| New artifact | Responsibility | Closest current analog |
|---|---|---|
| `scripts/backup/manifest.mjs` | Strict versioned manifest parse/serialize, relative member names, sizes, SHA-256, completeness marker. | `portableExportManifestSchema` strict literal format/version; `createHash("sha256")` migration fingerprint. |
| `scripts/backup/paths.mjs` | Validate generated/staging/final roots and exact members; reject root/workspace/broad paths. | `validateNamespace`, `validateMediaVolume`, `cleanupGeneratedMediaRoot`. |
| `scripts/backup/create.mjs` | Restrictive staging directory, DB dump, v1 logical export, complete source+derivative media copy, sanitized config inventory, checksum verification, atomic final rename. | `LocalMediaStorage.atomicWrite`; `ExportRepository.archive`; `runStep`. |
| `scripts/backup/verify.mjs` | Reparse manifest, require supported version/completeness, recompute every checksum/size, reject extra/missing/dangling media members. | `portableExportManifestSchema.parse`; Phase 3 forbidden-field scan. |
| `scripts/backup/restore.mjs` | Offline generated-target validation, preflight-before-mutation, DB/media restore orchestration, schema verification. | `runSingle` generated context and exact cleanup. |
| `scripts/backup/*.test.mjs` | Pure known-bad format/path/tamper tests. | `scripts/local-verify.test.mjs`. |

The backup set data flow should remain explicit:

```text
PostgreSQL pg_dump -----------------------> database member
ExportRepository.archive()/protected v1 --> logical Markdown member
API-owned MEDIA_ROOT source+derivative ---> media members
sanitized config/image/migration inventory -> config member
all member hashes/sizes ------------------> versioned manifest
verified staging + completeness ----------> atomic final directory
```

Phase 3 export authority to reuse:

```ts
return db.transaction(async (tx) => {
  // explicitly selected source rows, deterministic ID order
  return portableExportManifestSchema.parse({
    format: "blog-x-portable-export",
    version: 1,
    // retained raw Markdown and safe nonbinary references
  });
}, { isolationLevel: "repeatable read", accessMode: "read only" });
```

The v1 manifest intentionally excludes media bytes, storage keys, authentication, and configuration. Phase 4 must keep it unchanged and place those authorities in separate protected backup members. Do not add fields to v1 to make backup orchestration easier.

### Isolated restore rehearsal

Reuse `scripts/local-verify.mjs` generated-context invariants exactly:

```ts
validateNamespace("blogxverify_<random>")
validateDatabaseName(`blog_x_<suffix>`, namespace)
validateMediaVolume(`${namespace}_media-data`, namespace)
validateLoopbackHttpOrigin("http://127.0.0.1:<generated-port>")
```

Current final cleanup is bounded to the validated project:

```ts
await command("docker-compose",
  composeArgs(context, "down", "--remove-orphans", "--volumes"),
  { env: composeEnvironment(context), allowFailure: true });
```

Add a separate generated backup root under `tmpdir()` with a precise prefix and an exact restore namespace. Never reuse `blogxlocal`, accept a caller-supplied broad path, or use glob deletion. Validate the entire backup before starting a restore mutation.

Reconstruction comparison should extend Phase 3's independent normalized map pattern in `apps/api/test/distribution-export.test.ts`:

```ts
assert.deepEqual(reconstructed, sourceMap,
  "independent normalized source maps must equal the strict reparsed archive");
```

Phase 4 adds byte hashes for every source and derivative object plus restored Web/API visibility. The restored browser journey should use only the generated Web origin and `/media/<uuid>`; it must not query PostgreSQL or the API container directly.

### Local verifier generated namespace, cleanup, and semantic results

Create a `phase4Selection(mode)` beside `phase3Selection(mode)` rather than adding ad hoc flags throughout `main()`. The canonical `full` selection should name security API tests, operations/manifest tests, restore integration, and restored-content browser journey explicitly.

Preserve semantic gates:

```ts
assertSemanticTap(output)       // rejects skip, TODO, zero tests
assertPlaywrightJourney(output) // rejects skipped or zero passed journeys
semanticTestCommand(file)       // fixed node + tsx + TAP command shape
```

Preserve log safety:

```ts
context.secrets.push(context.password, context.databaseUrl);
if (secret && raw.includes(secret)) throw new Error(...);
```

Phase 4 test helpers should be exported and unit-tested from `scripts/local-verify.test.mjs` before wiring them into the canonical runner. A missing `pg_dump`, Docker/Compose, manifest member, checksum, browser pass, or suite selection must fail; it must never cause a skip/pass.

## 04-03 Pattern Map — Release Readiness and Frozen-Host Gate

### Release evidence contract and validator

**No release evidence schema, validator, release checklist, or rollback runbook exists.** Create:

- `docs/RELEASE-GATE.md`: human workflow, evidence ownership, age/validity, explicit user-unfreeze prerequisite, and permanently blocked current status.
- `docs/ROLLBACK.md`: immutable prior artifact, edge config, migration compatibility, media preservation, owner, verification, stop criteria.
- `scripts/release-gate.mjs`: local parser/validator only; no network or deployment capability.
- `scripts/release-gate.test.mjs` or a focused directory under `scripts/release-gate/`: synthetic valid/invalid evidence fixtures.

Closest schema pattern is the strict literal/version manifest in `packages/contracts/src/distribution.ts`:

```ts
z.object({
  format: z.literal("blog-x-portable-export"),
  version: z.literal(1),
  // explicit allowlisted members
}).strict();
```

Use the same fail-closed principles for a release-readiness evidence schema: literal format/version, exact named prerequisites, timestamps/expiry policy, hashes/references rather than secret values, and `.strict()` at every nested level. This is an operator artifact; keep its schema under `scripts/release-gate/` unless the API/Web must consume it (they currently must not).

Closest known-bad fixture style is `scripts/local-verify.test.mjs`, which creates temporary files and calls `auditFiles()` directly. Add independent fixtures for missing unfreeze, missing restore, public data-plane port, browser node address, credential-like content, incomplete/tampered backup, unsupported version, and rollback without immutable prior artifact.

The real repository state must remain `BLOCKED`; only synthetic complete evidence may pass unit tests. A local phase pass or Git push is not unfreeze authorization.

### Documentation/runbook conventions

Current human documentation conventions:

- `docs/INFRASTRUCTURE.md`: title, status/date block, numbered sections, role tables, explicit security principles, “current” versus “target” topology, ordered production operation steps, prohibitions, risk priorities, and related links.
- `README.md`: prerequisite lists, copy-paste command blocks, one-command verification, exact cleanup behavior, common failure modes, and links to deeper operations docs.
- `backups/README.md`: backup member descriptions, excluded/regenerable items, restore commands, and checksum verification.
- Phase summaries: YAML front matter with `provides`, `key-files`, `key-decisions`, `coverage`, verification evidence, deviations, and explicit cloud-contact statement.

New operations docs should copy the structure but improve evidence semantics:

- label `local policy verified`, `host evidence pending`, or `blocked`; never label fixture results as production truth;
- include owner, timestamp, artifact version/hash, validity/expiry, preconditions, stop criteria, rollback, and verification outcome;
- use placeholders for decisions such as off-host target, retention, RPO/RTO, alert recipient, tunnel implementation, and change window;
- never include credentials, private paths containing secrets, live cookie/session values, or ready-to-run remote commands while the freeze remains active.

Historical statements in `docs/INFRASTRUCTURE.md` (server inventory, certificate observation, maintenance page, OS state) predate Phase 4 and are not live evidence. They may be referenced as history only. The document also names public node addresses, so broadening `operationalSurface()` to all `docs/` without a migration/fixture strategy would make the current repository fail immediately; planning must intentionally sanitize/scope historical docs or define artifact-specific checks.

`README.md` is stale in two specific ways: it says the current product/one-command gate is Phase 2 even though Phase 3 is complete, and it points only to `--phase2-full`. Phase 4 final integration should update this to the canonical `--phase4-full` while retaining narrower commands where useful.

## Stale, Ambiguous, or Nonexistent Research Paths

| Research reference | Actual repository status | Corrected mapping |
|---|---|---|
| `apps/api/src/routes/admin-posts.ts`, `taxonomy.ts`, `pages.ts`, `media.ts`, `admin-export.ts` | Only the first path is fully qualified; the latter names do not exist at `apps/api/src/` root. | Actual files are all under `apps/api/src/routes/`: `taxonomy.ts`, `pages.ts`, `media.ts`, `admin-export.ts`. |
| “all state-changing routes” list | Incomplete. | Also include `POST /articles/publish` in `apps/api/src/app.ts` and `POST /auth/logout` in `apps/api/src/routes/auth.ts`; enumerate registered methods in a regression test. |
| new `apps/api/src/security/*` | Directory does not exist. | Create focused `config/policy`, `rate-limiter/bounded-store`, and `mutation-guard` modules; do not assume an existing security package. |
| `.env.production.example` style file | Does not exist and would currently be ignored by `.gitignore` (`.env.*`) and rejected by `check-boundaries.mjs` (only `.env.example` is allowed). | Safest current analog is `.env.example` with a clearly separated production name-only section. If an exact production example file is chosen, update `.gitignore`, the boundary allowlist, and known-bad fixtures together. |
| production secret-file template/permission validator | Does not exist. | Create a local fixture-tested config/permission preflight; do not test against real `/etc` or a cloud host. |
| production Compose/topology artifact | Does not exist. | `compose.yaml` is local-only and uses Postgres trust auth. Create/plan an explicit non-deploying production override/template; do not relabel the local file as proven production topology. |
| `scripts/ops-status.mjs` | Does not exist. | Create it using `runStep`/`redactText`/nonzero-result conventions. |
| `scripts/backup-*`, `scripts/restore-*` | No matching files exist; wildcard is ambiguous. | Prefer a cohesive `scripts/backup/` module set with manifest, paths, create, verify, restore, and tests. |
| `docs/OPERATIONS.md` | Does not exist. | Create it and link from refreshed `README.md`; treat `docs/INFRASTRUCTURE.md` as historical/target context, not live status output. |
| `docs/RELEASE-GATE.md`, `docs/ROLLBACK.md`, `scripts/release-gate.mjs` | None exist. | Create in 04-03 with a versioned local-only evidence contract and synthetic fixtures. |
| current certificate/status evidence | Only a historical statement exists in `docs/INFRASTRUCTURE.md`. | Mark actual certificate/renewal status pending future authorized host baseline; Phase 4 may test command/evidence shapes only. |
| complete Blog X backup | No current artifact. `backups/` contains Hexo-era notes/checksums and untracked large archives. | Create a new versioned Blog X backup format outside tracked recovery payloads; never overwrite or reinterpret Hexo backups. |
| deterministic clock/store | None exists. | Add injectable seams; direct `Date.now()` and media FIFO serialization are not sufficient analogs. |

## Reuse vs Create Summary

### Reuse without semantic weakening

- `SessionService`, SHA-256 token digests, `sessionCookieOptions`, Argon2id seed policy.
- Strict request DTOs and their current field bounds in `packages/contracts/src/*`.
- `renderMarkdown` as sole HTML authority.
- Media MIME/decode/dimension/pixel limits, UUID storage keys, atomic 0600 writes, and exact cleanup.
- `portableExportManifestSchema` v1 and `createExportRepository().archive()` unchanged as the logical portability component.
- Compose internal API/Postgres networking and loopback-only Web port.
- `auditFiles`/`auditRepository`, generated namespace/database/media validators, redaction, semantic TAP/Playwright assertions, and exact Compose cleanup.
- Documentation status/warnings/checklists and Phase summary evidence format.

### Create deliberately

- API security configuration/policy parser, bounded limiter store with injected clock, route policies, and shared admin mutation guard.
- Route enumeration/regression suite covering every unsafe method and the legacy publish route.
- Production-shaped environment/topology template with no values/secrets and no public data-plane port.
- Bounded Compose lifecycle/log/resource policy and local status reporter.
- Versioned complete backup manifest, exact path validators, create/verify/restore orchestration, tamper fixtures, and isolated restored-browser journey.
- `phase4Selection()` and canonical `--phase4-full` runner branch.
- Operations, release gate, and rollback runbooks plus a machine-checkable local-only release evidence validator.

## Integration Ordering

1. **Inventory and configuration first:** enumerate every registered unsafe route, introduce parsed security/config policy and test seams, and keep production startup fail-closed before pool/listener/storage creation.
2. **Pure limiter primitives:** implement injected clock, bounded store, pruning/eviction, and generic decisions with deterministic unit tests.
3. **Shared guard and route migration:** adopt the session + exact-Origin + no-store guard across admin mutations, explicitly resolve `/articles/publish`, then add login/general route limiters without changing generic auth failures.
4. **Hostile-input/upload/boundary regressions:** extend existing Markdown, media, auth, lifecycle, boundary, config, and topology suites. This locks the security base before operational scripts consume it.
5. **Compose/status policy:** add restart/init/log/resource declarations and structural tests while preserving local-only ports and distinguishing local trust settings from production templates.
6. **Backup primitives:** implement exact paths, strict versioned manifest, hashing/completeness, staging/atomic finalization, and tamper tests before invoking Docker or PostgreSQL tools.
7. **Backup creation and isolated restore:** combine PostgreSQL dump, unchanged Phase 3 export, complete media, and sanitized config inventory; validate before mutation; restore only into a generated namespace and compare normalized rows/bytes.
8. **Phase 4 verifier wiring:** add focused selectors first, then `--phase4-full`, preserving prior Phase 1–3 gates, no-skip semantics, redaction, loopback-only browser traffic, and exact cleanup.
9. **Release gate last:** build documentation and evidence validator on top of verified security/backup/status artifacts. Keep real state blocked and omit remote execution capability.
10. **Final documentation refresh:** update `README.md`, link operations/rollback/release docs, and record unknown production-only evidence without claiming live host truth.

## Planning Completion Checks

1. Every registered unsafe Fastify route is enumerated and covered by authentication, exact-Origin, no-store, input/body/content-type, and appropriate rate policy assertions.
2. Login abuse tests use an injected clock/store, return generic responses, recover after the window, and prove memory capacity/pruning plus single-process scope.
3. Production startup configuration is parsed before resource creation and rejects non-HTTPS production origin, unsafe bind/origin shapes, missing secrets/config, and invalid limits without printing secret values.
4. Existing Markdown/SQL/media security authorities remain the only execution paths, with hostile row/file integrity tests covering cleanup failures.
5. Effective topology tests prove only the Web edge has a loopback/public entry as intended; API/Postgres never gain host ports in the accepted artifact.
6. Restart/log/resource/status controls are structurally and behaviorally verified, while certificate status remains explicitly pending authorized live evidence.
7. A complete backup set has DB dump, unchanged v1 logical export, both media classes, sanitized config inventory, strict manifest, hashes, and completeness marker; every incomplete/tampered/unsafe path fails before restore mutation.
8. Restore uses only a generated namespace/root/port, proves raw source/lifecycle/taxonomy/About/media byte equality and same-origin restored reading, and cleans only its exact generated targets.
9. Release evidence cannot pass without explicit future user unfreeze, current host/network/backup/restore/rollback/TLS evidence, and immutable prior artifact; repository state remains blocked now.
10. Canonical `--phase4-full` retains all Phase 1–3 checks, rejects skipped/zero tests and missing tools, performs no remote/network fallback, and emits only redacted local evidence.

## PATTERN MAPPING COMPLETE
