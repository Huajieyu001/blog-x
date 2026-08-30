---
phase: quick
plan: "260830-w04-expose-rss-subscription-in-public-naviga"
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/app/_components/PublicHeader.tsx
  - apps/web/e2e/public-shell.spec.ts
  - apps/web/e2e/public-discovery.spec.ts
autonomous: true
requirements: []
---

# Quick Task: Expose RSS Subscription

## Objective

Make the existing same-origin `/rss.xml` feed discoverable from the shared public navigation on desktop, mobile, keyboard, and no-JavaScript paths.

## Tasks

1. Add failing browser assertions for the ordered “订阅” link, exact `/rss.xml` target, mobile/no-JavaScript visibility, keyboard order, and successful RSS response.
2. Add one native same-origin RSS anchor to `PublicHeader`, then run focused Web tests, typecheck, default tests, boundary audit, and diff checks.

## Constraints

- Reuse the existing feed; add no service, dependency, database, analytics, email, or server operation.
- Keep the current responsive menu and search behavior intact.
- Production remains `BLOCKED`; only the local preview may be refreshed after commit.
