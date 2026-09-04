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

## Milestone: v1.1 — Content Discovery

**Shipped:** 2026-09-04
**Phases:** 3 | **Plans:** 24 | **Tasks:** 40

### What Was Built

- 仅公开内容的中英文全文搜索、稳定分页与可解释排序。
- 基于分类和标签的确定性相关阅读，配套手机、平板和桌面端界面。
- 固定 `3100` 的离线优先本地交付、完整验收、不可变收据和后继提交复验。

### What Worked

- 公开数据投影和严格合同让搜索、相关阅读与 SEO 保持同一隐私边界。
- 生成端口的浏览器门禁与固定展示环境分离，既能隔离验收，又能证明用户所见版本。
- 独立审查在归档前发现了 UAT 后继收据 allowlist 缺口，并通过回归先行完成修复。

### What Was Inefficient

- 本地交付证据经历了多次编号方案与 allowlist 收紧，导致后期计划偏多。
- 历史集成测试的自启动责任分散，直到 Phase 8 才收敛为单一 fixture owner。
- 部分规划文档的状态与实际代码完成时间不同步，增加了归档核对成本。

### Patterns Established

- 默认测试只包含零基础设施套件，完整集成套件只由一个封装的生成环境协调器执行。
- 每个清洁完整 Git SHA 拥有唯一不可变交付收据，后继文档修改只能通过有限路径复验。
- 本地完成、发布证据和生产授权始终是三个独立事实。

### Key Lessons

1. 收据验证器必须覆盖完整关闭链路，包括 UAT 和验证文档的后继提交。
2. 测试清单和执行 owner 需要从第一天就建立机器可验证的完整性约束。
3. 大步骤交付必须同时给出源码修订、可见运行时和完整收据三种证据。

### Cost Observations

- Model mix: GSD planner、executor、reviewer 与 verifier 多 Agent 协作。
- Sessions: 跨多个连续开发会话。
- Notable: 审查与收据收紧增加了返工，但关闭了静默漏测和不安全后继验证的风险。

---

## Milestone: v1.2 — Publishing Quality

**Shipped:** 2026-09-05
**Phases:** 2 | **Plans:** 4 | **Tasks:** 11

### What Was Built

- 已发布文章页从严格公开投影输出唯一、安全且与可见内容一致的七字段 `BlogPosting` JSON-LD。
- 管理员可在响应式后台预约、改期和取消草稿发布，JavaScript 与无脚本路径都保持同一 UTC 时刻和正确目标日期时区。
- 有界 DB-only 任务用 PostgreSQL 时间、稳定顺序和 `FOR UPDATE SKIP LOCKED` 并发安全地发布到期草稿；所有公开表面在到期前严格不可见。

### What Worked

- 先用独立深度审查暴露时区、恢复运行时和数据库元数据权威缺口，再用小型测试先行 quick tasks 逐项关闭，最终复审为零问题。
- 固定 `local:deliver` 将 reviewed implementation SHA、57 个生成集成结果、17 个响应式浏览器结果和实际 `3100` 镜像绑定为一份不可变收据。
- 数据库时间、行锁、公开投影和便携恢复各自只有一个权威，减少了跨层隐式推断。

### What Was Inefficient

- 初次执行摘要保留了过期的浏览器 fixture 阻塞与网络移交状态，直到里程碑收尾才统一回写最终证据。
- 恢复验证曾复用父环境的 Web 构建与 Compose 权威，导致当前源码和旧缓存合同混合；需要两轮 quick task 才完整隔离。
- GSD quick summary 的 `status: complete` 元数据有两处遗漏，造成里程碑审计误报未完成任务。

### Patterns Established

- 预约时间由完整的“本地墙钟时间 + 目标日期数值偏移”组成，SSR、hydration、无脚本和 DST 场景必须往返同一 UTC instant。
- 定时发布命令必须显式提供 1–100 的有界 limit，在连接数据库前拒绝任何其他参数。
- 恢复验证必须为自身 loopback origin 构建 Web 产物，并在结束时证明精确容器、卷与临时路径均已消失。

### Key Lessons

1. 日期时区测试必须覆盖目标日期的 DST，而不能使用“今天”的偏移代替未来日期权威。
2. 通过 `down` 命令不等于清理完成；隔离验收需要独立证明资源不存在并保留主错误与清理错误。
3. 计划、摘要、审查、交付收据和固定运行时必须在里程碑收尾时收敛到同一实现修订。

### Cost Observations

- Model mix: GSD planner、executor、reviewer、verifier 与并行只读审计 Agent。
- Sessions: 一个长时间自主 Goal 跨多轮持续推进。
- Notable: 主要成本来自完整生成环境和恢复/并发验证，但换来了 74/74 的修订绑定证据及零遗留实现缺口。

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 5 | 26 | 从功能验收演进到真实执行收据，并新增大步骤后本地展示更新规则 |
| v1.1 | 3 | 24 | 引入不可变修订收据、集成测试单 owner 与后继提交复验 |
| v1.2 | 2 | 4 | 将数据库时间、目标日期时区、并发发布和恢复运行时收敛为单一可验证权威 |

### Cumulative Quality

| Milestone | Final Gate | Receipt | Production Decision |
|-----------|------------|---------|---------------------|
| v1.0 | 503/503 | 30 actual result records | BLOCKED |
| v1.1 | 66/66 final acceptance | immutable per-revision receipt | BLOCKED |
| v1.2 | 74/74 final acceptance | reviewed-revision immutable receipt | BLOCKED |

### Top Lessons (Verified Across Milestones)

1. 用户可见环境更新必须和代码完成、自动化验收同等对待。
2. 生产授权永远不能由本地成功或自动化流程隐式推导。
3. 跨环境恢复与排期时间必须绑定自己的运行时/目标日期权威，不能继承调用者的隐式状态。
