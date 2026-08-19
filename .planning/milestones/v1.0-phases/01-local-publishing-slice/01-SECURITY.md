---
phase: 01
slug: local-publishing-slice
status: verified
threats_open: 0
asvs_level: 1
block_on: high
register_authored_at_plan_time: true
created: 2026-08-08
verified: 2026-08-08
---

# Phase 1 — Security

> Per-phase security contract for the local publishing slice. All plan-authored STRIDE threats have a verified mitigation or an explicit accepted-risk record.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|---|---|---|
| Package registry → workspace | Locked dependencies enter the trusted build. | Executable packages and lockfile integrity |
| Browser → relative `/api` → Fastify | Browser credentials and content mutations cross into the API authority. | Password, HttpOnly cookie, article input |
| Next server → Fastify | SSR presentation requests session/public data without becoming an authorization authority. | Cookie header and allowlisted DTOs |
| Fastify → PostgreSQL | Validated application state becomes durable data. | Administrator, session, article, migration records |
| Shared contracts → Web/API | Public wire fields are shared across deployment packages. | Strict request/response schemas |
| Markdown → rendered HTML | Untrusted author content becomes browser-visible markup. | Markdown, highlighted code, sanitized HTML |
| Lifecycle UI → API/state machine | Destructive or visibility-changing intent crosses into transactional actions. | Article identity, version, explicit action |
| Page query/slug → public repository | Untrusted public selectors reach publication-only queries. | Page number, slug, public DTO |
| Verification runner → Compose/database | Automation creates and removes disposable infrastructure. | Namespace, schema, generated credentials |
| Repository commands → infrastructure policy | Local development commands must not cross the production freeze. | Operational targets and deployment intent |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation / Evidence | Status |
|---|---|---|---|---|---|---|
| T-01-SC | Tampering | dependency install | high | mitigate | Exact lockfile, approved dependency set, frozen workspace installs, and package-legitimacy review. | closed |
| T-01-01 | Spoofing | session | high | mitigate | Argon2id administrator hash; CSPRNG opaque tokens stored as digests with expiry and revocation; auth integration and Chromium lifecycle passed. | closed |
| T-01-02 | Elevation of privilege | publish route | high | mitigate | Fastify session guard runs before protected reads/mutations; unauthorized and revoked-session tests passed. | closed |
| T-01-03 | Tampering | migration | high | mitigate | Reviewed generated SQL, PostgreSQL advisory lock, singleton fingerprint ledger, schema inspection, and kill/retry proof passed. | closed |
| T-01-04 | Tampering | Markdown | high | mitigate | Raw HTML is not trusted; bounded GFM/Shiki transforms end in sanitization; hostile fixtures passed. | closed |
| T-01-05 | Information disclosure | secrets/logs | high | mitigate | Environment-only generated secrets, response allowlists, output redaction, and service-log secret assertions passed. | closed |
| T-01-06 | Tampering | cookie write | medium | mitigate | SameSite cookie plus exact trusted-Origin validation protects unsafe browser requests. | closed |
| T-02-01 | Information disclosure | shared DTOs | high | mitigate | Strict allowlisted schemas exclude password, session digest/token, database, raw Markdown, and admin-only fields; contract tests passed. | closed |
| T-02-02 | Tampering | package boundary | medium | mitigate | Independent Web/API/contracts builds and structural dependency checks preserve deployment ownership. | closed |
| T-02-SC | Tampering | dependencies | high | mitigate | Plan introduced no unapproved dependency and retained the single frozen lockfile. | closed |
| T-03-01 | Spoofing | sessions | high | mitigate | Session issuance, digest lookup, expiry, revocation, rotation, logout, and replay denial are integration/browser tested. | closed |
| T-03-02 | Information disclosure | auth logs/DTO | high | mitigate | Generic login failure, strict session DTO, no JavaScript token storage, and password/cookie/token log assertions. | closed |
| T-03-03 | Elevation of privilege | protected routes | high | mitigate | Fastify remains authoritative; Next redirect is presentation only; direct protected API denial passed. | closed |
| T-03-04 | Tampering | unsafe cookie request | medium | mitigate | SameSite and exact Origin checks cover cookie-authenticated unsafe methods. | closed |
| T-04-01 | Elevation of privilege | draft/preview routes | high | mitigate | Shared Fastify guard precedes draft lookup, mutation, and preview rendering. | closed |
| T-04-02 | Tampering | metadata/slug | high | mitigate | Strict Zod schemas, parameterized Drizzle queries, database constraints, retained-slug uniqueness, and conflict tests. | closed |
| T-04-03 | Information disclosure | drafts | high | mitigate | Admin repository is protected; public repository uses a separate fixed predicate and DTO; hidden-state tests passed. | closed |
| T-04-04 | Tampering | preview HTML | high | mitigate | Preview and public detail share the same final-sanitized API renderer; parity and hostile-input tests passed. | closed |
| T-05-01 | Tampering | lifecycle DTO | high | mitigate | Action-specific endpoints exclude client-controlled status/deletion fields; complete state/action matrix passed. | closed |
| T-05-02 | Tampering | slug race | medium | mitigate | Transactional row lock, retained-row unique index, monotonic version, and bound slug-confirmation proof. | closed |
| T-05-03 | Elevation of privilege | mutations | high | mitigate | Every lifecycle action is protected by Fastify authorization and Origin validation. | closed |
| T-05-04 | Repudiation | costly slug change | low | accept | Immediate explicit confirmation binds article identity, current slug, and version; durable audit history is deliberately deferred. | closed |
| T-06-01 | Information disclosure | public repository | high | mitigate | One publication-only predicate, allowlisted public DTO, and all-state list/detail tests prevent private-state disclosure. | closed |
| T-06-02 | Denial of service | page input | medium | mitigate | Fixed page size, bounded positive-integer validation, indexed deterministic ordering, and invalid-page rejection. | closed |
| T-06-03 | Tampering | count/items consistency | medium | mitigate | Identical predicates execute in one repeatable-read transaction; deterministic pagination tests passed. | closed |
| T-07-01 | Tampering | Markdown pipeline | high | mitigate | Final sanitizer removes scripts, styles, event attributes, hostile protocols, and transform-generated unsafe output; renderer tests passed. | closed |
| T-07-02 | Information disclosure | public detail | high | mitigate | Fixed visibility predicate, minimal DTO, and indistinguishable draft/unpublished/deleted/unknown 404 behavior. | closed |
| T-07-03 | Denial of service | highlighting | medium | mitigate | One reused highlighter and bounded supported-language set limit per-request resource growth. | closed |
| T-08-01 | Tampering | concurrent/interrupted migration | high | mitigate | Advisory-lock serialization, ledger/schema inspection, forced interruption, original-volume retry, and concurrent convergence passed. | closed |
| T-08-02 | Tampering | parallel cleanup | high | mitigate | Random regex-validated namespaces, exact resource names, two parallel runs, and bounded cleanup tests passed. | closed |
| T-08-03 | Information disclosure | test env/logs | high | mitigate | Generated in-memory secrets, redacted captured output, and raw password/database/session log scans passed. | closed |
| T-08-04 | Elevation of privilege | architecture boundary | high | mitigate | Structural gate rejects forbidden Web ownership, public server addresses, frozen-host commands, and tracked credentials; known-bad fixtures passed. | closed |
| T-08-05 | Denial of service | local test resources | low | accept | Verification is deliberately limited to three small services and one Chromium worker within the declared local resource budget. | closed |

