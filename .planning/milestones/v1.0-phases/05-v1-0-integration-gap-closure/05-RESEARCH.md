---
phase: 05-v1-0-integration-gap-closure
research_date: 2026-08-09
status: complete
requirements: [OPS-01, OPS-03, OPS-05]
research_scope: repository-only
cloud_contact: none
production_state: BLOCKED
---

# Phase 5 Research: Integration Gap Closure

## Locked scope and safety boundary

This is the audit-defined gap-closure phase, not a redesign or a deployment phase. There is no Phase 5 `CONTEXT.md`; the Phase 5 roadmap entry and `.planning/v1.0-MILESTONE-AUDIT.md` are the locked scope.

- Do not contact, probe, deploy to, or change either cloud host. In particular, the primary host remains frozen. The secondary host is likewise out of implementation and test scope.
- The canonical tracked release state must remain locator-free `BLOCKED`. A local pass, a synthetic evidence bundle, a Git state, or elapsed time must never change it.
- No plan may add SSH/SCP/rsync/curl deployment behaviour, remote execution, automatic deployment, automatic unfreeze, or a public API/database route.
- Preserve the existing low-resource Web -> API -> PostgreSQL/media ownership split. Browser-visible application traffic is relative `/api` and `/media` through the Web edge; `INTERNAL_API_ORIGIN` remains server-only.
- Phase 5 owns only OPS-01, OPS-03, and OPS-05. It must rerun the broader regression and re-audit because all three are cross-phase integrations, but it does not reopen satisfied product requirements or add v2 scope.

## Why the Phase 4 result is insufficient

Phase 4 correctly implemented strong local mechanisms, but its phase-local evidence made three broader claims untenable:

| Audit gap | Current repository finding | Required closure |
|---|---|---|
| OPS-01 / G1 | `apps/api/src/content/markdown.ts` explicitly allows absolute `http:` and `https:` `img.src`; its sanitizer permits those `src` protocols. `apps/web/e2e/phase1-publishing.spec.ts` publishes and asserts `https://images.example.test/architecture.png`. `packages/contracts/src/admin-posts.ts` accepts an HTTP(S) `coverUrl`. | Published Markdown images and covers must resolve only to exact root-relative `/media/<uuid>`, while ordinary external anchor hyperlinks still work. Existing retained external values need an explicit migration/disposition. |
| OPS-03 / G2 | `scripts/backup/paths.mjs#validateBackupRoot` accepts only generated `/tmp/blog-x-backup-verify-*`; `policy.mjs` requires `blogxverify_*`; `create.mjs` validates reference-shaped fields but never encrypts, transfers off-host, applies retention, or records alert results. The systemd service therefore invokes a verifier-only path. | Keep rehearsal authority isolated, and add a separate production adapter with daily full set, encryption, off-host transfer, retention, and alert-result contracts that fail closed when production configuration is absent or unsafe. |
| OPS-05 / G3 | Release evidence has a single `READY` state. `scripts/release-gate/schema.mjs` makes `postRelease` a normal required section and `validate.mjs` reads it before returning `READY`; the post-release artifact requires smoke checks and a rollback decision. The runbook rightly says those facts occur after actual release. | Replace circular `READY` with ordered `PRE_RELEASE_READY` and `POST_RELEASE_VERIFIED`; a human-authorized deployment boundary sits between them and remains outside repository capability. |

The Milestone Audit is the source of truth for these findings. It also requires three known-bad fixtures and a complete Phase 1--5 local acceptance before the milestone may pass.

## Current-code map

### Published-media data path

```text
Article editor -> adminPostInputSchema -> articles.markdown / articles.cover_url
                                      -> articles.cover_media_id (newer local cover path)
Published detail -> publicRepository -> renderMarkdown(markdown) -> renderedHtml -> ArticleBody
                                         \-> coverMedia -> /media/<uuid> -> article page <img>
```

Important facts:

- Uploaded media is already correct: `createMediaService()` assigns a UUID and returns `/media/<uuid>`; `MediaPanel` inserts that path and stores a `coverMedia` reference. `GET /media/:id` only serves an API-owned derivative and rejects malformed IDs.
- `coverUrl` is legacy data, not an active public cover projection. The public repository selects only `coverMediaId` and the public article page renders only `article.cover`. Nevertheless it remains editable, persisted, exportable, and publish-valid through `adminPostInputSchema`, `article-service.ts`, `admin-repository.ts`, the database `cover_url` column, and portable export. It must be normalized or rejected to avoid reintroducing noncompliant retained state.
- Markdown rendering is the actual public image authority. `allowedImageSource()` permits exact `/media/<uuid>` plus any absolute HTTP(S) URL. `constrainImageSources()` removes only nonmatching sources. The sanitizer additionally lists `src: ["http", "https"]`.
- Link behaviour is intentionally separate: `href` is sanitized as HTTP(S), and the Phase 1 browser contract checks an external documentation link. This behaviour must remain; do not use one protocol rule for both `href` and `img.src`.
- Neither a CSP `img-src` policy nor a browser assertion over every published `img` request currently closes an unexpected source that somehow reaches rendered HTML.

### Backup and rehearsal data path

```text
generated verifier policy -> createBackupSet -> exact staging set -> manifest + COMPLETE -> generated restore only
  database.dump + portable-export-v1.json + source/derivative media + config inventory

generated production-verification authority (`blogxprodverify_<token>`)
  -> concrete production collector -> exact production source root -> manifest + COMPLETE
  -> concrete encryption/mounted-directory pipeline core -> generated mounted destination
  -> receipt + retention result + alert-result evidence
```

The local design is worth preserving. `create.mjs` uses restrictive permissions, unique staging, member hashes, last-written manifest-bound `COMPLETE`, verification, and atomic rename. `manifest.mjs` rejects extra/missing/link/tampered members. `restore.mjs` performs a read-only preflight and permits only a generated `blogxrestore_*` namespace, corresponding database/media volume, loopback Web origin, and empty generated temporary root. The restore tests prove no mutation before preflight and exact cleanup.

Those constraints deliberately make the rehearsal path incapable of running a production backup. That isolation must remain unchanged, but it does not mean the production pipeline is exempt from real local execution. Phase 5's canonical `--phase5-full` gate should run the concrete production collector and mounted-directory pipeline core against a separate exact generated `blogxprodverify_<token>` authority, exact generated source root, exact generated mounted destination, generated key-authority fixture, and exact result/alert fixture authorities. The production and rehearsal validators must cross-reject one another: no `blogxverify_*`, `blogxrestore_*`, or rehearsal temporary root is valid production authority, and no `blogxprodverify_*` project/root is valid rehearsal or restore authority. Real external mounts, activation, credentials, and servers remain absent.

### Release evidence data path

```text
canonical ops/release-evidence.blocked.json -> local decision CLI -> BLOCKED
generated temporary synthetic bundle -> strict hash/type validator -> current READY (circular)
```

The useful existing properties to retain are strict JSON shapes, regular-file/no-link bundle reading, SHA-256 binding, time validity, secret/address scanning, and `INVALID` versus `BLOCKED` exits. `check-boundaries.mjs` already rejects remote capability, automatic actions, server authority, tracked READY, and invented production claims in release artifacts. Phase 5 should extend those checks rather than create a parallel gate.

## Recommended architecture

### 1. Same-origin image authority and explicit legacy disposition

Use distinct authority functions, with no URL generalization:

```text
isMediaPath(value) := /^\/media\/[uuid]$/ and no query, fragment, encoded variant, or host
isOrdinaryExternalLink(value) := sanitized http/https href (unchanged)
```

