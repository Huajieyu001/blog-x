---
phase: 07
slug: responsive-discovery-experience
status: verified
threats_open: 0
asvs_level: 1
block_on: high
register_authored_at_plan_time: false
audit_mode: retroactive-STRIDE
created: 2026-08-19
---

# Phase 07 — Security

> Retroactive STRIDE verification of the responsive public search and related-reading experience. The audit used the GSD core `secure-phase` workflow through the generic-agent workaround because the typed security-auditor package was unavailable.

## Trust Boundaries

| Boundary | Data crossing | Enforcement |
|----------|---------------|-------------|
| Browser → Next `/search` | Raw URL encoding, duplicate parameters, query text and page | Raw-encoding marker, strict decoded schema, query/page bounds |
| Next proxy → search page | Potentially spoofed encoding marker | Proxy overwrites the marker; missing or non-`valid` markers fail closed |
| Next server → private API | Status, JSON and potentially contradictory DTOs | Server-only origin, strict response schemas and fail-closed outcomes |
| API → PostgreSQL | Search text, pagination and lifecycle state | Parameterized queries, shared public predicate and a two-second statement timeout |
| Stored Markdown → rendered HTML | HTML, event attributes and unsafe protocols | Raw HTML disabled, sanitizer allowlists and protocol checks |
| Public DTO → React/browser | Titles, summaries, taxonomy and related cards | Strict public DTOs, React escaping and source/duplicate filtering |
| Browser runner → child processes/temp root | Timeouts, output growth and cleanup | Isolated process group, output/time caps, TERM/KILL and exact-root cleanup |
| E2E fixture control surface | Test modes and mutable fixture state | Loopback-only binding, finite commands, reset behavior and unknown-command rejection |

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation / evidence | Status |
|-----------|----------|-----------|----------|-------------|-----------------------|--------|
| T-07-R-01 | Spoofing | Browser/API topology | high | mitigate | API origin remains server-only; browser gate asserts requests remain on the generated Web origin (`apps/web/app/lib/api.ts`, `apps/web/e2e/public-discovery.spec.ts`). | closed |
| T-07-R-02 | Spoofing | Raw-search encoding marker | high | mitigate | Proxy overwrites the marker and search discovery rejects missing/invalid markers; unit tests cover spoofed and invalid UTF-8 input. | closed |
| T-07-R-03 | Tampering | Search query boundary | high | mitigate | Strict shared schemas enforce NFC normalization, raw/semantic length caps, one query value and page 1–100; boundary tests cover duplicates and unknown fields. | closed |
| T-07-R-04 | Tampering | Untrusted API response | high | mitigate | Web responses use strict `safeParse`; browser fixtures prove malformed JSON, extra private fields and contradictory pagination fail closed. | closed |
| T-07-R-05 | Tampering | Canonical/noindex metadata | high | mitigate | Public URLs are same-origin and search metadata is derived from trusted outcome state; protocol-relative, backslash and metadata-independence tests pass. | closed |
| T-07-R-06 | Repudiation | Acceptance runner | medium | mitigate | Runner requires a non-zero exact pass count, rejects skip/TODO and statically disallows `.skip`, `.fixme` and `.only`. | closed |
| T-07-R-07 | Information disclosure | Search/related publication filtering | high | mitigate | Search and related queries reuse the published, undeleted, public-time predicate; database tests cover hidden lifecycle states and internal-field exclusion. | closed |
| T-07-R-08 | Information disclosure | Rendered content/XSS | high | mitigate | Raw HTML is disabled and rendered output is sanitized; tests cover scripts, iframe/SVG, event attributes and unsafe protocols. | closed |
| T-07-R-09 | Tampering | Related source/duplicate cards | high | mitigate | The detail page excludes the source and retains only the first card per slug; strict contracts cap the response at four. | closed |
| T-07-R-10 | Denial of service | Search amplification | medium | mitigate | Fixed query/page/result caps, PostgreSQL statement timeout and bounded API rate limiting constrain work. | closed |
| T-07-R-11 | Denial of service | Next → internal API fetch | medium | mitigate | `getPublic` currently has no explicit fetch timeout or response-body byte cap. Add a short abort timeout and edge/API response limits in a later hardening phase. | open — below high threshold |
| T-07-R-12 | Denial of service | Browser verification runner | medium | mitigate | Runner caps output and duration, terminates the isolated process group and verifies generated-origin closure in `finally`. | closed |
| T-07-R-13 | Elevation of privilege | Test fixture control surface | high | mitigate | Fixture binds to loopback, exposes finite discovery controls and returns 400 for unknown commands; browser tests assert rejection. | closed |
| T-07-R-14 | Elevation of privilege | Browser-selected backend | high | mitigate | The browser cannot provide or override `INTERNAL_API_ORIGIN`; server code builds encoded public paths and returns only strict public DTOs. | closed |

*Only open threats at or above `workflow.security_block_on: high` count toward `threats_open`.*

## Accepted Risks Log

No accepted risks.

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Blocking Open | Run By |
|------------|---------------|--------|------|---------------|--------|
| 2026-08-19 | 14 | 13 | 1 medium | 0 | generic-agent workaround, GSD core secure-phase protocol |

## Sign-Off

- [x] Every identified threat has a disposition.
- [x] No accepted risks require documentation.
- [x] `threats_open: 0` confirmed at the configured high threshold.
- [x] `status: verified` set in frontmatter.

**Approval:** verified 2026-08-19
