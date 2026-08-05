<!-- GSD:project-start source:PROJECT.md -->

## Project

**Blog X**

Blog X 是一套面向个人长期使用的自托管博客系统。访客可以在手机和桌面端快速阅读、发现与订阅公开文章；博主可以通过单管理员后台使用 Markdown 创建、预览、发布、下线、归档和迁移内容。

开发阶段以前端与入口的本地替代环境配合一台 2C4G Ubuntu 副服务器完成。备案审查结束且用户明确解除冻结后，前台与 HTTPS 入口才会部署到绑定 `huajieyu001.top` 的 2C2G 主服务器，后端与数据库继续由副服务器承载。

**Core Value:** 博主能够可靠地发布和保存 Markdown 内容，访客能够持续、快速地通过博客域名阅读已发布文章。

### Constraints

- **生产冻结**: 在用户明确解除前，不得连接、部署或修改主服务器 `47.99.80.8` — 备案信息正在等待监管审查。
- **开发拓扑**: 本地工作区暂代主服务器进行前台、入口和端到端验证 — 避免生产变更并支持快速迭代。
- **后端拓扑**: 副服务器 `124.222.91.230` 可用于后端、数据库和备份环境 — 无域名，因此浏览器不得直接依赖其公网地址。
- **资源**: 正式环境只有 2C2G + 2C4G — 避免重型搜索、微服务和常驻高内存组件。
- **安全**: 密码、私钥、令牌和数据库凭据不得写入仓库；数据库不得暴露公网 — 降低凭据泄漏与数据攻击风险。
- **内容持久性**: 正文、元数据、媒体和配置必须可导出、备份并完成恢复验证 — 博客内容是长期资产。
- **兼容性**: 前台必须适配现代移动端与桌面浏览器，并通过同一博客域名提供页面、API 和媒体 — 保持访问链路简单一致。
- **上线门禁**: 主服务器解除冻结、生产备份与回滚方案、节点间安全网络均验证通过后才能部署正式站点 — 避免影响备案审查和生产可用性。

<!-- GSD:project-end -->

<!-- GSD:stack-start source:STACK.md -->

## Technology Stack

Technology stack not yet documented. Will populate after codebase mapping or first phase.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `$gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `$gsd-debug` for investigation and bug fixing
- `$gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `$gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
