---
phase: 04-secure-operations-and-release-gate
research_date: 2026-08-09
status: complete
requirements: [SEC-01, SEC-02, SEC-03, OPS-01, OPS-02, OPS-03, OPS-05]
research_scope: repository-only
cloud_contact: none
---

# Phase 4 Research: Secure Operations and Release Gate

## Scope and non-negotiable boundaries

This research is based only on tracked repository evidence. It did not connect to,
probe, deploy to, or alter either cloud host.

- The main host `47.99.80.8` is fully frozen. It is not an execution target for
  Phase 4 development, tests, planning commands, or release scripts.
- The secondary host is not a browser origin. Any later secondary-host change must
  be separately authorized, reversible, and performed only after a read-only
  baseline check.
- Browser traffic remains same-origin: public pages, `/api`, and `/media` are
  served through the blog HTTPS origin. Neither a public API endpoint nor a public
  database endpoint is an acceptable replacement.
- Credentials, tokens, private keys, database URLs with passwords, and server
  secrets must never enter Git, generated artifacts, test output, backups intended
  for source control, or planning documents.

Phase 4 is therefore a local, fail-closed implementation and evidence phase. It
prepares operational artifacts and release gates; it does not release the site.

## Current baseline

### Application and topology

The current Compose topology is intentionally small:

| Component | Current role | Network exposure observed in `compose.yaml` |
|---|---|---|
| `web` | Next public entry and `/api`/`/media` rewrite point | `127.0.0.1:${BLOG_X_WEB_PORT}:3100` only |
| `api` | Fastify application, auth, content, media, export | no host `ports` mapping |
| `postgres` | PostgreSQL content/session persistence | no host `ports` mapping |
| `media-data` | API-owned source/derivative volume | Docker volume, not Web-owned |

`web` uses `INTERNAL_API_ORIGIN=http://api:3001` only on the server side, and
`PUBLIC_ORIGIN` is a validated public identity. Existing boundary checks reject
Web imports of PostgreSQL, API internals, filesystem/media ownership, literal
secondary-server browser requests, hard-coded public hostname, outbound browser
requests, public diagnostic routes, tracked environment files, private keys, and
commands targeting the frozen host.

The present Compose file is a local development/verification topology, not yet a
production operations definition. It has service health checks but no restart
policy, resource reservation/limit policy, log driver/rotation policy, backup
job, restore job, production secret-file policy, or host-side certificate/status
probe.

### Existing security controls

The application already provides useful foundations.

- Login verifies Argon2id hashes (`memoryCost: 19456`, `timeCost: 2`,
  `parallelism: 1`), returns generic 401 failures, and only seeds a single
  administrator from environment input.
- Sessions use 32-byte CSPRNG tokens, persist only SHA-256 token digests, expire
  after 14 days, revoke prior active sessions on login, and use HttpOnly,
  SameSite=Lax, path-root cookies. Production/HTTPS chooses a `Secure` cookie and
  production cookie naming uses `__Host-blog_x_session`.
- All existing state-changing application routes perform opaque-session checking
  and exact configured `Origin` equality. The export path authenticates before
  Origin authorization and is `Cache-Control: no-store`.
- Request DTOs are strict Zod allowlists. Article, taxonomy, page, login, and
  media values are validated by routes/services; Drizzle uses typed query values
  rather than interpolating client input into SQL.
- Markdown is rendered server-side through the shared sanitizer pipeline. Public
  data projections deliberately omit raw Markdown and admin-only lifecycle data.
- Media upload has a single file, 5 MiB source limit, narrow multipart limits,
  strict accepted MIME/decode/animation/dimension/pixel processing, UUID storage
  keys, atomic 0600 writes, and `nosniff` on public derivative responses.
- Fastify logging redacts cookie, authorization, password, token, and credential
  fields. The local verifier also redacts generated credentials and fails if
  captured service logs contain generated credentials or a session value.

Phase 1--3 verification confirms the above with database/API/browser evidence,
including same-origin requests and no browser token storage. Phase 3's portable
export is a strict, versioned logical JSON archive that includes retained raw
Markdown and source metadata, but intentionally excludes media bytes, storage
keys/paths, rendered HTML, configuration, and infrastructure authority.

