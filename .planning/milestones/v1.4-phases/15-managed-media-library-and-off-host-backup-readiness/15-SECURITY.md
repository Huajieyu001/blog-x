---
phase: 15
slug: managed-media-library-and-off-host-backup-readiness
status: verified
threats_open: 0
asvs_level: 1
created: 2026-09-22
---

# Phase 15 — Security

> ASVS L1 verification of the plan-authored threat register. All verification used generated local authorities; no server, production destination, credential, or network backup target was used.

## Threat Register

| Threat ID | Severity | Mitigation evidence | Status |
|---|---|---|---|
| T15-01-1 | high | `media-service.ts` counts article, cover, About, and settings owners in the delete transaction; generated media tests prove private/deleted/repeated references return an opaque 409. | closed |
| T15-01-2 | high | Media deletion obtains a deterministic advisory lock and row update lock; writers validate retained rows under conflicting row locks. Commit `774a091` adds a direct save/delete race and the sealed Phase 15 media gate passed. | closed |
| T15-01-3 | high | The existing administrator mutation guard, exact Origin policy, strict ID parser, body policy, and stable 404/409/503 responses remain enforced by route and generated API tests. | closed |
| T15-01-4 | high | Catalogue contracts expose public derivative metadata and counts only; errors and audit metadata exclude content, keys, and filesystem paths, with negative assertions in `media.test.ts`. | closed |
| T15-02-1 | high | The browser never grants deletion authority; a server 409 retains the card and confirmation context. `media.spec.ts` passed in the sealed Phase 15 media gate. | closed |
| T15-02-2 | high | Reuse selects retained same-origin `/media/<uuid>` references and preserves per-use alt/decorative input; generated browser coverage passed. | closed |
| T15-02-3 | high | Strict response schemas, count-only cards, generated fixtures, and storage-path negative assertions prevent protected content or storage disclosure. | closed |
| T15-03-1 | high | External profiles accept only fixed/generated owner-restricted non-link paths; result and alert records are typed and redacted. Production backup tests passed 23/23. | closed |
| T15-03-2 | high | Verified mount identity, authenticated encryption, fixed APIs, and ciphertext/receipt-only transfer reject plaintext and shell/remote-command authority. | closed |
| T15-03-3 | high | Retention validates generated paths, complete receipts, maximum sets, and minimum known-good count before exact deletion. | closed |
| T15-03-4 | high | Recovery accepts only authenticated complete sets and generated database/media/browser namespaces; formal delivery exercised the backup/restore and browser restore suites. | closed |
| T15-03-5 | high | Every pipeline outcome writes bounded redacted result/alert evidence; injected failure tests prove failures cannot report healthy. | closed |

## Accepted Risks

No accepted application-security risks. A real off-host profile, mount, key, and alert destination remain an explicit operator provisioning gate; production release stays `BLOCKED` until those external authorities are configured and checked.

## Sign-off

- Threats: 12 total, 12 closed, 0 open.
- Dependencies, schema, migrations, credentials, and production infrastructure were not changed.
- Fixed local delivery passed 113/113 at `d447a3a3c0af5dccbc119b5d81ee23b19490f3fc`; the later `774a091` change is test-only and passed the sealed Phase 15 media gate.

