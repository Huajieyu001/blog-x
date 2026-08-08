# Phase 02 Planning Coverage

No external API integration: Phase 2 extends internal Next/Fastify/PostgreSQL and local media storage only.

| Source | Coverage |
|---|---|
| Roadmap criterion 1 | 02-01 taxonomy discovery, 02-02 archive/About, 02-03 ToC. |
| Roadmap criterion 2 | 02-05 shell/theme/responsive checks and 02-06 viewport backstop. |
| Roadmap criterion 3 | 02-01 taxonomy admin and 02-04 media upload/insert/same-origin delivery. |
| Roadmap criterion 4 | 02-05 discriminated fetch/404/error boundary and 02-06 launcher fixture proof. |
| READ-03 | 02-03, final regression in 02-06. |
| READ-04 | 02-01 category/tag and 02-02 archive, final regression in 02-06. |
| READ-05 | 02-02 About, final regression in 02-06. |
| READ-06 | 02-05, final browser/backstop in 02-06. |
| READ-07 | 02-05, launcher-only failure proof in 02-06. |
| TAXO-01 | 02-01, final DB constraint proof in 02-06. |
| MEDIA-01 | 02-04, final secrecy/boundary proof in 02-06. |

## Decision and UI coverage

| Inputs | Plans |
|---|---|
| D-01..D-04 | 02-01 (D-03 also 02-02) |
| D-05 | 02-02 |
| D-06..D-08 | 02-03 |
| D-09..D-12 | 02-04 |
| D-13..D-16 | 02-05 |
| All decisions/reversibility gates | 02-06 |
| UI empty/loading/error/zero-one-many/overflow/partial/focus/theme | 02-01, 02-02, 02-04, 02-05 |
| UI long-text/responsive/media visual backstops | 02-01, 02-04, 02-05, 02-06 |

## Spec-less edge resolution

| Requirement | Resolved categories and owning plan |
|---|---|
| READ-03 | adjacency/empty/encoding/ordering: 02-03 renderer and browser fixtures. |
| READ-04 | adjacency/empty/encoding/ordering: 02-01/02-02 published predicate, paginated deterministic lists and archive. |
| READ-05 | empty/encoding/idempotency/concurrency: 02-02 singleton version, public absence and write conflict cases. |
| READ-06 | empty/encoding/idempotency/concurrency: 02-05 theme/menu safe preference and repeated responsive navigation cases. |
| READ-07 | empty/encoding/idempotency/concurrency: 02-05 discriminated outcomes/retry boundary and repeated launcher failures. |
| TAXO-01 | adjacency/empty/encoding/ordering/idempotency/concurrency: 02-01 transaction, constraints, public/admin state tests. |
| MEDIA-01 | boundary/empty/encoding/precision/idempotency/concurrency: 02-04 bounded processor/storage exact-key cleanup and media DTO tests. |

## Research/security and scope audit

All research critical pitfalls are assigned: public predicate/strict DTOs (02-01/02-02), renderer-only heading/media policy (02-03/02-04), no catch-all fetch null (02-05), and final boundary/migration verification (02-06). Each plan has an ASVS-L1 STRIDE-informed threat model and blocks high severity risks. Kept prohibition values are scoped in `must_haves.prohibitions`; generic hygiene is enforced by the existing Phase 1 boundary/verifier controls rather than duplicated here.

The set explicitly excludes search, comments, RSS/Sitemap/SEO, CDN, media deletion/GC, deployment, cloud-server URLs, client Markdown parsing, external UI kits and public test endpoints. Schema activation occurs only in 02-01, 02-02 and 02-04 using canonical local migration/schema verification before their dependent behavior.