### Material gaps against Phase 4 requirements

| Requirement | Existing evidence | Remaining Phase 4 gap |
|---|---|---|
| SEC-01 | Authenticated writes and exact-Origin CSRF control exist. | No explicit login-attempt limiter or general request-rate limiter; no centralized, testable abuse policy. |
| SEC-02 | Strict DTOs, parameterized DB access, sanitizer, and media validation exist. | Need regression tests/gates that make the full hostile-input/upload contract durable and ensure limits are explicitly configured. |
| SEC-03 | Argon2id, env seed, secret/log boundary checks exist. | No production secret-file template/permission verification or startup fail-closed configuration validation. |
| OPS-01 | Local Compose hides API/Postgres from host; Web is loopback-only. | No production topology artifact that proves API/database bind/allow rules and only the HTTPS gateway is public. |
| OPS-02 | Container health checks and `/health` exist. | No restart, bounded logs, resource inspection, disk/CPU/memory/certificate status script, or alert-ready exit semantics. |
| OPS-03 | Logical Markdown export and media volume exist. | No daily database+binary+config backup, integrity manifest, isolated restore rehearsal, or retention/documented restore steps. |
| OPS-05 | Frozen-host checks reject targeted commands. | No explicit release checklist that requires user unfreeze, backup/restore, rollback, and secure inter-node link evidence before release. |

## Recommended low-resource operational architecture

Keep the deployed system deliberately monolithic and split only by the existing
two-node trust boundary.

```text
Internet
  -> main host: HTTPS reverse proxy + Web process/static Web container
       -> encrypted private link or authenticated tunnel
            -> secondary host: API container/process (loopback/private bind)
                 -> PostgreSQL (loopback/private bind only)
                 -> API-owned media volume
                 -> scheduled backup + bounded log/status jobs
```

Recommended operational characteristics:

1. The main host exposes only 80/443 (80 only for redirect/ACME validation) and
   SSH under separately approved host policy. It never exposes PostgreSQL.
2. The secondary host exposes neither PostgreSQL nor API to the Internet. The API
   accepts traffic solely from a verified private-network peer or encrypted
   tunnel. A browser must never learn its address.
3. Use Docker Compose with one API, one Postgres, and one Web/public-edge role;
   do not introduce Kubernetes, a queue, Elasticsearch, a metrics cluster, or a
   permanent image-processing worker on 2C2G + 2C4G.
4. Use restart policies (`unless-stopped` or an equally explicit supervisor
   policy), health checks, `init: true` where appropriate, bounded service logs,
   and modest CPU/memory reservations/limits set only after host baseline
   measurement. Limits are guardrails, not invented capacity guarantees.
5. Keep backup/restore commands as one-shot, purpose-built containers or host
   scripts with explicit destination directories and restrictive `umask`; do not
   put database passwords in image layers or command history.

Exact server-side bind addresses, firewall rules, Compose limits, backup target,
backup retention, alert recipient, RPO, and RTO remain pre-production decisions.
This phase must not claim an RPO/RTO that has not been selected and measured.

## Security hardening direction

### SEC-01: authentication, abuse controls, and CSRF

Add an API-owned security policy module/configuration with narrow defaults and
explicit environment parsing. The plan should add:

- a login limiter keyed by a privacy-conscious combination of normalized client
  address and normalized username, with a short fixed/sliding window and a small
  bounded in-memory store suitable for a single API process;
- a general route limiter for anonymous endpoints and a stricter limiter for
  state-changing/admin routes, returning a generic `429` plus bounded
  `Retry-After` where appropriate;
- an explicit trusted-proxy policy: do not trust forwarded client-address headers
  until the secondary-host gateway topology is independently verified;
- retention/pruning of limiter entries so a scan cannot grow memory without
  bound;
- no account-existence disclosure, no password/token logging, and no rate-limit
  key returned to the browser;
- a shared `requireAdministratorMutation()` guard so new admin endpoints cannot
  accidentally omit session + exact-Origin + `no-store` protection.

Existing SameSite=Lax and exact Origin checking are the CSRF foundation. Phase 4
should keep Origin as mandatory for unsafe requests, reject absent/mismatched
values, keep same-origin form support restricted to the expected content type,
and test unauthenticated-first ordering where disclosure matters. Do not add a
browser-readable CSRF token or weaken the exact origin policy merely to support a
future proxy.

