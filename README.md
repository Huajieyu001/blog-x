# Blog X

Blog X 是一个面向个人写作的全栈博客。当前 Phase 2 已覆盖管理员登录与发布生命周期、分类和标签、归档与关于页、同源图片、文章目录，以及自动适配电脑、平板和手机的公开阅读界面与主题。

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

## 一条命令完成 Phase 2 验收

```bash
corepack pnpm local:verify -- --phase2-full
```

该命令生成独立的数据库、Compose 命名空间、媒体卷、管理员密码和 Web 端口；随后验证并发迁移与数据保留、最终数据库约束、API/安全回归，以及单一 Chromium 管理员到访客旅程。浏览器语义检查和补充截图覆盖 `375×812`、`768×1024` 与 `1280×900`，并额外启动仅监听本机回环地址的故障夹具验证 404、上游故障和重试恢复。无论成功或失败，清理都只允许命中本次校验过的命名空间与媒体卷。

需要同时模拟迁移中断并验证两个隔离项目并行运行时：

```bash
corepack pnpm local:verify -- --phase2-full --interruption-check --parallel-check
```

只验证容器、迁移恢复和并行隔离时：

```bash
corepack pnpm local:verify -- --infrastructure-only --interruption-check --parallel-check
```

Phase 2 的规范验收完全使用本地基础设施：不会连接、探测或部署到任何云服务器，不会请求 CDN 或第三方服务，也没有远程回退路径。当前开发期间两台服务器均不属于验收执行面。

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

生产拓扑与冻结约束记录在 [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md)，但不属于 Phase 2 的执行路径。
