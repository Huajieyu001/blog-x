# Blog X

## What This Is

Blog X 是一套面向个人长期使用的自托管博客系统。访客可以在手机和桌面端快速阅读、发现与订阅公开文章；博主可以通过单管理员后台使用 Markdown 创建、预览、发布、下线、归档和迁移内容。

开发阶段以前端与入口的本地替代环境配合一台 2C4G Ubuntu 副服务器完成。备案审查结束且用户明确解除冻结后，前台与 HTTPS 入口才会部署到绑定 `huajieyu001.top` 的 2C2G 主服务器，后端与数据库继续由副服务器承载。

## Core Value

博主能够可靠地发布和保存 Markdown 内容，访客能够持续、快速地通过博客域名阅读已发布文章。

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] 访客可浏览首页文章列表、文章详情、分类、标签、归档和关于页面。
- [ ] 文章详情正确渲染 Markdown、代码块、表格、图片和标题目录。
- [ ] 前台适配移动端和桌面端，支持浅色/深色主题及友好错误页。
- [ ] 单一管理员可安全登录后台并管理文章、草稿、分类、标签和页面。
- [ ] 管理员可上传受校验的图片，并维护文章固定链接、摘要、封面和发布时间等元数据。
- [ ] 已发布内容进入公开列表、RSS、Sitemap 和分享元数据；草稿及下线内容不会泄露。
- [ ] 文章 Markdown 原文、元数据、数据库和媒体文件均可备份、导出、迁移和恢复。
- [ ] 浏览器仅使用同域入口，不直接访问副服务器 IP；数据库不暴露公网。
- [ ] 系统适配 2C2G + 2C4G 低资源节点，具备进程自恢复、日志轮转和基本监控能力。
- [ ] 开发、测试、生产配置隔离，敏感凭据不进入 Git。

### Out of Scope

- 多作者与复杂角色权限 — 首期只有一个管理员。
- 用户社区、论坛、私信和即时聊天 — 偏离个人内容发布的核心价值。
- 会员、付费阅读和订单 — 首期无商业化目标。
- 个性化推荐算法 — 数据规模和收益不足以支撑复杂度。
- Kubernetes、微服务集群和多地域高可用 — 超出两台低配置服务器的合理运维范围。
- 视频与大文件托管 — 带宽和存储成本不可控，后续单独评估。
- 自建评论、邮件订阅和私密文章 — 需求尚未确认，且会显著扩大安全与合规范围。

## Context

- 已有 Hexo 博客源码和已发布站点快照存放在本地 `backups/`，可作为后续内容迁移来源。
- 原始需求基线位于仓库根目录 `REQUIREMENTS.md`，基础设施约定见 `docs/INFRASTRUCTURE.md`。
- 主服务器为 CentOS 7、2C2G，绑定博客域名，目前显示包含备案号的整改维护页。
- 副服务器为 Ubuntu、2C4G、无域名，计划承载 API、数据库、后台任务及备份；具体系统状态尚待只读核验。
- 两台服务器是否具备可用私网尚未确认；若无私网，正式上线前必须建立受限且加密的节点间连接。
- 当前仓库尚无应用代码，是绿地项目；先交付可本地运行的纵向 MVP，再逐步扩展。
- 未决产品问题（评论、统计深度、私密内容、图片规模、精确 RPO/RTO）不得阻塞 P0 博客闭环，统一作为后续决策项处理。

## Constraints

- **生产冻结**: 在用户明确解除前，不得连接、部署或修改主服务器 `47.99.80.8` — 备案信息正在等待监管审查。
- **开发拓扑**: 本地工作区暂代主服务器进行前台、入口和端到端验证 — 避免生产变更并支持快速迭代。
- **后端拓扑**: 副服务器 `124.222.91.230` 可用于后端、数据库和备份环境 — 无域名，因此浏览器不得直接依赖其公网地址。
- **资源**: 正式环境只有 2C2G + 2C4G — 避免重型搜索、微服务和常驻高内存组件。
- **安全**: 密码、私钥、令牌和数据库凭据不得写入仓库；数据库不得暴露公网 — 降低凭据泄漏与数据攻击风险。
- **内容持久性**: 正文、元数据、媒体和配置必须可导出、备份并完成恢复验证 — 博客内容是长期资产。
- **兼容性**: 前台必须适配现代移动端与桌面浏览器，并通过同一博客域名提供页面、API 和媒体 — 保持访问链路简单一致。
- **上线门禁**: 主服务器解除冻结、生产备份与回滚方案、节点间安全网络均验证通过后才能部署正式站点 — 避免影响备案审查和生产可用性。

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 使用纵向 MVP 方式开发 | 尽早形成“登录—写作—发布—阅读”的可验证闭环 | — Pending |
| 本地暂代主服务器 | 满足监管审查冻结，同时继续前台与入口开发 | — Pending |
| 副服务器承担持久化与后台服务 | 利用 2C4G 资源并避免主服务器承载数据库 | — Pending |
| 浏览器只访问同域入口 | 不要求副服务器绑定域名，减少 CORS 与公网暴露 | — Pending |
| 首期单管理员、无评论 | 控制认证、审核、反垃圾和隐私范围 | — Pending |
| P0 形成首个发布版本，P1 功能后续增量交付 | 保持 MVP 可在低资源环境中尽早上线 | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `$gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `$gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-05 after initialization*
