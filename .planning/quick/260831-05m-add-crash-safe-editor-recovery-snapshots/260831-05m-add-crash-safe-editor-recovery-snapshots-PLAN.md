---
quick: 260831-05m
title: Add crash-safe editor recovery snapshots
status: complete
scope: local-only
requirements: [CONT-04, CMS-009]
---

# Editor recovery snapshots

## Outcome

Unsaved editor changes are copied to a bounded, versioned `sessionStorage` snapshot after a short idle delay. Reloading the same tab offers an explicit restore or discard choice; it never silently writes to or overwrites the article API.

## Tasks

1. Add strict snapshot helpers and focused unit tests for key isolation, size/TTL/schema checks, storage failure, read/write/remove, and bulk logout cleanup.
2. Integrate recovery into `ArticleEditor`: debounce dirty snapshots, explicit accessible restore/discard UI, keep edits made during a manual save, clear only synchronized snapshots, and clear on delete.
3. Clear editor snapshots on explicit logout, cover desktop/mobile reload recovery in browser tests, run typecheck/default/boundary/integration checks, refresh the local preview, review, commit and push `dev`.

## Guardrails

- No API, database, cloud server, production deployment, token, cookie, or credential changes.
- Snapshot article fields only; maximum serialized size 256 KiB, Markdown 200,000 characters, TTL seven days.
- Existing manual save, validation, Slug confirmation, publication lifecycle, sanitized preview, and no-JS behavior remain authoritative.
- Storage denial or quota failure degrades to a visible non-blocking warning and never disables manual saving.
