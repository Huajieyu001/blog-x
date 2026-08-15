# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — Local MVP

**Shipped:** 2026-08-15  
**Phases:** 5 | **Plans:** 26 | **Tasks:** 56

### What Was Built

- Next.js、Fastify 与 PostgreSQL 组成的完整 Markdown 写作、发布、阅读和管理闭环。
- 响应式公共阅读、分类标签、归档、关于页、目录、主题、媒体、SEO、RSS 与可迁移导出。
- 低资源安全边界、完整集备份恢复、非循环发布门禁和绑定真实执行结果的最终验收收据。

### What Worked

- 纵向切片和一次只收紧一个权威边界，使功能、测试和部署拓扑可以逐阶段验证。
- 隔离的生成环境、严格结果解析和独立 verifier 能发现“测试看似通过但证据不真实”的问题。
- 主服务器冻结与本地 readiness/生产 authority 分离，避免开发进度转化成未经授权的线上操作。

### What Was Inefficient

- 长期运行的 `3100` 展示容器没有随大步骤更新，导致已完成的代码对用户不可见。
- Phase 5 的收据证据经历多轮 gap closure；最初静态校验没有覆盖所有声明的 fixture 和竞态测试。
- Docker 构建依赖 Corepack registry，网络异常时缺少正式的离线刷新入口。

### Patterns Established

- 所有公开数据统一消费 published-only projection，所有浏览器资源统一走博客同源入口。
- 关键证据采用实现提交、receipt-only 提交、later audit 提交的可审计顺序。
- 每个大步骤完成后必须更新固定 `blogxlocal` 环境、迁移数据库、健康检查并验证 `3100`。

### Key Lessons

1. 验收环境通过不等于用户正在看的环境已经更新；可见部署必须成为阶段完成条件。
2. 并发安全声明必须有确定性的跨进程 barrier 测试，不能依赖轮询或时序运气。
3. 本地成功、生产配置和生产授权是三种不同事实，文档与代码都必须保持分离。

### Cost Observations

- Model mix: 多模型 GSD planner/executor/verifier 协作。
- Sessions: 跨多个连续开发会话。
- Notable: 独立验证增加了返工，但关闭了合成收据和锁恢复证据缺口。

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 5 | 26 | 从功能验收演进到真实执行收据，并新增大步骤后本地展示更新规则 |

### Cumulative Quality

| Milestone | Final Gate | Receipt | Production Decision |
|-----------|------------|---------|---------------------|
| v1.0 | 503/503 | 30 actual result records | BLOCKED |

### Top Lessons (Verified Across Milestones)

1. 用户可见环境更新必须和代码完成、自动化验收同等对待。
2. 生产授权永远不能由本地成功或自动化流程隐式推导。