### SEC-02: input, rendering, SQL, and upload hardening

The current validation is strong but must become a Phase 4 operational contract.

- Audit all write routes for `safeParse`/strict-schema use, request body caps,
  method-specific content types, duplicate field rejection, and generic error
  responses.
- Centralize reusable bounds (title/Markdown/summary/slug/alt/login sizes) where
  their present contract schemas already own them; reject unknown fields rather
  than stripping them silently.
- Retain server-side Markdown sanitization as the only rendered-HTML authority;
  add regression fixtures for script/event handler URLs, hostile raw HTML,
  dangerous protocols, and highlighter markup boundaries.
- Retain Drizzle/parameterized values; add hostile SQL-shaped inputs through
  routes and assert row integrity, not only response codes.
- Retain media limits: one file, 5 MiB, max field/parts counts, MIME/decode
  agreement, no animation, pixel/dimension bounds, UUID-only storage keys,
  atomic 0600 writes, and `nosniff` derivatives. Add quota/error-path tests for
  truncated body, duplicate file/fields, invalid decorative/alt combinations,
  malformed bytes, mismatched MIME, decompression-sized images, storage/db
  failure cleanup, and no file exposure outside `/media/<uuid>`.

No virus scanner, arbitrary file archive extraction, remote image fetching, or
public source-media endpoint should be introduced on this resource budget.

### SEC-03: secrets and configuration

Production configuration should be supplied from a root-owned, non-repository
environment file or deployment secret mechanism. The Phase 4 artifact should
provide only an `.env.production.example` style list of variable *names* and
safe placeholders, never values. It should define validation for:

- `DATABASE_URL`, `PUBLIC_ORIGIN`, `INTERNAL_API_ORIGIN`/trusted upstream
  configuration where applicable, `MEDIA_ROOT`, admin bootstrap credentials, and
  environment mode;
- HTTPS production origin only; no credentials embedded in URLs in generated
  documentation or logs;
- secure cookie behavior/`__Host-` cookie preconditions; production must reject
  a non-HTTPS public origin;
- required secret file owner/mode (for example root/service group readable only)
  in a future host-side preflight, tested locally against fixtures rather than a
  real server.

The existing secret scanner should broaden from filename/content fixtures into a
release artifact allowlist: images, build output, compose files, scripts, and
documentation must not contain actual secrets. Never test this by placing a real
secret in a tracked fixture.

## Operations, observability, and certificates

### Health and process recovery

Keep `/health` intentionally small: it proves the API process is serving, not
that every dependency is healthy. Add a protected/internal readiness check only
if it can be kept off public routing and has a concrete operational consumer;
otherwise Compose health plus a bounded database probe in an operator script is
sufficient. Do not expose detailed database, filesystem, version, memory, or
secret data through a public health response.

The operations script should return nonzero for unhealthy services and emit
human-readable, redacted summaries for:

- Compose/container service health and restart count;
- API/Web loopback/public-edge health status;
- host CPU load, available memory, filesystem capacity/inodes, and Docker volume
  usage;
- process/container resource use;
- log rotation configuration/effective size cap;
- certificate expiration and renewal timer/service state, after the main host is
  authorized for a separately gated production check.

Before unfreeze, certificate status can only be represented as a gated checklist
item and a fixture-tested command shape. It is not valid to claim current TLS
health from a local run. The infrastructure document records a historical
certificate observation, not a live Phase 4 verification result.

### Logs and resource policy

Use Docker's local JSON log driver or an equivalent with `max-size` and
`max-file` configured per long-running service. Preserve Fastify redaction and
avoid request-body logging. Backup/status logs should be concise, redact paths
that reveal secrets, never print database URLs, and have retention controlled by
the same bounded policy. A basic operator status script is preferable to a new
monitoring platform; optional external alert integration is a later decision.

## Backup, integrity, and isolated restore rehearsal

### Backup set

Phase 4 needs a daily, timestamped backup set containing all four recoverable
authorities:

