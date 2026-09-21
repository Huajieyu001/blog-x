---
phase: 14
slug: post-launch-security-and-content-recovery
status: verified
threats_open: 0
asvs_level: 1
created: 2026-09-21
---

# Phase 14 — Security

> ASVS L1 verification of the plan-authored STRIDE register. No production or server operation was used.

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser → Next ingress | Pages, API rewrites, and media share one response-policy edge. | Public/admin HTTP responses |
| Administrator browser → password API | Password material enters only an authenticated exact-origin mutation. | Current/new password |
| API → PostgreSQL | Password replacement, session revocation, and audit append are atomic. | Hash, session state, audit metadata |
| Administrator browser → deleted APIs | Deleted metadata and restore mutations require administrator authority. | Content identity and lifecycle metadata |
| Deleted row → public projections | Restore moves the retained row directly to a non-public draft. | Article lifecycle and slug identity |

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation evidence | Status |
|-----------|----------|-----------|----------|-------------|---------------------|--------|
| T-14-01-01 | Tampering | CSP resource policy | high | mitigate | `next.config.ts`, `server.mjs`, layout and browser tests enforce production self/none directives and exclude `unsafe-eval`. | closed |
| T-14-01-02 | Information Disclosure | Referrer/framework headers | medium | mitigate | Strict referrer policy and `poweredByHeader: false` are asserted in source tests. | closed |
| T-14-01-03 | Elevation of Privilege | Frame embedding | high | mitigate | CSP `frame-ancestors 'none'` and `X-Frame-Options: DENY` are applied at both Next and custom ingress. | closed |
| T-14-01-04 | Spoofing | HTTPS downgrade | high | mitigate | One-year HSTS with subdomains is present at the shared ingress and covered by regression tests. | closed |
| T-14-01-05 | Denial of Service | Over-restrictive CSP | high | mitigate | Environment-specific HMR allowance, production build, and canonical browser coverage prove compatibility. | closed |
| T-14-01-SC | Tampering | Package supply chain | high | mitigate | Phase implementation added no dependency or lockfile change. | closed |
| T-14-02-01 | Spoofing | `POST /auth/password` | high | mitigate | Session-first exact-Origin guard, bounded limiter, strict JSON policy, and unsafe-route inventory are tested. | closed |
| T-14-02-02 | Information Disclosure | Logger/response/audit/UI | critical | mitigate | Logger redaction, strict contracts, field-name-only audit metadata, and negative secret assertions are present. | closed |
| T-14-02-03 | Tampering | Password/session/audit transaction | critical | mitigate | Locked administrator transaction and forced-audit-failure rollback tests cover hash, sessions, and audit. | closed |
| T-14-02-04 | Elevation of Privilege | Old sessions after rotation | critical | mitigate | Successful rotation revokes all active sessions, clears the current cookie, and old-token tests return 401. | closed |
| T-14-02-05 | Denial of Service | Argon2 endpoint | medium | mitigate | Authenticated-only access, 8 KiB body limit, bounded limiter, and 1024-character input caps are enforced. | closed |
| T-14-02-06 | Repudiation | Password rotation audit | high | mitigate | Dedicated `auth.password.changed` self-target event is enforced across contracts, repository, database, and UI. | closed |
| T-14-02-07 | Tampering | Audit constraint migration | high | mitigate | Migration, schema checks, ledger verifier, and compatibility tests retain password and prior audit authority. | closed |
| T-14-02-SC | Tampering | Package supply chain | high | mitigate | Existing Argon2 dependency was reused without manifest or lockfile changes. | closed |
| T-14-03-01 | Information Disclosure | `GET /admin/deleted-posts` | critical | mitigate | Authentication precedes a strict metadata-only projection; tests reject content-bearing fields and preserve public 404. | closed |
| T-14-03-02 | Elevation of Privilege | `POST .../restore` | high | mitigate | Session-first exact-Origin guard, strict empty body, content-type checks, and bounded limiter are exercised. | closed |
| T-14-03-03 | Tampering | Deleted-to-draft transition | critical | mitigate | `FOR UPDATE`, one transaction, concurrency tests, and forced-audit rollback prevent partial restoration. | closed |
| T-14-03-04 | Tampering | Slug reservation | high | mitigate | Restore updates only the retained row's lifecycle columns; tests prove the original slug remains reserved. | closed |
| T-14-03-05 | Repudiation | Restore audit | medium | mitigate | Transaction-scoped `article.updated` records actor, target, and fixed deleted-to-draft metadata without content. | closed |
| T-14-03-SC | Tampering | Package supply chain | high | mitigate | Recovery work added no dependency, manifest, or lockfile change. | closed |

## Accepted Risks Log

No accepted risks.

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-21 | 20 | 20 | 0 | Codex, GSD secure-phase fallback |

## Sign-Off

- [x] All threats have a disposition.
- [x] No accepted risk requires documentation.
- [x] `threats_open: 0` confirmed at ASVS L1.
- [x] `status: verified` set in frontmatter.

**Approval:** verified 2026-09-21
