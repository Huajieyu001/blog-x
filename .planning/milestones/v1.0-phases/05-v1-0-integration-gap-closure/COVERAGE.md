No external API integration: Phase 5 uses fixed local collection, a no-network mounted-directory provider, fault fixtures, and local evidence evaluators only.

# Phase 5 Source Coverage Audit

There is no Phase 5 `CONTEXT.md` or external API specification. The locked sources are the Roadmap Phase 5 entry and `.planning/v1.0-MILESTONE-AUDIT.md`; requirements are exactly OPS-01, OPS-03, and OPS-05.

Checker refinement: the concrete mounted-directory provider does not choose or implement a live remote service. It performs local filesystem operations only after an external mount has already been provisioned and identity-validated; mount provisioning, activation, and proof that it is truly off-host remain future OPS-05 evidence. This preserves the research prohibition on live remote transport while closing the executable adapter gap.

Scheduled-path refinement: the production pipeline does not depend on a pre-existing manual set. A separate collector uses fixed allowlisted local PostgreSQL dump, unchanged portable export, API-owned media, and sanitized config/image/migration inputs to create and verify an atomic complete set under production-source authority before calling the mounted adapter. Tests inject only those named operations into fresh generated isolated authority; policy cannot supply commands or arbitrary data roots.

## Requirement and audit mapping

| Source | Locked item | Owning plan(s) | Executable evidence required |
|---|---|---|---|
| Requirement | OPS-01 browser pages/API/media use only the blog HTTPS origin | 05-01; integrated by 05-03 | Exact `/media/<uuid>` parser/render/save/publish/migration policy, count-7 focused runner, deterministic retained identity, normal/restored browser request observation, boundary scan. |
| Requirement | OPS-03 daily complete backup plus recovery verification | 05-02; integrated by 05-03 | Fixed production collector creates database/export/media/config-image-migration set; authority-parameterized verification; mounted encryption/receipt/catalog/retention/result/alert; unchanged rehearsal/restore; full gate. |
| Requirement | OPS-05 deploy only after unfreeze, backup/rollback/secure-link evidence | 05-02 implementation contract; 05-03 decision/receipt owner | Concrete production-mounted result schema, strict v2 PRE_RELEASE_READY and predecessor-bound POST_RELEASE_VERIFIED, commit-bound full-gate receipt, canonical BLOCKED, no deployment capability. |
| Audit gap | G1 external published images contradict same-origin media | 05-01 | Shared media predicate, lossless legacy disposition, generated Drizzle migration, focused count-7/restore seed orchestration, browser request proof. |
| Audit gap | G2 production backup path is verifier-only/incomplete | 05-02 | Mutually exclusive verifier roots, concrete production collector, collect-then-mounted pipeline/service, and separate fake fault injection. |
| Audit gap | G3 READY requires post-release evidence | 05-03 | Pre-ready without post evidence; post result requires exact predecessor binding. |
| Integration | INT-01 Markdown publication -> formal browser media boundary | 05-01, 05-03 | API persistence/rendering plus normal/restored Web request evidence and final boundary audit. |
| Integration | INT-02 local complete backup -> production off-host recovery authority | 05-02, 05-03 | Rehearsal unchanged; production creates/verifies a fresh exact set, executes mounted encryption/receipt/retention/result, and emits scope-strict evidence. |
| Integration | INT-03 pre-release evidence -> post-release decision | 05-03 | Separate v2 schemas/evaluators and external human deployment boundary in runbooks. |
| Flow | FLOW-07 published Markdown image -> browser request | 05-01, 05-03 | `external-published-media` fail-first control and real normal/restored request capture. |
| Flow | FLOW-08 daily production backup -> encrypted off-host retention -> recovery evidence | 05-02, 05-03 | Known-bad control; concrete generated isolated collector -> mounted journey; authority/byte proof; fake faults; restore/result binding; live activation still release-blocking. |
| Flow | FLOW-09 authorization -> pre GO -> deployment -> post verification | 05-03 | `release-sequence-circular` fail-first control, PRE_RELEASE_READY, external action boundary, predecessor-bound post outcome. |

## Roadmap success-criterion mapping

| Criterion | Plan(s) | Coverage status |
|---:|---|---|
| 1. Published Markdown/covers cause only same-origin `/media` requests; external/mixed images migrated or rejected; external anchors retained. | 05-01; final rerun 05-03 | PLANNED |
| 2. Rehearsal and production adapter responsibilities are separate; production contract covers complete/encrypted/off-host/retention/alert and fails closed unconfigured. | 05-02; release binding 05-03 | PLANNED |
| 3. PRE_RELEASE_READY and POST_RELEASE_VERIFIED are separate and no state provides automatic deployment. | 05-03 | PLANNED |
| 4. Full Phase 1-5 acceptance and three known-bad controls pass while real production remains BLOCKED. | 05-03 | PLANNED; atomic receipt must bind committed implementation, exact suites/results, and terminal BLOCKED before audit. |

## Scope exclusions and residual live facts

- No source is unplanned. All three requirements, gaps, integrations, flows, and four Roadmap criteria map above.
- 05-02’s production-shaped generated pipeline proves actual database/export/media/config collection, atomic COMPLETE finalization, and encrypted mounted transfer/receipt/catalog/retention/result. Its fake proves faults only. Neither is live production/off-host evidence.
- Real mount/off-host identity and activation, destination/key/recipient/retention choice, systemd enablement/schedule result, live alert delivery, host/network/TLS baselines, deployment, and post-release smoke remain future explicitly authorized OPS-05 evidence. Their absence keeps the canonical state `BLOCKED` and does not justify an external API integration.
- 05-03’s passing audit is additionally gated by `ops/phase5-full-gate-receipt.json`: committed implementation first, exact full gate and terminal BLOCKED second, atomically verified receipt third, audit/verification evidence later in a separate documentation commit.
- Satisfied Phase 1-4 requirements are regression inputs only and are not reopened or claimed by Phase 5.