1. **Database:** a consistent PostgreSQL logical dump (`pg_dump` custom or
   plain format) created by a non-superuser backup role with only required read
   access. It contains article source, lifecycle/taxonomy/About metadata,
   media database records, administrator hashes, and session rows. Treat it as
   sensitive and encrypt/permission it accordingly.
2. **Logical Markdown export:** request the existing protected v1 export through
   a local API path or use the repository's equivalent controlled operation only
   where authentication/secrets are not exposed. Preserve the exact manifest as
   a portability check, not a replacement for the database dump.
3. **Binary media:** copy the complete API-owned media root/volume, including
   both protected source originals and public derivatives. Copying derivatives
   alone is insufficient for future regeneration; copying source bytes alone is
   insufficient for a fast exact restore.
4. **Key configuration:** a sanitized configuration inventory plus separately
   permissioned secret-file backup/secret-manager reference. The inventory must
   include image digests/version, migration ledger/fingerprint, Compose/edge
   configuration checksum, media-root location, and restoration ordering, but
   must not include secret values.

Each set should include a manifest with format version, UTC timestamp, command
version, file names, byte counts, SHA-256 checksums, and a completeness marker
written only after all components complete. Generate into a new restrictive
staging directory; verify checksums; atomically rename to the final dated
directory. A failed/incomplete set must not replace a known-good set.

The eventual backup destination must be separate from the active database/media
volume and must be chosen before production release. A same-host disk copy alone
does not meet a meaningful disaster-recovery objective. Off-host encryption key
management, location, retention, and test restoration access require a user
decision before production. Daily cadence is the requirement floor, not a claim
that a specific RPO has been achieved.

### Restore rehearsal

The canonical test must restore into a generated, isolated local namespace,
database, media root, and Web port. It must never restore over `blogxlocal`, a
developer database, a production-like volume, or any cloud target.

The rehearsal should:

1. Create known content with published, draft, offline, and soft-deleted source;
   taxonomy/About; at least one validated media upload; and a stable public
   article.
2. Build a complete backup set and validate the manifest/checksums.
3. Start an independent generated Compose project with an empty database and
   generated media volume/root.
4. Restore database dump and media bytes, run the normal schema verification
   (not a destructive schema reset), and start API/Web against the restored data.
5. Compare original and restored authoritative maps: raw Markdown, retained
   lifecycle/nullability, taxonomy relations, About, media IDs/metadata, and
   source/derivative bytes/checksums. Confirm published pages and derivatives are
   readable only through the restored same-origin Web entry.
6. Confirm a tampered manifest, missing media object, bad checksum, wrong target
   namespace, or unfinished backup set fails before restore mutation. Verify
   bounded cleanup only removes the generated rehearsal namespace.

This does not add a production import endpoint. Restore remains an operator-only,
offline/isolated operation with explicit target validation.

## Release gate and frozen-main-host policy

Phase 4 must create a versioned release-readiness document and a local validator
that fail closed when evidence is missing. The validator is not a deployment
tool, must not contain an `ssh`/`scp`/`curl` target for either server, and must
not implicitly treat a Git push or local test pass as authorization.

The release checklist must require all of the following before any future main
host step becomes eligible:

1. A user message explicitly lifting the freeze for the named main host and
   specifying the intended production change window/scope.
2. A separately approved, read-only main-host and secondary-host baseline:
   OS support/update status, service/port/firewall inventory, disk/memory,
   current site/edge configuration, certificate/renewal state, and no overwrite
   of the compliance maintenance page until release is authorized.
3. A verified private network or authenticated encrypted tunnel between nodes;
   API and PostgreSQL access limited to that link/local host; browser traffic
   proven to use only the HTTPS blog domain.
4. A successfully scheduled complete backup plus a recent isolated restore
   rehearsal using the same artifact format, and a retained known-good backup.
5. A tested rollback procedure: immutable/referenced previous Web/API image or
   release artifact, previous edge config, database migration compatibility plan,
   media preservation, verification commands, owner, and stop criteria.
6. Secure production config/secrets, least exposure, restart/log/resource policy,
   health status, and certificate-renewal evidence verified on the actual hosts
   only after permission is granted.
7. A post-release smoke/rollback decision record that uses the HTTPS domain and
   avoids exposing internal addresses or credentials.