`renderMarkdown()` should allow an `img.src` only if `isMediaPath`; remove `src` rather than rewriting an unknown source. Its sanitizer should allow the root-relative media form needed by the renderer but not restore HTTP(S) image protocols. Preserve `href: ["http", "https"]`; relative fragment heading links produced by the renderer must remain valid. A CSP is defense in depth, not the primary migration: add a public response/header policy whose `img-src` is `'self'` (and whose other directives do not break Next's required runtime), then test that it cannot weaken the renderer rule. Do not attempt to enforce this only in CSS, the browser component, or CSP.

For persisted articles, add an API-owned validation/classification module shared by save/update/publish and a one-time migration command. It must parse Markdown image nodes (not regex raw Markdown) and classify every image source and legacy `coverUrl` as:

1. `valid_media`: exact `/media/<uuid>`; retain.
2. `empty`: valid for optional legacy cover URL; retain as empty.
3. `legacy_external_or_malformed`: any HTTP(S), protocol-relative, data/file/blob/javascript, relative non-media, query/fragment/path traversal, or decoding trick; not publishable until removed/replaced.

Recommended backward-compatible strategy: add a nullable, machine-readable legacy-block/review marker on articles (or a dedicated migration ledger table keyed by article UUID) rather than silently deleting raw Markdown or overwriting the historic `coverUrl`. The migration should be idempotent and transactional: scan retained, non-deleted articles; mark offending rows; clear only a legacy external `coverUrl` when a `coverMediaId` is already authoritative; otherwise preserve source text for administrator repair. Published articles with a marker must be blocked from future publish/update-to-published transition and must not emit external images even before repair. Existing published content remains readable with disallowed image `src` removed and a visible, non-networking placeholder/notice only if product design accepts it; the safer minimal implementation is to omit the image and surface a clear admin validation/review message. No remote image download/fetch is allowed in this phase, so migration means replace by uploading a local image or remove the reference, never import a URL automatically.

The migration should not rewrite ordinary Markdown hyperlinks, change `href`, mutate URLs inside code fences, or alter raw source beyond a deliberately approved repair action. Export remains lossless: retain a backward-compatible raw `coverUrl` field only until its planned format-version change is separately justified; the marker must be included in backup/recovery equality if stored. A more compact alternative is to enforce only at publication and annotate existing published records, but it must still prevent an existing retained published external URL from returning on subsequent edits.

### 2. Separate fail-closed production backup adapter

Create a separate production-facing directory/module, for example `scripts/backup/production/`, with a separately versioned policy, source-authority validator, collector, and immutable pipeline interface. It must generate its own complete production-format set from its own strict source authority; it must not consume a set whose authority was granted by the rehearsal-only `verifyBackupSet()` wrapper. Extract only the non-mutating member/content verification core so it is authority-parameterized: the existing rehearsal wrapper continues to validate only rehearsal final/staging roots, while a production wrapper validates only an exact production source/final root before calling the same read-only format/content verifier. Cleanup and collection authority remain separate and mode-specific.

```text
production policy (untracked, root/service-owned)
  -> validate exact production authority
  -> production collector reads exact database/API/media/config authority
       -> PostgreSQL custom-format database dump
       -> strict portable Markdown export
       -> all source and derivative media bytes
       -> sanitized config, image-digest and migration inventory
       -> exact restrictive staging root
       -> deterministic manifest + final manifest-bound COMPLETE
       -> verify through production-authorized read-only content verifier
       -> atomic rename to exact complete source set
  -> encrypt completed immutable payload locally
  -> copy encrypted object + hash metadata through concrete mounted-directory core
  -> verify remote receipt against local digest
  -> apply retention only to matching, verified, encrypted objects
  -> write redacted result record
  -> attempt alert delivery/record alert result
  -> nonzero on any missing/failed step; preserve prior known-good sets
```

Two safe adapters are needed rather than one configuration switch:

- **Local rehearsal adapter (existing):** accepts only generated roots/projects/namespaces and never off-host transfers. Keep its current paths, tests, and cleanup unchanged.
- **Production adapter (new):** accepts only a strict production authority in live mode and an exact generated `blogxprodverify_<token>` (or the plan's canonical equivalent) authority in local verification mode. It refuses every rehearsal authority (`blogxverify_*`, `blogxrestore_*`, rehearsal temporary roots), symlink/broad source or mounted destination, incomplete set, unknown mount profile, plaintext transfer, missing key authority, missing retention policy, or missing result/alert authority. `--phase5-full` must select this concrete adapter in generated verification mode and execute its real collector, encryption, mounted-directory copy, receipt, retention, result, and alert-recording core end to end.

The production policy should be name/reference-only in Git, with actual live values in a root/service-owned untracked file. Its schema needs at least: format/version, daily schedule identity, strict source project/database/media/config authority, exact backup source/staging root owned by the service, mounted destination profile/root, recipient/key authority ID, encryption algorithm/key reference, retention rule/version, result root, alert-result authority, service identity, and an explicit mode. Verification mode must derive every concrete authority from one generated `blogxprodverify` token and reject caller-supplied substitutions; live mode must fail closed until separately configured. Do not store destination URLs, credentials, key material, recipient addresses, or host addresses in tracked files or logs. Policy validation must reject unknown fields and ambiguous paths.

Encryption should be streaming authenticated encryption with fresh per-set data encryption material and authenticated metadata bound to: backup format/version, set ID, manifest SHA-256, creation timestamp, retention-policy ID, and destination profile ID. The key-encryption/key-access implementation and remote transport are deliberately configuration decisions, but the adapter contract must require an authenticated encrypted ciphertext plus a non-secret receipt whose digest equals the locally generated ciphertext digest. It must never claim encryption merely because an `external:*` string exists.

The production pipeline core should operate on an already mounted directory selected by a closed, untracked profile and verified before writes; do not place a generic shell command, mount command, or arbitrary URL in policy. `--phase5-full` supplies an exact generated directory that represents the mounted destination and runs the same fixed filesystem operations used after a real mount. Dependency injection is appropriate only around fixed-operation execution and mount/source inspection so tests can prove ordering, no mutation-before-preflight, and exact targets. A fake transport is reserved for fault injection (short write, receipt mismatch, unavailable mount, listing/retention failure); it must not be the canonical successful path. The actual external mount mechanism, its credentials, its activation, and its server evidence are future authorized operations, not local implementation evidence.

Retention is a post-receipt operation: list only objects under the adapter's exact backup prefix, parse names as expected set IDs, verify the retained receipt/catalog integrity, and delete only objects older than the selected policy while preserving a minimum known-good complete set. If retention listing/verification fails, do not delete. Alert records should be append-only, redacted structured results with set ID, step outcomes, local/remote digests, policy IDs, timestamps, and notification delivery outcome; no secret or destination authority. A failed alert must make the job fail (or at least produce a nonzero `ALERT_UNCONFIRMED` outcome) so silent backup success cannot satisfy OPS-03.

The production systemd unit may be replaced with a production-only, disabled-by-default template that invokes the production adapter only with an untracked validated policy. It should retain `UMask=0077`, non-root least-privileged service identity, hardening, daily `Persistent=true` timer, and bounded logs. It must not point at the local verifier policy or call a remote deployment tool. Installing/enabling it on a server is explicitly out of Phase 5.

### 3. Non-circular release state machine

Replace the overloaded state with a version-2 evidence document and explicit state transitions:

```text
BLOCKED
  | all pre-release evidence current and pass (offline validation only)
  v
PRE_RELEASE_READY
  | explicitly authorized human deployment outside this repository
  v
DEPLOYMENT_OCCURRED (external fact, no CLI transition)
  | domain smoke + continuation/rollback decision recorded
  v
POST_RELEASE_VERIFIED
```

`BLOCKED` is the only tracked canonical state. The first transition validates only: explicit scoped unfreeze/authorization, both host read-only baselines, same-origin/private-link boundary, verified current production backup including off-host/encryption/retention/alert result, operations/TLS, and rollback readiness. It must not require any post-release artifact. This returns `PRE_RELEASE_READY`; it is a permission-to-consider-deployment decision, not an instruction, action, or capability to deploy.

`POST_RELEASE_VERIFIED` is evaluated only from a separate temporary post-release evidence bundle that additionally binds the validated pre-release bundle hash/decision ID, observed deployment/release artifact digest, actual HTTPS-domain smoke result, and explicit continue/rollback decision. It cannot create `PRE_RELEASE_READY` and must return `BLOCKED` if its prerequisite pre-release decision is missing, stale, invalid, or mismatched. A failed smoke/rollback decision should be a valid `POST_RELEASE_FAILED`/`BLOCKED` outcome, never an `INVALID` cover-up; malformed/tampered evidence remains `INVALID`.

Preserve the current no-network, local regular-file, hash, time, secret/address, no-extra-file, and canonical `--expect-blocked` rules. The CLI should expose validation only (for example `--expect-blocked`, `--expect-pre-release-ready`, and `--expect-post-release-verified`) and must contain no deploy/transition subcommand. `check-boundaries.mjs` must reject a tracked `PRE_RELEASE_READY` or `POST_RELEASE_VERIFIED` just as it rejects tracked `READY`, and reject prose that presents those synthetic states as live production fact.

## File-level change map

| Area | Create/change | Purpose |
|---|---|---|
| Image authority | `apps/api/src/content/media-reference-policy.ts` (new), `content/markdown.ts`, `content/article-service.ts`, `content/admin-repository.ts`, `db/schema.ts`, new Drizzle migration | One exact media-path classifier; render restriction; save/publish rejection; idempotent legacy-review state. |
| Contracts/UI | `packages/contracts/src/admin-posts.ts`, `distribution.ts`, `index.ts`; `apps/web/app/admin/_components/ArticleEditor.tsx` and possibly `MediaPanel.tsx` | Remove external cover entry acceptance, return actionable legacy validation/review state, preserve uploaded-media workflow and export/restore contract compatibility. |
| Public hardening/tests | `apps/api/test/markdown-renderer.test.ts`, article lifecycle/public visibility tests, `apps/web/e2e/phase1-publishing.spec.ts`, new Phase 5 browser spec or extend restore spec, Web header configuration | External images no longer render/request; ordinary external anchors do; all public image requests and cover images are exact same-origin `/media/<uuid>`. |
| Backup production boundary | `scripts/backup/production/{policy,paths,collect,adapter,encryption,retention,results}.mjs` (new), production collector/pipeline tests and fixtures, production unit/timer template, `ops/backup-policy.names.json`, `docs/OPERATIONS.md` | Strict production source authority; full four-authority collector; atomic complete set; concrete encryption/mounted-directory/receipt/retention/result/alert core; disabled live activation. |
| Shared read-only verification / preserved rehearsal | `scripts/backup/{manifest,verify}.mjs` only as needed for an authority-parameterized read-only verification core; existing `paths,create,restore` modules and all rehearsal wrappers/tests; `local-verify.mjs` | Reuse format/content checks without sharing target authority. Keep rehearsal root/project/restore validators and cleanup unchanged, add production wrappers, and prove bidirectional cross-rejection. |
| Release split | `scripts/release-gate/{schema,validate,bundle}.mjs`, CLI/tests, `ops/release-evidence.blocked.json`, `docs/{RELEASE-GATE,ROLLBACK,OPERATIONS}.md`, boundary/local-verifier tests | Evidence v2 and separate pre/post decisions, canonical BLOCKED control, no circular required evidence. |
| Integrated acceptance | `scripts/local-verify.mjs`, `scripts/local-verify.test.mjs`, `scripts/check-boundaries.mjs`, three known-bad fixture descriptors, milestone audit update only after passing | Phase 1--5 selector executing the concrete production collector and mounted-directory core in exact `blogxprodverify` isolation, plus fault seams, no skip/zero/outbound capability, and re-audit. |

## Test and validation architecture

Work test-first in three ordered plans. Each plan must retain strict TAP/Playwright semantics: missing required inputs, skipped/TODO/zero tests, unselected required suite, malformed fixture, unsafe cleanup, or unexpected outbound/remote capability fails the gate.

### Plan 05-01: same-origin published media and legacy data

1. Start with API unit tests for `isMediaPath` and renderer output: exact UUID `/media` allowed; external `http`/`https`, protocol-relative, data, blob, file, javascript, relative image, encoded traversal, query, fragment, host-qualified same-site URL, malformed UUID, and image-reference syntax inside code must be handled correctly. Verify external `<a href>` HTTP(S) links and generated `#heading` anchors survive.
2. Add contract/service tests that external `coverUrl` and marked legacy Markdown cannot be created/published; an uploaded `coverMedia` succeeds. Test historic rows through the migration twice (idempotence), unchanged raw Markdown, preserved review marker, publication blocking, soft-deleted treatment, and no accidental destruction of raw source/export data.
3. Extend an actual browser journey that publishes a valid uploaded cover/body image, observes every `img` request, asserts exact Web origin and `/media/<uuid>` pathname, and proves an external hyperlink remains clickable/has its original `href` without a browser request being made to it. Its known-bad fixture must fail if an external Markdown image or HTTP cover produces a request.
4. Run restored-data browser coverage too: a legacy marker/external reference inside restored source must never cause an external request after restore.

### Plan 05-02: production backup adapter contract

1. Unit-test production policy parsing and exact authority validation. Known-bad cases: rehearsal namespace/root, production source/destination authority mismatch, missing database/media/config/destination/key/retention/result/alert values, unknown mount profile, broad/symlink root, plaintext setting, unsafe command/URL field, zero/minimum retention, weak/missing receipt binding, and caller substitution of one generated authority. Add bidirectional tests proving rehearsal validators reject `blogxprodverify_*` and production validators reject `blogxverify_*`/`blogxrestore_*`.
2. Run the concrete production collector under exact generated `blogxprodverify_<token>` authority. It must collect a nonempty custom-format database dump, strict portable export, every source/derivative media object, and sanitized config/image/migration inventory; generate a deterministic manifest and last-written manifest-bound `COMPLETE`; verify exact members/hashes through the production-authorized read-only verifier; and atomically rename without ever passing a rehearsal path validator.
3. Run the concrete successful mounted-directory pipeline end to end: complete source set -> authenticated ciphertext -> exact generated mounted destination -> verified receipt -> retention catalog/action -> redacted result -> alert-result record. Verify ciphertext differs from source, plaintext members never appear in the mounted destination, receipt binds ciphertext and source manifest hashes, retention leaves the minimum known-good object, and source/destination/key/result/alert paths all derive from the generated authority.
4. Use injected fixed-operation/mount inspection seams and fake transport only for fault injection across collection, manifest finalization, encryption, mount inspection/copy, receipt mismatch, catalog/list, retention, result write, and alert delivery. Each failure must be nonzero/fail-closed, preserve a prior known-good set, avoid unsafe deletion, and leave only validated incomplete/diagnostic material with restrictive permissions. A failed alert is specifically a failed job/result, not success-with-warning.
5. Test the production service/timer template structurally: daily/persistent, restrictive user/umask/hardening, untracked live policy precondition, and no rehearsal policy/root. Do not execute/enable systemd, mount an external destination, or run any network transport.

### Plan 05-03: release split and full proof

1. Write RED tests demonstrating the current circular fixture no longer has a valid path: pre-release can pass without `postRelease`; post-release without a bound pre-release decision blocks; tampered/stale/mismatched predecessor invalidates the post result; a failed smoke records a non-success post outcome.
2. Implement strict v2 evidence schemas and decision validator. Require the new production backup result evidence in pre-release validation, including its independent restore linkage, encryption/receipt/retention/alert results, not just declaration references.
3. Update runbooks so their ordered sections reflect the state machine. State clearly that deployment is an externally authorized human action between decisions and no tool here performs it.
4. Register a `--phase5-full` canonical local gate: all Phase 1--4 regression, Phase 5 media/browser tests, the concrete production collector plus encryption/mounted-directory/receipt/retention/result/alert pipeline under exact generated `blogxprodverify` isolation, fault-injection seam tests, release/boundary fixtures, migration/restore compatibility checks, and final canonical `BLOCKED` decision. It must end with production `BLOCKED`, not a synthetic PRE_RELEASE state; successful generated pipeline evidence is local structural/behavioural evidence, not proof of a real external mount, daily activation, or server backup.
5. Re-run/refresh the milestone audit only after the gate passes. It must report every old failure closed with direct evidence and retain the no-server-contact statement.

## Required known-bad fixtures

The roadmap requires three explicitly named failure controls; use data-only descriptors where possible and ensure each is exercised by the canonical Phase 5 gate.

1. **`external-published-media`**: published Markdown plus legacy cover fixture containing external/mixed-content URL. It must fail a deliberately regressed renderer/public request policy and pass only when it is rendered without external image request and publication/migration disposition is enforced. Include a control that an external anchor remains legal.
2. **`production-backup-incomplete-or-unsafe`**: a production policy/adapter fixture with one required capability absent or an encrypted transfer/receipt/alert failure. It must exit nonzero before retention deletion and cannot be satisfied by the generated rehearsal adapter or reference-shaped strings alone.
3. **`release-sequence-circular`**: evidence that has every pre-release requirement but no post-release smoke; it must yield `PRE_RELEASE_READY`, not BLOCKED. A post-release bundle with no valid predecessor must block/invalid as appropriate. This catches reintroduction of the old mandatory `postRelease` precondition.

## Threat model and failure modes

| Threat / failure | Impact | Required mitigation/evidence |
|---|---|---|
| External image in Markdown/cover | Third-party tracking, mixed content, topology violation | AST-level exact `/media/<uuid>` allowlist, protocol split from anchors, CSP defense, server/browser tests. |
| Legacy source silently rewritten/deleted | Loss of long-lived Markdown asset | Idempotent marker/review migration; preserve raw source; explicit admin repair only; export/restore equality. |
| Regex-only Markdown migration | False positives in code/links or evasion | Parse image nodes for classification; test code fences, escaped text, references, URL encoding. |
| Production adapter reuses rehearsal authority | Local tests gain persistent/destructive authority or blur evidence | Separate modules/types/roots/policies; exact generated `blogxprodverify` mode; unchanged rehearsal validators; bidirectional cross-rejection and exact cleanup. |
| Plaintext or incomplete off-host backup | Data disclosure or false recovery authority | Verify complete set first; authenticated encryption, restrictive staging, receipt digest binding, no completion/retention without each step. |
| Bad retention deletion | Removes last recovery point | Exact prefix/ID parsing, catalog verification, minimum known-good count, deletion only after verified receipt; fault tests. |
| Alert fails silently | Operator believes daily backup succeeded | Structured alert-result evidence; failure makes production job nonzero and pre-release evidence unavailable. |
| Secret/destination leakage | Credential/internal topology exposure | Name/reference-only tracked artifacts; redacted structured output; scanner tests; no URLs/credentials in fixture/docs. |
| Post-release evidence grants pre-release GO | Circular authorization or false readiness | Separate one-way states; post result requires pre decision digest; no state transition/deploy command. |
| Synthetic evidence becomes production fact | Freeze/authorization bypass | Canonical locator-free BLOCKED only; temp bundle roots; tracked non-BLOCKED and remote capability boundary failures. |
| Cleanup/path traversal/symlink | Local or future production data loss | Exact allowlisted roots, no shell interpolation, lstat/no-link checks, nonempty target rejection, parallel/interruption tests. |

## Non-goals

- No cloud/server access, deployment, release, unfreeze, certificate/ACME check, remote backup target provisioning, systemd installation/enabling, or live alert delivery.
- No automatic remote-image import, URL fetcher, CDN, object-store SDK chosen from a generic URL, external image proxy, or arbitrary host command hook.
- No browser direct API/PostgreSQL exposure, new public diagnostics, media source download route, production restore/import API, or weakened isolated restore target validation.
- No assertion of a chosen RPO/RTO, destination, key provider, retention period, recipient, private-link implementation, TLS status, or live backup success until separately authorized real evidence exists.
- No automatic deployment/rollback capability; release documents remain evidence and decision workflows only.
- No v2 features, multi-author access, search, monitoring platform, microservice/queue/Kubernetes expansion, or broad refactor unrelated to the three audit gaps.

## Dependencies and sequencing

`05-01` is first because public content must be safe before it is considered backup/release-ready. `05-02` depends on the existing complete-set format and isolated restore proof, but owns a separate strict production source authority and concrete collector. Its only shared implementation should be an authority-parameterized read-only content verifier; rehearsal collection, path validation, restoration, and cleanup stay unchanged. It may proceed after 05-01 but should finish before release schema changes because the pre-release gate must consume its result contract. `05-03` depends on both: it binds the safe browser media rule and executable production-pipeline evidence into a non-circular release decision, then owns the full regression and re-audit.

No plan has a server dependency. The normal local success path uses the concrete production collector and mounted-directory pipeline core against exact generated `blogxprodverify` source, destination, key, result, and alert authorities; injected seams test fixed-operation/mount inspection ordering, and fake transport is used only for failure injection. Real installation, external mount and credentials, service activation, off-host/server execution evidence, retention selection, alert recipient, host baselines, private link, TLS, rollback artifact selection, deployment, and post-release smoke remain future authorized evidence collection. Their absence keeps the canonical production decision `BLOCKED`.

## Planning recommendation

Plan Phase 5 as exactly three sequential TDD plans: (1) make `/media/<uuid>` the sole published-image authority and explicitly quarantine legacy external data while retaining ordinary links; (2) add a separate fail-closed production collector and mounted-directory adapter, execute their concrete four-authority collection/encryption/receipt/retention/result/alert core under exact generated `blogxprodverify` isolation, and preserve unchanged cross-rejected rehearsal authority; (3) version and split release decisions into `PRE_RELEASE_READY` and `POST_RELEASE_VERIFIED`, then run the complete offline Phase 1--5 gate and milestone audit. Keep the checked-in production state `BLOCKED` throughout and prohibit all remote/server contact.
