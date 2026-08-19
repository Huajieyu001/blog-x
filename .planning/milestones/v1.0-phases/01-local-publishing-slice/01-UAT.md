---
status: complete
phase: 01-local-publishing-slice
source:
  - 01-01-SUMMARY.md
  - 01-02-SUMMARY.md
  - 01-03-SUMMARY.md
  - 01-04-SUMMARY.md
  - 01-05-SUMMARY.md
  - 01-06-SUMMARY.md
  - 01-07-SUMMARY.md
  - 01-08-SUMMARY.md
started: 2026-08-08T05:38:13Z
updated: 2026-08-08T06:19:27Z
---

## Current Test

[testing complete]

## Tests

### 1. Phase 1 自动化验收证据确认
expected: 确认下列 28 项自动化证据可作为 Phase 1 的最终验收记录。
result: pass

### 2. 冷启动、迁移、种子与首页健康
expected: 全新隔离命名空间可从零启动，完成迁移和种子后返回健康首页。
result: pass
source: automated
coverage_id: cold-start

### 3. 单管理员不透明 HttpOnly 会话
expected: 环境种子管理员可通过不透明 HttpOnly 会话认证。
result: pass
source: automated
coverage_id: 01-01:D1

### 4. Fastify 与 PostgreSQL 发布链路
expected: 认证管理员可将 Markdown 通过 Fastify 持久化到 PostgreSQL。
result: pass
source: automated
coverage_id: 01-01:D2

### 5. SSR 首页与固定链接读取同一文章
expected: 首页和固定链接读取同一持久化已发布文章。
result: pass
source: automated
coverage_id: 01-01:D3

### 6. 固定链接安全渲染 Markdown
expected: 固定链接展示经净化的 Markdown 与真实标题。
result: pass
source: automated
coverage_id: 01-01:D4

### 7. 本地 tracer 不依赖云服务器
expected: tracer 只使用本地地址且未连接云服务器。
result: pass
source: automated
coverage_id: 01-01:D5

### 8. 独立 Web、API 与 contracts 工作区
expected: 三个包具有独立类型检查、构建和最窄依赖边界。
result: pass
source: automated
coverage_id: 01-02:D1

### 9. 严格共享请求响应契约
expected: 登录、发布、列表和详情契约拒绝畸形或内部字段。
result: pass
source: automated
coverage_id: 01-02:D2

### 10. 抽取包后完整 tracer 保持可用
expected: 登录、发布、SSR 列表和固定链接仍可用。
result: pass
source: automated
coverage_id: 01-02:D3

### 11. 会话轮换、过期、撤销与日志保密
expected: 会话可轮换、过期和撤销，凭据及 token 不进入日志。
result: pass
source: automated
coverage_id: 01-03:D1

### 12. 浏览器认证生命周期
expected: 错误登录、正确登录、刷新、过期、退出和撤销重放均受服务端控制。
result: pass
source: automated
coverage_id: 01-03:D2

### 13. 认证边界后的原始发布 tracer
expected: 加入认证边界后原始登录至公开阅读路径仍通过。
result: pass
source: automated
coverage_id: 01-03:D3

### 14. 草稿完整元数据与 Slug 保留
expected: 草稿元数据及 Markdown 往返数据库，保留行持续占用 Slug 且不公开。
result: pass
source: automated
coverage_id: 01-04:D1

### 15. 未保存安全预览
expected: 未保存预览不持久化、移除恶意内容，并与公开渲染共用管线。
result: pass
source: automated
coverage_id: 01-04:D2

### 16. 浏览器编辑器字段与响应式输入保持
expected: 所有字段可保存重开，手动 Slug、竞态预览、校验错误和窄屏输入行为正确。
result: pass
source: automated
coverage_id: 01-04:D3

### 17. 完整生命周期状态表
expected: 草稿、发布、下线和删除动作显式、事务化、认证且受来源校验。
result: pass
source: automated
coverage_id: 01-05:D1

### 18. 发布时间、Slug 与软删除持久化规则
expected: 首次发布时间、显式更正、Slug 确认与可恢复软删除规则成立。
result: pass
source: automated
coverage_id: 01-05:D2

### 19. 可见控件完成文章生命周期
expected: 浏览器控件从草稿走到软删除，发布时间保持且 Slug 变更需确认。
result: pass
source: automated
coverage_id: 01-05:D3

### 20. 公开列表一致性与确定性分页
expected: 列表和计数共享公开谓词，固定页大小且并列顺序稳定。
result: pass
source: automated
coverage_id: 01-06:D1

### 21. SSR 首页卡片与无障碍分页
expected: 首页显示公开元数据和可键盘使用的显式分页，不在浏览器额外拉取列表。
result: pass
source: automated
coverage_id: 01-06:D2

### 22. 下一次导航立即反映可见性
expected: 发布、下线、重发和删除会在下一次公开导航立即反映。
result: pass
source: automated
coverage_id: 01-06:D3

### 23. 单一受限 Markdown 渲染器
expected: GFM 与代码高亮正常，脚本、事件、样式和危险协议被移除。
result: pass
source: automated
coverage_id: 01-07:D1

### 24. 公开详情字段与统一 404
expected: 详情只暴露公开字段，草稿、下线、删除和未知 Slug 不可区分。
result: pass
source: automated
coverage_id: 01-07:D2

### 25. 桌面与窄屏技术文章阅读
expected: 固定链接在桌面和窄屏展示元数据及受控代码/表格溢出。
result: pass
source: automated
coverage_id: 01-07:D3

### 26. 隔离本地拓扑与恢复并行安全
expected: Web、API、PostgreSQL 可健康启动，迁移中断可恢复，并行命名空间互不干扰。
result: pass
source: automated
coverage_id: 01-08:D1

### 27. 单一浏览器全发布闭环
expected: 随机管理员通过可见控件完成所有元数据与生命周期动作。
result: pass
source: automated
coverage_id: 01-08:D2

### 28. 完整分页、安全永久链接与隐藏状态
expected: 公开卡片、精确分页、安全 Markdown 和所有隐藏状态在同一旅程得到证明。
result: pass
source: automated
coverage_id: 01-08:D3

### 29. 仓库、日志与部署边界门禁
expected: 日志无秘密，Web 不越权，浏览器及文档命令不指向云服务器。
result: pass
source: automated
coverage_id: 01-08:D4

## Summary

total: 29
passed: 29
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