*Status: open · closed · open below `high` threshold (non-blocking). All 33 registered threats are closed.*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---|---|---|---|---|
| AR-01-01 | T-05-04 | Phase 1 requires explicit in-session Slug confirmation but defers durable action audit history to the planned audit capability. | Phase 1 plan and UAT | 2026-08-08 |
| AR-01-02 | T-08-05 | The bounded local verifier may temporarily consume the declared 2-core/4-GB development budget; parallelism and browser workers are deliberately capped. | Phase 1 plan and UAT | 2026-08-08 |

Accepted risks are low severity and do not count toward the `high` blocking threshold.

---

## Security Verification Evidence

| Control Surface | Verification | Result |
|---|---|---|
| Boundary, address, frozen-command, credential, cleanup-name, and log redaction controls | `corepack pnpm test:ops` and `corepack pnpm check:boundaries` | 3/3 negative fixtures and real-tree scan passed |
| Strict public/auth wire contracts | `corepack pnpm --filter @blog-x/contracts test` | 3/3 passed |
| Markdown and URL-protocol safety | `corepack pnpm exec tsx --test apps/api/test/markdown-renderer.test.ts` | 2/2 passed |
| Auth, draft, lifecycle, public visibility, migration interruption, parallel isolation, and browser behavior | `corepack pnpm local:verify -- --full-phase --interruption-check --parallel-check` | passed |
| User acceptance of automated security-relevant behavior | `01-UAT.md` | 29/29 passed, 0 issues |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|---|---:|---:|---:|---|
| 2026-08-08 | 33 | 33 | 0 | Codex primary agent, GSD inline ASVS L1 audit |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks are documented in the Accepted Risks Log
- [x] `threats_open: 0` confirmed at the configured `high` threshold
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-08-08
