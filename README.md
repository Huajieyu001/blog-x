# Blog X

Blog X 是一个面向个人写作的全栈博客。当前本地 v1 已覆盖管理员登录与发布生命周期、分类和标签、归档与关于页、同源图片、文章目录、响应式公开阅读、分发与 Markdown 导出，以及完整备份和隔离恢复。

## 本地前置条件

- Node.js 24.15 或更高版本，并启用 Corepack。
- 可运行 Linux 容器的 Docker Engine，以及 `docker-compose` 命令。
- 至少 4 GB 可用内存；完整验收只启动 Web、API、PostgreSQL 和一个 Chromium worker。

首次准备：

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm exec playwright install chromium
cp .env.example .env
```

`.env` 只用于普通本地开发，不得提交真实凭据。完整验收会自行生成随机管理员密码、数据库名、Compose 命名空间和 Web 端口，并且不会打印这些秘密。

## 一条命令完成本地 Phase 1–4 验收

```bash
corepack pnpm local:verify -- --phase4-full --interruption-check --parallel-check
```

该命令先检查本地依赖树、固定基础镜像、已有验证镜像和依赖安装缓存，不完整时离线失败，不尝试 registry 回退。随后在生成的数据库、Compose 命名空间、媒体卷、管理员密码和回环 Web 端口中执行 Phase 1–3 数据库/API/浏览器回归、Phase 4 安全与进程恢复、原子完整备份、隔离恢复数据库/媒体/浏览器等价性，以及发布证据门禁。无论成功、失败或中断，清理都只允许命中本次已校验的生成目标。

较窄的 Phase 2 阅读体验回归仍可单独运行：

```bash
corepack pnpm local:verify -- --phase2-full
```

只验证容器、迁移恢复和并行隔离时：

```bash
corepack pnpm local:verify -- --infrastructure-only --interruption-check --parallel-check
```

Phase 4 的规范验收完全使用 Docker/Colima、文件系统和回环流量：不会连接、探测或部署到任何云服务器，不会请求 CDN、证书服务或第三方监控，也没有远程回退路径。最终输出中的本地通过不代表生产授权；仓库发布状态必须继续为 `RELEASE BLOCKED`，直到未来用户明确解除冻结并提供全部新鲜生产证据。

## 手动启动与检查

需要在浏览器中持续查看页面时，可以使用固定且独立的 `blogxlocal` Compose 项目：

```bash
docker-compose -p blogxlocal -f compose.yaml up -d --build postgres
docker-compose -p blogxlocal -f compose.yaml run --rm api corepack pnpm --filter @blog-x/api db:migrate
docker-compose -p blogxlocal -f compose.yaml run --rm api corepack pnpm --filter @blog-x/api db:schema:verify
export ADMIN_USERNAME=local-admin
export ADMIN_PASSWORD=choose-a-long-random-local-password
docker-compose -p blogxlocal -f compose.yaml run --rm -e ADMIN_USERNAME -e ADMIN_PASSWORD api corepack pnpm --filter @blog-x/api db:seed
docker-compose -p blogxlocal -f compose.yaml up -d --wait api web
curl --fail http://127.0.0.1:3100/api/health
```

随后访问 [http://127.0.0.1:3100](http://127.0.0.1:3100)。只有 Web 的 `3100` 端口绑定到本机回环地址；API 和 PostgreSQL 仅位于 Compose 内部网络。

日常停止服务并保留数据库卷：

```bash
docker-compose -p blogxlocal -f compose.yaml down --remove-orphans
```

再次启动时可重复执行迁移；迁移带有 PostgreSQL advisory lock，并应收敛到唯一账本记录。普通停止不删除数据卷。

## 常用开发检查

```bash
corepack pnpm -r typecheck
corepack pnpm -r build
corepack pnpm check:boundaries
corepack pnpm test:ops
```

## 常见问题

- Docker 无法拉取镜像：先确认 Docker 运行时已启动，并且运行时内部 DNS 能解析镜像仓库；修复网络后直接重跑同一验收命令。
- Chromium 缺失：重新执行 `corepack pnpm exec playwright install chromium`。
- `3100` 被占用：规范验收会自动选择空闲端口；手动模式可设置 `BLOG_X_WEB_PORT` 后重新启动。
- 上次验收被中断：直接重跑规范命令。每次运行使用独立命名空间，清理范围不会扩展到其他 Compose 项目。

本地运维与恢复见 [docs/OPERATIONS.md](docs/OPERATIONS.md)，未来 STOP/GO 证据流程见 [docs/RELEASE-GATE.md](docs/RELEASE-GATE.md)，回滚决策见 [docs/ROLLBACK.md](docs/ROLLBACK.md)。[docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md) 仅保留历史与目标上下文，不能作为当前生产证据。
