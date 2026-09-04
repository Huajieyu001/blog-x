# Phase 8: Reliable Local Delivery - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-19
**Phase:** 08-reliable-local-delivery
**Areas discussed:** 固定命令与端口所有权, 离线构建与种子镜像, 数据保护与失败回滚, 验收分层与修订收据

The user previously instructed GSD decision points to use all recommended choices and requested uninterrupted autonomous progress. The recommended option in each question below was selected under that standing instruction; no new product scope was inferred.

---

## Fixed Command and Port Authority

| Decision | Options considered | Selected |
|----------|--------------------|----------|
| Command authority | Fixed no-argument command; common overrides; general deployment CLI | Fixed no-argument command ✓ |
| Invocation timing | Explicit major-step refresh; every-commit hook; background watcher | Explicit major-step refresh ✓ |
| Port conflict | Fail on unknown owner; kill owner; choose another port | Fail on unknown owner ✓ |
| Source state | Clean committed SHA; include dirty changes; ignore Git state | Clean committed SHA ✓ |
| Operator output | Concise actionable summary; raw logs; exit code only | Concise actionable summary ✓ |

**Rationale:** Fixed authority and explicit invocation preserve user control while making the result deterministic enough for GSD to run after each major step.

---

## Offline Build and Seed Images

| Decision | Options considered | Selected |
|----------|--------------------|----------|
| Registry behavior | Strict offline; online fallback; always online | Strict offline ✓ |
| Missing seed | Fail before mutation with remediation; auto-pull; copy host dependencies | Fail before mutation ✓ |
| Cache authority | Lock digest + immutable seed ID + neutral store; labels only; attempt build directly | Full binding ✓ |
| Public origin | Fixed `127.0.0.1:3100`; ambient env; runtime injection | Fixed origin ✓ |

**Rationale:** Offline must be provable, not best-effort. An implicit network fallback would make the same command nondeterministic and fail exactly when registry DNS is unavailable.

---

## Data Preservation and Failure Recovery

| Decision | Options considered | Selected |
|----------|--------------------|----------|
| Data volumes | Exact reuse and verification; create as needed; reset before refresh | Exact reuse and verification ✓ |
| Migration order | After builds/before cutover; container startup; after cutover | After builds/before cutover ✓ |
| Recovery | Immutable API/Web rollback; Compose down/up; no automatic rollback | Immutable API/Web rollback ✓ |
| Concurrency | Durable revision claim; wait in queue; overwrite prior result | Durable revision claim ✓ |

**Rationale:** PostgreSQL/media are long-lived user assets. The refresh may replace serving images, but it must never trade recoverability for convenience or pretend destructive database rollback is safe.

---

## Layered Acceptance and Revision Receipt

| Decision | Options considered | Selected |
|----------|--------------------|----------|
| Feature acceptance | Isolated full matrix + read-only fixed smoke; mutate fixed DB; fixed-only checks | Layered acceptance ✓ |
| Fixed runtime proof | Revision/runtime facts; HTTP 200 only; health only | Revision/runtime facts ✓ |
| Success evidence | Atomic non-overwriting receipt; console only; overwrite latest JSON | Atomic receipt ✓ |
| Final feedback | Revision, URL, routes and receipt; raw logs; silent code | Actionable completion summary ✓ |

**Rationale:** Phase 6/7 behaviors require rich fixtures, but the canonical local database may hold user content. The isolated layer proves feature completeness; the fixed layer proves that the current commit is what the user can actually open on port 3100.

## Codex Discretion

- Exact package command name and internal module split.
- Receipt field naming and bounded timeout constants.
- Concise terminal formatting, provided it includes revision, URL, route result and evidence location.

## Deferred Ideas

- Production/cloud deployment and server operations remain frozen.
- CI/CD and registry publishing are future capabilities.
- Internal API fetch timeout/body-size hardening remains separate from local delivery.