If any evidence is absent, stale, malformed, contains a secret, names an unsafe
target, or user unfreeze approval is absent, release status remains `BLOCKED`.
There is no automatic unfreeze condition.

## Local fail-closed verification strategy

Extend, rather than replace, `scripts/local-verify.mjs` and
`scripts/local-verify.test.mjs`. The existing runner already generates a narrow
Compose namespace, database, media volume/root, Web port, and administrator
credentials; verifies migration retry, cleans only exact generated targets,
redacts logs, rejects skips/zero tests, and audits the tracked repository.

Phase 4 additions should preserve these properties:

- Add explicit Phase 4 selection(s) and a `--phase4-full` canonical mode. A
  missing selection, skip, zero semantic tests, missing tool, invalid artifact,
  or unable-to-isolate fixture must be failure, never a pass.
- Use test-only generated backup/restore roots under the OS temporary directory,
  validated against a precise prefix and rejected if broad/root/workspace paths
  are supplied. Never use shell glob deletion for restore cleanup.
- Test rate limiting with injected clock/store seams, not real waiting, and prove
  independent API instances have no invented distributed guarantee. Production
  topology must account for this single-process scope.
- Use known-bad fixtures to prove release validator rejection for: no user
  unfreeze evidence; missing restore report; public Postgres/API port mappings;
  browser references to a server address; a credential-like secret; a missing
  checksum; a media mismatch; a stale/unsupported version; and a rollback plan
  without an immutable prior artifact.
- Run typecheck, build, boundary audit, operations fixtures, all prior API and
  Playwright regressions, Phase 4 security suites, backup/restore integration,
  and a visible same-origin restored-content journey before declaring the phase
  complete.
- Keep all verification local: Docker/Colima/loopback only. No cloud, CDN,
  registry fallback, third-party observability service, ACME call, certificate
  probe, or secondary-server contact belongs in the canonical acceptance path.

## Recommended three-plan decomposition

### 04-01 — Authentication, validation, secrets, and network-boundary hardening

**Requirements:** SEC-01, SEC-02, SEC-03, OPS-01 (local/configuration proof).

Deliver shared API security policy/configuration validation, login and route rate
limits, shared unsafe-route guard, hostile input/upload regressions, and stricter
repository/build secret/topology artifacts. Add a production-template contract
without values and Compose/edge topology fixtures that reject public API/Postgres
ports.

Likely files/symbols:

- `apps/api/src/app.ts` — registration/order and startup configuration gate.
- `apps/api/src/routes/auth.ts` — login limiter and generic failure behavior.
- `apps/api/src/routes/admin-posts.ts`, `taxonomy.ts`, `pages.ts`, `media.ts`,
  `admin-export.ts` — common authenticated mutation guard adoption.
- `apps/api/src/auth/sessions.ts` — retain cookie/session authority; expose no
  browser token path.
- new `apps/api/src/security/*` — parsed policy, limiter/store, mutation guard.
- `packages/contracts/src/*` and existing API tests — strict bound regressions.
- `compose.yaml`, `.env.example`, `scripts/check-boundaries.mjs`,
  `scripts/local-verify.test.mjs` — safe template/topology/secrets fixtures.

Acceptance focus: failed login threshold returns 429 without account disclosure;
valid login remains possible after its window; unsafe routes reject absent/wrong
Origin and unauthenticated calls before mutation; hostile text/files cannot
create rows/files/executable public content; production template fails with
unsafe origin or public data ports; no real secrets are tracked.

### 04-02 — Low-resource process operations, backup, and restore rehearsal

**Requirements:** OPS-02, OPS-03 plus the operational evidence portion of
SEC-03/OPS-01.

Deliver versioned local-first operations scripts/templates: bounded Compose
restart/log/resource policy, redacted status reporting, daily backup creation,
manifest/checksum validation, and isolated database/media/Markdown/config restore
rehearsal. The plan must use generated namespace and temporary backup paths and
must not talk to any server.

Likely files/symbols:

- `compose.yaml` — explicit health/restart/log/resource settings appropriate to
  local/production overrides without publishing data-plane ports.
