# Phase 2: Complete Reading Experience - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-08
**Phase:** 2-complete-reading-experience
**Mode:** GSD `--auto`; recommended defaults selected from existing requirements, Phase 1 decisions, codebase constraints, and low-resource deployment targets.
**Areas discussed:** Content organization and discovery, Article table of contents, Media upload and delivery, Responsive theme and recovery states

---

## Content Organization and Discovery

| Decision | Options considered | Selected |
|----------|--------------------|----------|
| Article taxonomy cardinality | One optional category + many tags; many categories + many tags; tags only | One optional category + many tags ✓ |
| Public browsing shape | Dedicated indexes and paginated listings; homepage filters; one combined discovery page | Dedicated indexes and paginated listings ✓ |
| Archive shape | Year/month groups; flat pagination; calendar grid | Year/month groups ✓ |
| Taxonomy deletion | Block while associated; detach silently; cascade article removal | Block while associated ✓ |
| About maintenance | Admin singleton Markdown; special article slug; repository file | Admin singleton Markdown ✓ |

**Selection source:** Auto-selected recommended defaults.
**Notes:** These choices preserve Phase 1's explicit pagination, publication-only visibility, stable URLs, and single safe renderer.

---

## Article Table of Contents

| Decision | Options considered | Selected |
|----------|--------------------|----------|
| Included headings | h2+h3; h1–h4; h2 only | h2+h3 ✓ |
| Responsive placement | Sticky desktop + collapsible mobile; always inline; floating overlay | Sticky desktop + collapsible mobile ✓ |
| Current section | Progressive highlight; static links only; scroll progress bar | Progressive highlight ✓ |
| Anchor availability | Server-rendered IDs; client-only IDs | Server-rendered IDs ✓ |

**Selection source:** Auto-selected recommended defaults.
**Notes:** Stable anchor links work without JavaScript; current-section highlighting is optional enhancement.

---

## Media Upload and Delivery

| Decision | Options considered | Selected |
|----------|--------------------|----------|
| Accepted files | JPEG/PNG/WebP ≤5 MiB; include GIF/SVG; JPEG/PNG ≤2 MiB | JPEG/PNG/WebP ≤5 MiB ✓ |
| Validation | Signature + decode + dimension/resource limits; MIME only | Full server-side validation ✓ |
| Processing | Retain protected source + normalized public derivative; unchanged original only; full rendition set | Source + one normalized derivative ✓ |
| Public naming | Immutable random ID; original filename; PostgreSQL binary | Immutable random ID ✓ |
| Delivery | Same-origin `/media`; direct secondary-server URL | Same-origin `/media` ✓ |

**Selection source:** Auto-selected recommended defaults.
**Notes:** The storage interface must allow a later move to the secondary server without rewriting article Markdown URLs.

---

## Responsive Theme and Recovery States

| Decision | Options considered | Selected |
|----------|--------------------|----------|
| Theme modes | Light/dark/system; light/dark; system only | Light/dark/system ✓ |
| Preference application | Persist and apply before paint; apply after hydration; no persistence | Persist before paint ✓ |
| Mobile navigation | Compact accessible menu; wrapping links; bottom navigation | Compact accessible menu ✓ |
| Error semantics | Distinct 404 and service error; generic error; always 404 | Distinct states ✓ |

**Selection source:** Auto-selected recommended defaults.
**Notes:** The visual system remains editorial and content-first; all critical navigation remains keyboard accessible.

## the agent's Discretion

- Exact CSS tokens, responsive breakpoints, copy, subtle motion, image library internals, and active-heading implementation.
- Implementation choices must remain compatible with 2C2G/2C4G resource limits and existing Next/Fastify/PostgreSQL boundaries.

## Deferred Ideas

- Automatic orphan-media cleanup belongs with Phase 4 operations and backup safety.
- Responsive image rendition sets, CDN delivery, and format negotiation wait for measured need.