- new `scripts/ops-status.mjs` or narrowly scoped shell wrapper — redacted local
  health/resource/log configuration status with clear nonzero failure behavior.
- new `scripts/backup-*`, `scripts/restore-*`, and tests — manifest, SHA-256,
  exact-root validation, dump/media/config orchestration.
- `scripts/local-verify.mjs`, `scripts/local-verify.test.mjs` — generated
  restore namespace and Phase 4 canonical selection.
- `docs/OPERATIONS.md` / `README.md` — commands, retention decision placeholders,
  backup/restore order and safety warnings.

Acceptance focus: an isolated set with DB dump + logical export + binary media +
configuration inventory verifies and restores byte/metadata-equivalent content;
every tamper/missing/unsafe target case fails; status exposes no secrets; restart
and log policy are structurally asserted; no RPO/RTO promise is made.

### 04-03 — Release-readiness and frozen-host deployment gate

**Requirements:** OPS-05, OPS-01, OPS-02, OPS-03 final integration.

Deliver a non-deploying release checklist, machine-checkable local evidence
schema/validator, rollback runbook, and final Phase 4 full verification. It must
make user unfreeze authorization, host baseline, network boundary, backup/restore,
rollback, TLS, and post-release checks explicit prerequisites. It must continue
to prohibit commands/contact targeting frozen infrastructure.

Likely files/symbols:

- new `docs/RELEASE-GATE.md` and `docs/ROLLBACK.md` — operational checklist and
  exact decisions/evidence slots, with no credential values.
- new `scripts/release-gate.mjs` and test fixtures — local-only evidence parser
  and fail-closed checks; no remote execution capability.
- `scripts/check-boundaries.mjs` — preserve/extend frozen host and public-address
  prohibitions across operational artifacts.
- `scripts/local-verify.mjs`, `scripts/local-verify.test.mjs` — `--phase4-full`
  wiring and final Phase 1--4 compatibility gate.
- `.planning`/README operational references as appropriate for GSD evidence.

Acceptance focus: valid synthetic evidence passes only when every prerequisite is
present; each missing/unsafe/stale secret-bearing evidence fixture fails; the
actual release state remains blocked without an explicit future user unfreeze;
the canonical local run proves no remote contact and preserves previous phases.

## Risks and threat controls

| Risk/threat | Required control |
|---|---|
| Credential leak through template, logs, artifact, or backup manifest | Name-only templates; strict file/secret scans; redacted logs; separate permissioned secrets; no credentials in reports. |
| Credential stuffing/brute-force | Bounded login limiter, generic failures, pruning, tests for threshold/window/recovery. |
| CSRF or an omitted guard on a future write route | Shared session + exact-Origin mutation guard; route enumeration/rejection tests. |
| Memory/resource exhaustion on 2C nodes | Bounded request/upload/decode/limiter/log rules; modest measured container limits; no heavy monitoring/search stack. |
| Public API or Postgres exposure | No data-plane host ports; configuration/Compose checks; future firewall/private-link preflight required for release. |
| Backup silently incomplete or unusable | Completeness marker, manifest checksums, isolated restore comparison, tamper tests, off-host target decision. |
| Restore overwrites active/developer/production data | Exact generated target validation, isolated namespace, no broad cleanup, no production import endpoint. |
| Broken release during filing freeze | Main-host hard freeze, no remote commands in artifacts, explicit user unfreeze gate, rollback evidence prerequisite. |
| TLS expiry/renewal unnoticed | Future authorized status check for certificate expiry and renewal; do not infer live certificate state locally. |
| Container restart loops/log disk exhaustion | Health/restart inspection, bounded log rotation, status script exits nonzero, resource/disk visibility. |

## Planning conclusions

Phase 4 can satisfy all seven remaining v1 requirements without connecting to a
cloud server and without expanding the architecture beyond Compose, PostgreSQL,
the existing API/Web boundary, local scripts, and controlled documentation.

The essential distinction is between **locally verified readiness artifacts** and
**production truth**. Local tests can prove the policy, isolation, backup format,
restore procedure, and fail-closed release gate. They cannot prove the live
server's firewall, certificate, private link, resource state, secret permissions,
or user authorization. Those are intentionally deferred to a future, explicitly
authorized post-freeze release operation.
